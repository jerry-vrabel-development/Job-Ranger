/**
 * The D1 layer: reads boards and postings, and writes a sync plan. The rules
 * are in src/lib/jobs/sync.ts; this file only stores what the plan says.
 *
 * Writes are batched as a few statements per board (postings travel as JSON
 * and are unpacked with json_each), so a board with hundreds of jobs stays
 * well inside D1's per-run query limits.
 */
import { isSource, type Board, type Pay, type Workplace } from '#lib/jobs/posting.ts';
import { NO_FILTER, type JobFilter } from '#lib/jobs/filter.ts';
import { normalizeSql } from '#lib/jobs/interest-match.ts';
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

/** A text column, checked: a bad row fails loudly. */
export function text(row: Row, column: string): string {
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

/** A count from a query (COUNT(*) always gives one), checked like any stored value. */
export function count(row: Row | null | undefined, column: string): number {
	const value = row?.[column];
	if (typeof value !== 'number') throw new StoredDataError(`${column} is not a count`);
	return value;
}

/** The rows of one statement in a batch (D1 gives one result per statement). */
export function rowsOf(result: D1Result<Row> | undefined): Row[] {
	if (result === undefined) throw new StoredDataError('a query in the batch gave no result');
	return result.results;
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
 * boards lead). Paused boards are skipped. The limit keeps one run inside the Workers subrequest limit;
 * boards past it are first in line the next day.
 */
export async function listBoardsToFetch(db: D1Database, limit: number): Promise<Board[]> {
	const { results } = await db
		.prepare(
			`SELECT source, token, company FROM boards WHERE paused = 0
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

/**
 * Records how a board's fetch went. The note is ours (counts or an error
 * kind), never page text. After a good read, pass `openJobs` to record the
 * day's open-job count too, in the same round trip (last of the day wins).
 * A failed read records no count: unknown is not zero.
 */
export async function recordFetch(
	db: D1Database,
	board: Board,
	now: string,
	ok: boolean,
	note: string,
	openJobs?: number
): Promise<void> {
	const statements = [
		db
			.prepare(
				`UPDATE boards SET last_fetched_at = ?1, last_fetch_ok = ?2, last_fetch_note = ?3
				 WHERE source = ?4 AND token = ?5`
			)
			.bind(now, ok ? 1 : 0, note, board.source, board.token)
	];
	if (ok && openJobs !== undefined) {
		statements.push(
			db
				.prepare(
					`INSERT INTO board_counts (source, board, day, open_jobs) VALUES (?1, ?2, ?3, ?4)
					 ON CONFLICT (source, board, day) DO UPDATE SET open_jobs = excluded.open_jobs`
				)
				.bind(board.source, board.token, now.slice(0, 10), openJobs)
		);
	}
	await db.batch(statements);
}

/** Postings on boards that aren't paused. */
const ACTIVE = `EXISTS (SELECT 1 FROM boards b
	WHERE b.source = p.source AND b.token = p.board AND b.paused = 0)`;

/** Title and team, ready for whole-word matching (see interest-match.ts). */
const TITLE_WORDS = normalizeSql('p.title');
const TEAM_WORDS = normalizeSql('p.department');

/** LIKE treats % and _ as wildcards; a search for "50%" means the characters 50%. */
function likePattern(word: string): string {
	return `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * The WHERE clause for open postings on active boards that match a filter,
 * with its values. Every value is bound, never written into the SQL.
 */
function openWhere(filter: JobFilter): { sql: string; values: unknown[] } {
	const clauses = ['p.closed_at IS NULL', ACTIVE];
	const values: unknown[] = [];
	const bind = (value: unknown) => {
		values.push(value);
		return `?${String(values.length)}`;
	};
	for (const word of filter.words) {
		const like = bind(likePattern(word));
		clauses.push(
			`(p.title LIKE ${like} ESCAPE '\\' OR p.department LIKE ${like} ESCAPE '\\'` +
				` OR p.location LIKE ${like} ESCAPE '\\' OR p.company LIKE ${like} ESCAPE '\\')`
		);
	}
	if (filter.board) {
		clauses.push(
			`p.source = ${bind(filter.board.source)} AND p.board = ${bind(filter.board.token)}`
		);
	}
	if (filter.workplace) clauses.push(`p.workplace = ${bind(filter.workplace)}`);
	if (filter.onlyNew) clauses.push('p.seen_at IS NULL');
	if (filter.interest) {
		const id = bind(filter.interest.id);
		const either = [
			`EXISTS (SELECT 1 FROM board_interests t WHERE t.interest_id = ${id}` +
				' AND t.source = p.source AND t.board = p.board)'
		];
		for (const keyword of filter.interest.keywords) {
			const like = bind(likePattern(` ${keyword} `));
			either.push(
				`${TITLE_WORDS} LIKE ${like} ESCAPE '\\'`,
				`${TEAM_WORDS} LIKE ${like} ESCAPE '\\'`
			);
		}
		clauses.push(`(${either.join(' OR ')})`);
	}
	return { sql: clauses.join(' AND '), values };
}

/** Open postings on active boards that match the filter, newest first (by posting date, then when we first saw them). */
export async function listOpenPostings(
	db: D1Database,
	filter: JobFilter = NO_FILTER,
	limit = LIST_LIMIT
): Promise<StoredPosting[]> {
	const where = openWhere(filter);
	const { results } = await db
		.prepare(
			`SELECT p.* FROM postings p WHERE ${where.sql}
			 ORDER BY p.posted_at DESC NULLS LAST, p.first_seen_at DESC, p.company, p.title, p.id
			 LIMIT ?${String(where.values.length + 1)}`
		)
		.bind(...where.values, limit)
		.all<Row>();
	return results.map(toStoredPosting);
}

/** How many open postings on active boards match the filter (the list itself stops at LIST_LIMIT). */
export async function countOpenPostings(
	db: D1Database,
	filter: JobFilter = NO_FILTER
): Promise<number> {
	const where = openWhere(filter);
	const row = await db
		.prepare(`SELECT COUNT(*) AS n FROM postings p WHERE ${where.sql}`)
		.bind(...where.values)
		.first<Row>();
	return count(row, 'n');
}

export interface BoardStatus extends Board {
	readonly lastFetchedAt: string | null;
	/** null until the first fetch. */
	readonly lastFetchOk: boolean | null;
	readonly lastFetchNote: string | null;
	readonly paused: boolean;
	/** Open postings on this board, paused or not. */
	readonly openJobs: number;
}

const STATUS_SQL = `SELECT b.source, b.token, b.company, b.last_fetched_at, b.last_fetch_ok,
	b.last_fetch_note, b.paused,
	(SELECT COUNT(*) FROM postings p
	 WHERE p.source = b.source AND p.board = b.token AND p.closed_at IS NULL) AS open_jobs
	FROM boards b`;

function toBoardStatus(row: Row): BoardStatus {
	const ok = numberOrNull(row, 'last_fetch_ok');
	const paused = numberOrNull(row, 'paused');
	if (paused !== 0 && paused !== 1) throw new StoredDataError('paused is not 0 or 1');
	return {
		source: source(row),
		token: text(row, 'token'),
		company: text(row, 'company'),
		lastFetchedAt: textOrNull(row, 'last_fetched_at'),
		lastFetchOk: ok === null ? null : ok === 1,
		lastFetchNote: textOrNull(row, 'last_fetch_note'),
		paused: paused === 1,
		openJobs: count(row, 'open_jobs')
	};
}

/** Every board with how its last fetch went, by company name. */
export async function listBoardStatus(db: D1Database): Promise<BoardStatus[]> {
	const { results } = await db.prepare(`${STATUS_SQL} ORDER BY b.company, b.token`).all<Row>();
	return results.map(toBoardStatus);
}

/** One board, or null if it isn't on the list. */
export async function findBoard(
	db: D1Database,
	source: Board['source'],
	token: string
): Promise<BoardStatus | null> {
	const row = await db
		.prepare(`${STATUS_SQL} WHERE b.source = ?1 AND b.token = ?2`)
		.bind(source, token)
		.first<Row>();
	return row === null ? null : toBoardStatus(row);
}

/** Adds a board. Returns false if it was already on the list (nothing changes then). */
export async function insertBoard(db: D1Database, board: Board): Promise<boolean> {
	const result = await db
		.prepare(
			`INSERT INTO boards (source, token, company) VALUES (?1, ?2, ?3)
			 ON CONFLICT (source, token) DO NOTHING`
		)
		.bind(board.source, board.token, board.company)
		.run();
	return result.meta.changes === 1;
}

/** Pauses or resumes a board. Returns its company name, or null if it isn't on the list. */
export async function setPaused(
	db: D1Database,
	source: Board['source'],
	token: string,
	paused: boolean
): Promise<string | null> {
	const row = await db
		.prepare('UPDATE boards SET paused = ?1 WHERE source = ?2 AND token = ?3 RETURNING company')
		.bind(paused ? 1 : 0, source, token)
		.first<Row>();
	return row === null ? null : text(row, 'company');
}

export interface DayCount {
	readonly day: string;
	readonly openJobs: number;
}

/** A board's daily open-job counts, oldest first. */
export async function listCounts(
	db: D1Database,
	source: Board['source'],
	token: string
): Promise<DayCount[]> {
	const { results } = await db
		.prepare(
			'SELECT day, open_jobs FROM board_counts WHERE source = ?1 AND board = ?2 ORDER BY day'
		)
		.bind(source, token)
		.all<Row>();
	return results.map((row) => ({ day: text(row, 'day'), openJobs: count(row, 'open_jobs') }));
}

/**
 * Renames a board's company, on the board and on every posting stored for it,
 * in one transaction. Returns the old name, or null if the board isn't on the list.
 */
export async function renameBoard(
	db: D1Database,
	source: Board['source'],
	token: string,
	company: string
): Promise<string | null> {
	const before = await db
		.prepare('SELECT company FROM boards WHERE source = ?1 AND token = ?2')
		.bind(source, token)
		.first<Row>();
	if (before === null) return null;
	await db.batch([
		db
			.prepare('UPDATE boards SET company = ?1 WHERE source = ?2 AND token = ?3')
			.bind(company, source, token),
		db
			.prepare('UPDATE postings SET company = ?1 WHERE source = ?2 AND board = ?3')
			.bind(company, source, token)
	]);
	return text(before, 'company');
}

/**
 * Removes a board and everything stored for it (the postings go with it, by
 * the foreign key's cascade), in one transaction. Returns the company name and
 * how many postings went, or null if the board wasn't on the list.
 */
export async function removeBoard(
	db: D1Database,
	source: Board['source'],
	token: string
): Promise<{ company: string; jobs: number } | null> {
	const [counted, removed] = await db.batch<Row>([
		db
			.prepare('SELECT COUNT(*) AS n FROM postings WHERE source = ?1 AND board = ?2')
			.bind(source, token),
		db
			.prepare('DELETE FROM boards WHERE source = ?1 AND token = ?2 RETURNING company')
			.bind(source, token),
		// History and tags have no foreign key to boards (migrations 0007, 0008), so they go explicitly.
		db.prepare('DELETE FROM board_counts WHERE source = ?1 AND board = ?2').bind(source, token),
		db.prepare('DELETE FROM board_interests WHERE source = ?1 AND board = ?2').bind(source, token)
	]);
	const row = removed?.results[0];
	if (row === undefined) return null;
	return { company: text(row, 'company'), jobs: count(counted?.results[0], 'n') };
}

/** Marks every open, new posting on an active board as seen. Returns how many changed. */
export async function markAllSeen(db: D1Database, now: string): Promise<number> {
	const result = await db
		.prepare(
			`UPDATE postings AS p SET seen_at = ?1
			 WHERE p.seen_at IS NULL AND p.closed_at IS NULL AND ${ACTIVE}`
		)
		.bind(now)
		.run();
	return result.meta.changes;
}

/** A row id from a form, or null: digits only, no leading zero, a safe integer. */
export function parseId(value: unknown): number | null {
	if (typeof value !== 'string' || !/^[1-9][0-9]{0,15}$/.test(value)) return null;
	const id = Number(value);
	return Number.isSafeInteger(id) ? id : null;
}
