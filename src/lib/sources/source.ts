import type { Board, Posting, Source } from '#lib/jobs/posting.ts';
import { SITE } from '#lib/site.ts';

/** Why a posting on a board was left out. Counted, so a silent drop never hides. */
export type SkipReason = 'no-apply-link' | 'missing-id' | 'missing-title' | 'unlisted';

export interface BoardResult {
	readonly postings: readonly Posting[];
	readonly skipped: Readonly<Record<SkipReason, number>>;
}

/** One job board API. Each adapter turns its board's response into Postings. */
export interface JobSource {
	readonly source: Source;
	/** The public URL that lists a board's postings. */
	boardUrl(token: string): string;
	/** Turns a response body into postings. Throws SourceFormatError if the shape has changed. */
	parse(body: unknown, board: Board): BoardResult;
}

/** The response isn't the shape we know: fail loudly rather than show half a board. */
export class SourceFormatError extends Error {
	override readonly name = 'SourceFormatError';
}

/** The board answered with an error status (404 usually means a wrong board name). */
export class SourceHttpError extends Error {
	override readonly name = 'SourceHttpError';
	constructor(readonly status: number) {
		super(status === 404 ? 'Board not found (404)' : `Board answered ${String(status)}`);
	}
}

export function noneSkipped(): Record<SkipReason, number> {
	return { 'no-apply-link': 0, 'missing-id': 0, 'missing-title': 0, unlisted: 0 };
}

/** How long one board may take before we give up on it for today. */
export const FETCH_TIMEOUT_MS = 15_000;

/** Says who is asking, so a board's owner can see it's a polite once-a-day reader. */
export const USER_AGENT = `JobRanger/0.1 (+${SITE.repository})`;

/** Reads one board: one GET, no retries (tomorrow's run is the retry). */
export async function fetchBoard(
	adapter: JobSource,
	board: Board,
	fetcher: typeof fetch
): Promise<BoardResult> {
	const response = await fetcher(adapter.boardUrl(board.token), {
		headers: { accept: 'application/json', 'user-agent': USER_AGENT },
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
	});
	if (!response.ok) throw new SourceHttpError(response.status);
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		throw new SourceFormatError('The board did not answer with JSON');
	}
	return adapter.parse(body, board);
}
