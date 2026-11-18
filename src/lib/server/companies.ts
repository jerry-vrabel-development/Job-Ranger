/**
 * What the Companies page does: add a company by its job-board link (checked
 * before it's saved), check a board now, pause, resume and remove. Every
 * answer is a plain sentence for the page; nothing here throws for a person's
 * mistake. The fetcher is passed in so tests never touch the network.
 */
import { isSource, SOURCE_NAMES, type Board, type Source } from '#lib/jobs/posting.ts';
import { isToken, nameFromToken, parseBoardLink } from '#lib/sources/board-link.ts';
import { fetchBoard, SourceHttpError } from '#lib/sources/source.ts';
import { ADAPTERS, checkBoard, failureNote, storeResult } from './daily-fetch.ts';
import { findBoard, insertBoard, removeBoard, renameBoard, setPaused } from './db.ts';

/** Longest company name we keep (the database allows 200). */
export const COMPANY_MAX = 200;

/** Most links in one paste. Boards are read a few at a time, so even slow ones finish well inside a page load. */
export const MAX_LINES = 25;

/** Boards read at the same time while adding. */
export const ADD_CONCURRENCY = 5;

/** How one pasted line went. */
export interface LineResult {
	readonly line: number;
	readonly text: string;
	readonly ok: boolean;
	readonly message: string;
}

export type AddResult =
	/** Nothing was tried: the paste itself needs fixing. */
	| { readonly ok: false; readonly message: string }
	/** Every line was tried. `retry` holds the lines that weren't added, to fix and paste again. */
	| {
			readonly ok: true;
			readonly added: number;
			readonly results: readonly LineResult[];
			readonly retry: string;
	  };

/** A sentence-ready count: "1 open job", "12 open jobs". */
function jobs(count: number, kind = 'open job'): string {
	return `${String(count)} ${kind}${count === 1 ? '' : 's'}`;
}

/** Tidies a typed company name, or explains what's wrong with it. */
function checkName(input: string): { name: string } | { problem: string } {
	const name = input.trim().replace(/\s+/g, ' ');
	if (name === '') return { problem: 'Give the company a name.' };
	if (name.length > COMPANY_MAX) {
		return { problem: `Keep the name under ${String(COMPANY_MAX)} characters.` };
	}
	return { name };
}

/** One pasted line: a link, then optionally a comma and the name to show. */
export function splitLine(text: string): { link: string; name: string | null } {
	const comma = text.indexOf(',');
	if (comma === -1) return { link: text.trim(), name: null };
	const name = text.slice(comma + 1).trim();
	return { link: text.slice(0, comma).trim(), name: name === '' ? null : name };
}

/** Adds one company from one line, checking its board first. */
async function addOne(
	db: D1Database,
	fetcher: typeof fetch,
	text: string,
	now: Date
): Promise<{ ok: boolean; message: string }> {
	const { link, name: typedName } = splitLine(text);
	const parsed = parseBoardLink(link);
	if (!parsed.ok) return { ok: false, message: parsed.message };

	let typed: string | null = null;
	if (typedName !== null) {
		const checked = checkName(typedName);
		if ('problem' in checked) return { ok: false, message: checked.problem };
		typed = checked.name;
	}

	const existing = await findBoard(db, parsed.source, parsed.token);
	if (existing !== null) {
		return { ok: false, message: `Already on your list, as ${existing.company}.` };
	}

	const sourceName = SOURCE_NAMES[parsed.source];
	const fallback = typed ?? nameFromToken(parsed.token);
	let result;
	try {
		result = await fetchBoard(
			ADAPTERS[parsed.source],
			{ source: parsed.source, token: parsed.token, company: fallback },
			fetcher
		);
	} catch (error) {
		return {
			ok: false,
			message:
				error instanceof SourceHttpError && error.status === 404
					? `There's no ${sourceName} board called “${parsed.token}”. Check the spelling in the link.`
					: `Couldn't read that ${sourceName} board: ${failureNote(error)}. Try again later.`
		};
	}

	// A typed name wins; then the board's own name; then one made from the link.
	const company = typed ?? result.companyName ?? fallback;
	const board: Board = { source: parsed.source, token: parsed.token, company };
	if (!(await insertBoard(db, board))) {
		return { ok: false, message: 'Already on your list.' };
	}
	const postings = result.postings.map((posting) => ({ ...posting, company }));
	const stored = await storeResult(db, board, { ...result, postings }, now.toISOString());
	return { ok: true, message: `Added ${company}: ${jobs(stored.open)} found.` };
}

/** Runs `run` over `items`, at most `limit` at a time, keeping the results in order. */
async function inTurn<T, R>(
	items: readonly T[],
	limit: number,
	run: (item: T) => Promise<R>
): Promise<R[]> {
	const out: R[] = [];
	const queue = items.entries();
	async function worker() {
		for (const [index, item] of queue) out[index] = await run(item);
	}
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return out;
}

/**
 * Adds every company in a paste: one job-board link per line, each with an
 * optional ", Name". Each board is read before it's saved; a line that can't
 * be added says why, and the others still go in.
 */
export async function addCompanies(
	db: D1Database,
	fetcher: typeof fetch,
	paste: string,
	now: Date
): Promise<AddResult> {
	const lines = paste
		.split(/\r?\n/)
		.map((text, index) => ({ line: index + 1, text: text.trim() }))
		.filter((entry) => entry.text !== '');
	if (lines.length === 0) {
		return { ok: false, message: 'Paste at least one job board link, one per line.' };
	}
	if (lines.length > MAX_LINES) {
		return {
			ok: false,
			message: `That's ${String(lines.length)} lines. Paste up to ${String(MAX_LINES)} at a time.`
		};
	}

	// The same board twice in one paste is added once.
	const firstLine = new Map<string, number>();
	const results = await inTurn(lines, ADD_CONCURRENCY, async ({ line, text }) => {
		const parsed = parseBoardLink(splitLine(text).link);
		if (parsed.ok) {
			const key = `${parsed.source}:${parsed.token}`;
			const first = firstLine.get(key);
			if (first !== undefined) {
				return { line, text, ok: false, message: `The same board as line ${String(first)}.` };
			}
			firstLine.set(key, line);
		}
		return { line, text, ...(await addOne(db, fetcher, text, now)) };
	});

	return {
		ok: true,
		added: results.filter((result) => result.ok).length,
		results,
		retry: results
			.filter((result) => !result.ok)
			.map((result) => result.text)
			.join('\n')
	};
}

export async function renameCompany(
	db: D1Database,
	source: Source,
	token: string,
	input: string
): Promise<ActionResult> {
	const checked = checkName(input);
	if ('problem' in checked) return { ok: false, message: checked.problem };
	const before = await renameBoard(db, source, token, checked.name);
	if (before === null) return GONE;
	return { ok: true, message: `Renamed ${before} to ${checked.name}.` };
}

/** The board a form names, from its hidden source and token fields. */
export function boardKey(form: FormData): { source: Source; token: string } | null {
	const source = form.get('source');
	const token = form.get('token');
	if (!isSource(source) || !isToken(token)) return null;
	return { source, token };
}

export interface ActionResult {
	readonly ok: boolean;
	readonly message: string;
}

const GONE: ActionResult = {
	ok: false,
	message: 'That company is no longer on your list.'
};

export async function checkNow(
	db: D1Database,
	fetcher: typeof fetch,
	source: Source,
	token: string,
	now: Date
): Promise<ActionResult> {
	const board = await findBoard(db, source, token);
	if (board === null) return GONE;
	if (board.paused) {
		return { ok: false, message: `${board.company} is paused. Resume it to check it.` };
	}
	const checked = await checkBoard(db, board, fetcher, now.toISOString());
	return checked.ok
		? { ok: true, message: `Checked ${board.company}: ${checked.note}` }
		: { ok: false, message: `Couldn't read ${board.company}: ${checked.note}.` };
}

export async function pauseCompany(
	db: D1Database,
	source: Source,
	token: string,
	paused: boolean
): Promise<ActionResult> {
	const company = await setPaused(db, source, token, paused);
	if (company === null) return GONE;
	return paused
		? {
				ok: true,
				message: `Paused ${company}. Its jobs are hidden and it won't be checked until you resume it.`
			}
		: { ok: true, message: `Resumed ${company}. It will be checked every morning again.` };
}

export async function removeCompany(
	db: D1Database,
	source: Source,
	token: string
): Promise<ActionResult> {
	const removed = await removeBoard(db, source, token);
	if (removed === null) return GONE;
	return { ok: true, message: `Removed ${removed.company} and its ${jobs(removed.jobs, 'job')}.` };
}
