/**
 * The record of each daily run (design note 0011, migration 0022): written by
 * the run as it goes, read by the app to say when a run was missed, didn't
 * finish, or hit a problem.
 */
import type { RunRecord } from '#lib/runs.ts';
import type { FetchSummary } from './daily-fetch.ts';
import { count, numberOrNull, rowsOf, StoredDataError, text, textOrNull } from './db.ts';
import type { ScoringSummary } from './scoring.ts';

type Row = Record<string, unknown>;

/** Rows older than this are deleted when a run starts. */
export const KEEP_RUNS_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Notes the run's start, clears out old rows, and returns the new row's id. */
export async function startRun(
	db: D1Database,
	scheduledAt: Date,
	startedAt: Date
): Promise<number> {
	const cutoff = new Date(startedAt.getTime() - KEEP_RUNS_DAYS * DAY_MS).toISOString();
	const [, inserted] = await db.batch<Row>([
		db.prepare('DELETE FROM runs WHERE started_at < ?1').bind(cutoff),
		db
			.prepare('INSERT INTO runs (scheduled_at, started_at) VALUES (?1, ?2) RETURNING id')
			.bind(scheduledAt.toISOString(), startedAt.toISOString())
	]);
	return count(rowsOf(inserted)[0], 'id');
}

/** The fetch's counts, written as soon as it ends, so a later crash still leaves them. */
export async function recordRunFetch(
	db: D1Database,
	id: number,
	summary: FetchSummary
): Promise<void> {
	await db
		.prepare(
			`UPDATE runs SET boards = ?2, boards_ok = ?3, boards_failed = ?4, added = ?5, closed = ?6,
			 deferred = ?7 WHERE id = ?1`
		)
		.bind(
			id,
			summary.boards,
			summary.ok,
			summary.failed,
			summary.added,
			summary.closed,
			summary.deferred
		)
		.run();
}

/** How scoring went: not set up, ran (with its counts), or threw part way. */
export type RunScoring =
	| { readonly kind: 'off' }
	| { readonly kind: 'ran'; readonly summary: ScoringSummary }
	| { readonly kind: 'failed' }
	| { readonly kind: 'not reached' };

/** Fills in how the run ended. */
export async function finishRun(
	db: D1Database,
	id: number,
	scoring: RunScoring,
	problem: string | null,
	finishedAt: Date
): Promise<void> {
	const ran = scoring.kind === 'ran' ? scoring.summary : null;
	await db
		.prepare(
			`UPDATE runs SET finished_at = ?2, scoring = ?3, scored = ?4, unscored = ?5, waiting = ?6,
			 spent_micros = ?7, stopped = ?8, problem = ?9 WHERE id = ?1`
		)
		.bind(
			id,
			finishedAt.toISOString(),
			scoring.kind === 'not reached' ? null : scoring.kind,
			ran?.scored ?? null,
			ran?.unscored ?? null,
			ran?.waiting ?? null,
			ran?.spentMicros ?? null,
			ran?.stopped ?? null,
			problem
		)
		.run();
}

const SCORING = ['off', 'ran', 'failed'] as const;
const STOPPED = ['cap', 'time', 'error'] as const;

/** A stored word from a known list, or null; anything else fails loudly. */
function oneOf<T extends string>(row: Row, column: string, words: readonly T[]): T | null {
	const value = textOrNull(row, column);
	if (value === null) return null;
	const word = words.find((known) => known === value);
	if (word === undefined) throw new StoredDataError(`${column} is not a known word`);
	return word;
}

function toRun(row: Row): RunRecord {
	const boards = numberOrNull(row, 'boards');
	const scoring = oneOf(row, 'scoring', SCORING);
	return {
		id: count(row, 'id'),
		scheduledAt: text(row, 'scheduled_at'),
		startedAt: text(row, 'started_at'),
		finishedAt: textOrNull(row, 'finished_at'),
		fetch:
			boards === null
				? null
				: {
						boards,
						ok: count(row, 'boards_ok'),
						failed: count(row, 'boards_failed'),
						added: count(row, 'added'),
						closed: count(row, 'closed'),
						deferred: count(row, 'deferred')
					},
		scoring,
		scoringCounts:
			scoring === 'ran'
				? {
						scored: count(row, 'scored'),
						unscored: count(row, 'unscored'),
						waiting: count(row, 'waiting'),
						spentMicros: count(row, 'spent_micros'),
						stopped: oneOf(row, 'stopped', STOPPED)
					}
				: null,
		problem: textOrNull(row, 'problem')
	};
}

/** The newest runs first. */
export async function recentRuns(db: D1Database, limit: number): Promise<RunRecord[]> {
	const { results } = await db
		.prepare('SELECT * FROM runs ORDER BY started_at DESC, id DESC LIMIT ?1')
		.bind(limit)
		.all<Row>();
	return results.map(toRun);
}
