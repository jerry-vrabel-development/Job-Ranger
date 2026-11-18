/**
 * The daily fetch: read each board once, plan its sync, write it. Boards are
 * read one at a time (polite to the boards, gentle on limits), and one
 * board's failure is recorded against that board without stopping the rest.
 */
import type { Board, Source } from '#lib/jobs/posting.ts';
import { planSync } from '#lib/jobs/sync.ts';
import { ashby } from '#lib/sources/ashby.ts';
import { greenhouse } from '#lib/sources/greenhouse.ts';
import {
	fetchBoard,
	SourceFormatError,
	SourceHttpError,
	type BoardResult,
	type JobSource,
	type SkipReason
} from '#lib/sources/source.ts';
import { listBoardsToFetch, loadBoard, recordFetch, StoredDataError, writePlan } from './db.ts';

export const ADAPTERS: Readonly<Record<Source, JobSource>> = { ashby, greenhouse };

/**
 * Boards per run. Sized for the Workers Paid plan: each board costs one
 * outgoing request and about three D1 queries, well inside the 10,000
 * subrequests a run may make. (The free plan allows 50 outgoing requests and
 * 10 ms of CPU a run, which isn't enough for this job.) Boards past the cap
 * go first the next day.
 */
export const MAX_BOARDS_PER_RUN = 200;

/**
 * Stop starting new boards after this long. A scheduled run may last 15
 * minutes; if boards are slow (each may take up to the fetch timeout), the
 * rest wait for tomorrow, first in line, instead of the run being cut off.
 */
export const TIME_BUDGET_MS = 10 * 60 * 1000;

/** Counts only: no company names, so the logs carry nothing personal. */
export interface FetchSummary {
	/** Boards read this run. */
	readonly boards: number;
	readonly ok: number;
	readonly failed: number;
	readonly added: number;
	readonly closed: number;
	/** Boards left for tomorrow because the run hit its time budget. */
	readonly deferred: number;
}

const SKIP_WORDS: Readonly<Record<SkipReason, string>> = {
	'no-apply-link': 'no apply link',
	'missing-id': 'no id',
	'missing-title': 'no title',
	unlisted: 'unlisted'
};

/** A plain note for the board's status line, e.g. "12 open, 2 new, 1 closed. Left out: 1 no apply link." */
export function successNote(
	open: number,
	added: number,
	closed: number,
	skipped: Readonly<Record<SkipReason, number>>
): string {
	const left = (Object.keys(SKIP_WORDS) as SkipReason[])
		.filter((reason) => skipped[reason] > 0)
		.map((reason) => `${String(skipped[reason])} ${SKIP_WORDS[reason]}`);
	const counts = `${String(open)} open, ${String(added)} new, ${String(closed)} closed.`;
	return left.length > 0 ? `${counts} Left out: ${left.join(', ')}.` : counts;
}

/** What went wrong, in our own words. Never the board's response text. */
export function failureNote(error: unknown): string {
	if (error instanceof SourceHttpError) return error.message;
	if (error instanceof SourceFormatError) return `The board's format changed: ${error.message}`;
	if (error instanceof StoredDataError) return `Stored data problem: ${error.message}`;
	if (error instanceof Error && error.name === 'TimeoutError') return 'The board took too long';
	return 'Something unexpected went wrong';
}

export interface BoardCheck {
	readonly ok: boolean;
	readonly open: number;
	readonly added: number;
	readonly closed: number;
	/** The status line stored for the board. */
	readonly note: string;
}

/** Stores what a board's fetch found, and records the fetch as a success. */
export async function storeResult(
	db: D1Database,
	board: Board,
	result: BoardResult,
	now: string
): Promise<BoardCheck> {
	const plan = planSync(await loadBoard(db, board), result.postings, now);
	await writePlan(db, board, plan, now);
	const open = plan.insert.length + plan.update.length + plan.touch.length;
	const note = successNote(open, plan.insert.length, plan.close.length, result.skipped);
	await recordFetch(db, board, now, true, note);
	return { ok: true, open, added: plan.insert.length, closed: plan.close.length, note };
}

/**
 * Reads one board and stores what it found, the same way the daily fetch
 * does. A failure is recorded against the board and returned, not thrown.
 */
export async function checkBoard(
	db: D1Database,
	board: Board,
	fetcher: typeof fetch,
	now: string
): Promise<BoardCheck> {
	try {
		const result = await fetchBoard(ADAPTERS[board.source], board, fetcher);
		return await storeResult(db, board, result, now);
	} catch (error) {
		const note = failureNote(error);
		await recordFetch(db, board, now, false, note);
		return { ok: false, open: 0, added: 0, closed: 0, note };
	}
}

/**
 * Reads the stalest boards, one at a time, until the cap or the time budget.
 * `clock` is injectable so tests can run out the budget without waiting.
 */
export async function runDailyFetch(
	db: D1Database,
	fetcher: typeof fetch,
	now: Date,
	clock: () => number = Date.now
): Promise<FetchSummary> {
	const stamp = now.toISOString();
	const started = clock();
	const boards = await listBoardsToFetch(db, MAX_BOARDS_PER_RUN);
	let read = 0;
	let ok = 0;
	let added = 0;
	let closed = 0;
	for (const board of boards) {
		if (clock() - started >= TIME_BUDGET_MS) break;
		read += 1;
		const checked = await checkBoard(db, board, fetcher, stamp);
		if (checked.ok) ok += 1;
		added += checked.added;
		closed += checked.closed;
	}
	return { boards: read, ok, failed: read - ok, added, closed, deferred: boards.length - read };
}
