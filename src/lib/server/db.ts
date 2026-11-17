/**
 * The D1 layer: reads boards and postings, and writes a sync plan. The rules
 * are in src/lib/jobs/sync.ts; this file only stores what the plan says.
 *
 * Writes are batched as a few statements per board (postings travel as JSON
 * and are unpacked with json_each), so a board with hundreds of jobs stays
 * well inside D1's per-run query limits.
 */
import { isSource, type Board, type Pay, type Workplace } from '#lib/jobs/posting.ts';
import type { StoredPosting, SyncPlan } from '#lib/jobs/sync.ts';

/** At most this many postings per write statement, to keep each statement small. */
export const WRITE_CHUNK = 100;

/** The list page shows at most this many postings. */
export const LIST_LIMIT = 500;

/** Stored data is checked on the way out too: a bad row fails loudly, it isn't shown. */
export class StoredDataError extends Error {
	override readonly name = 'StoredDataError';
}

type Row = Record<string, unknown>;

function text(row: Row, column: string): string {
	const value = row[column];
	if (typeof value !== 'string') throw new StoredDataError(`${column} is not text`);
	return value;
}

function textOrNull(row: Row, column: string): string | null {
	const value = row[column];
	if (value === null || value === undefined) return null;
	if (typeof value !== 'string') throw new StoredDataError(`${column} is not text`);
	return value;
}

function numberOrNull(row: Row, column: string): number | null {
	const value = row[column];
	if (value === null || value === undefined) return null;
	if (typeof value !== 'number') throw new StoredDataError(`${column} is not a number`);
	return value;
}

const WORKPLACES: readonly string[] = ['remote', 'hybrid', 'on-site', 'unknown'];

function workplace(row: Row): Workplace {
	const value = text(row, 'workplace');
	if (!WORKPLACES.includes(value)) throw new StoredDataError('workplace is not known');
	return value as Workplace;
}

function source(row: Row): Board['source'] {
	const value = row['source'];
	if (!isSource(value)) throw new StoredDataError('source is not known');
	return value;
}

function pay(row: Row): Pay | null {
	const summary = textOrNull(row, 'pay_summary');
	if (summary === null) return null;
	return {
		summary,
		min: numberOrNull(row, 'pay_min'),
		max: numberOrNull(row, 'pay_max'),
		currency: textOrNull(row, 'pay_currency'),
		interval: textOrNull(row, 'pay_interval')
	};
}

/** A database row back into a StoredPosting, checking every column. */
export function toStoredPosting(row: Row): StoredPosting {
	const reopenCount = numberOrNull(row, 'reopen_count');
	return {
		source: source(row),
		board: text(row, 'board'),
		id: text(row, 'id'),
		company: text(row, 'company'),
		title: text(row, 'title'),
		location: text(row, 'location'),
		workplace: workplace(row),
		employmentType: textOrNull(row, 'employment_type'),
		department: textOrNull(row, 'department'),
		applyUrl: text(row, 'apply_url'),
		jobUrl: textOrNull(row, 'job_url'),
		postedAt: textOrNull(row, 'posted_at'),
		pay: pay(row),
		firstSeenAt: text(row, 'first_seen_at'),
		lastSeenAt: text(row, 'last_seen_at'),
		closedAt: textOrNull(row, 'closed_at'),
		reopenCount: reopenCount ?? 0,
		seenAt: textOrNull(row, 'seen_at')
	};
}

/**
 * The boards the daily fetch should read, stalest first (never-fetched
 * boards lead). The limit keeps one run inside the Workers subrequest limit;
 * boards past it are first in line the next day.
 */
export async function listBoardsToFetch(db: D1Database, limit: number): Promise<Board[]> {
	const { results } = await db
		.prepare(
			`SELECT source, token, company FROM boards
			 ORDER BY last_fetched_at ASC NULLS FIRST, company, token LIMIT ?1`
		)
		.bind(limit)
		.all<Row>();
	return results.map((row) => ({
		source: source(row),
		token: text(row, 'token'),
		company: text(row, 'company')
	}));
}

/** Everything stored for one board, open or closed. */
export async function loadBoard(db: D1Database, board: Board): Promise<StoredPosting[]> {
	const { results } = await db
		.prepare('SELECT * FROM postings WHERE source = ?1 AND board = ?2')
		.bind(board.source, board.token)
		.all<Row>();
	return results.map(toStoredPosting);
}

/** The JSON each upserted posting travels as. Keys match the columns. */
function toColumns(posting: StoredPosting) {
	return {
		source: posting.source,
		board: posting.board,
		id: posting.id,
		company: posting.company,
		title: posting.title,
		location: posting.location,
		workplace: posting.workplace,
		employment_type: posting.employmentType,
		department: posting.department,
		apply_url: posting.applyUrl,
		job_url: posting.jobUrl,
		posted_at: posting.postedAt,
		pay_summary: posting.pay?.summary ?? null,
		pay_min: posting.pay?.min ?? null,
		pay_max: posting.pay?.max ?? null,
		pay_currency: posting.pay?.currency ?? null,
		pay_interval: posting.pay?.interval ?? null,
		first_seen_at: posting.firstSeenAt,
		last_seen_at: posting.lastSeenAt,
		closed_at: posting.closedAt,
		reopen_count: posting.reopenCount,
		seen_at: posting.seenAt
	};
}

const COLUMNS = Object.keys(
	toColumns({
		source: 'ashby',
		board: '',
		id: '',
		company: '',
		title: '',
		location: '',
		workplace: 'unknown',
		employmentType: null,
		department: null,
		applyUrl: '',
		jobUrl: null,
		postedAt: null,
		pay: null,
		firstSeenAt: '',
		lastSeenAt: '',
		closedAt: null,
		reopenCount: 0,
		seenAt: null
	} satisfies StoredPosting)
);

const KEY = new Set(['source', 'board', 'id']);

// The column list is fixed above, never user input, so building the SQL from it is safe.
const UPSERT_SQL = `INSERT INTO postings (${COLUMNS.join(', ')})
SELECT ${COLUMNS.map((c) => `json_extract(value, '$.${c}')`).join(', ')}
FROM json_each(?1) WHERE true
ON CONFLICT (source, board, id) DO UPDATE SET
${COLUMNS.filter((c) => !KEY.has(c))
	.map((c) => `${c} = excluded.${c}`)
	.join(',\n')}`;

function chunks<T>(items: readonly T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

/** Writes one board's sync plan, all or nothing (a D1 batch is one transaction). */
export async function writePlan(
	db: D1Database,
	board: Board,
	plan: SyncPlan,
	now: string
): Promise<void> {
	const statements: D1PreparedStatement[] = [];
	for (const group of chunks([...plan.insert, ...plan.update], WRITE_CHUNK)) {
		statements.push(db.prepare(UPSERT_SQL).bind(JSON.stringify(group.map(toColumns))));
	}
	for (const ids of chunks(plan.touch, WRITE_CHUNK)) {
		statements.push(
			db
				.prepare(
					`UPDATE postings SET last_seen_at = ?1
					 WHERE source = ?2 AND board = ?3 AND id IN (SELECT value FROM json_each(?4))`
				)
				.bind(now, board.source, board.token, JSON.stringify(ids))
		);
	}
	for (const ids of chunks(plan.close, WRITE_CHUNK)) {
		statements.push(
			db
				.prepare(
					`UPDATE postings SET closed_at = ?1
					 WHERE source = ?2 AND board = ?3 AND closed_at IS NULL
					 AND id IN (SELECT value FROM json_each(?4))`
				)
				.bind(now, board.source, board.token, JSON.stringify(ids))
		);
	}
	if (statements.length > 0) await db.batch(statements);
}

/** Records how a board's fetch went. The note is ours (counts or an error kind), never page text. */
export async function recordFetch(
	db: D1Database,
	board: Board,
	now: string,
	ok: boolean,
	note: string
): Promise<void> {
	await db
		.prepare(
			`UPDATE boards SET last_fetched_at = ?1, last_fetch_ok = ?2, last_fetch_note = ?3
			 WHERE source = ?4 AND token = ?5`
		)
		.bind(now, ok ? 1 : 0, note, board.source, board.token)
		.run();
}

/** Open postings, newest first (by posting date, then when we first saw them). */
export async function listOpenPostings(
	db: D1Database,
	limit = LIST_LIMIT
): Promise<StoredPosting[]> {
	const { results } = await db
		.prepare(
			`SELECT * FROM postings WHERE closed_at IS NULL
			 ORDER BY posted_at DESC NULLS LAST, first_seen_at DESC, company, title, id
			 LIMIT ?1`
		)
		.bind(limit)
		.all<Row>();
	return results.map(toStoredPosting);
}

export interface BoardStatus extends Board {
	readonly lastFetchedAt: string | null;
	/** null until the first fetch. */
	readonly lastFetchOk: boolean | null;
	readonly lastFetchNote: string | null;
}

export async function listBoardStatus(db: D1Database): Promise<BoardStatus[]> {
	const { results } = await db
		.prepare(
			`SELECT source, token, company, last_fetched_at, last_fetch_ok, last_fetch_note
			 FROM boards ORDER BY company, token`
		)
		.all<Row>();
	return results.map((row) => {
		const ok = numberOrNull(row, 'last_fetch_ok');
		return {
			source: source(row),
			token: text(row, 'token'),
			company: text(row, 'company'),
			lastFetchedAt: textOrNull(row, 'last_fetched_at'),
			lastFetchOk: ok === null ? null : ok === 1,
			lastFetchNote: textOrNull(row, 'last_fetch_note')
		};
	});
}

/** Marks every open, new posting as seen. Returns how many changed. */
export async function markAllSeen(db: D1Database, now: string): Promise<number> {
	const result = await db
		.prepare('UPDATE postings SET seen_at = ?1 WHERE seen_at IS NULL AND closed_at IS NULL')
		.bind(now)
		.run();
	return result.meta.changes;
}
