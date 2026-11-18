/**
 * What the Companies page does: add a company by its job-board link (checked
 * before it's saved), check a board now, pause, resume and remove. Every
 * answer is a plain sentence for the page; nothing here throws for a person's
 * mistake. The fetcher is passed in so tests never touch the network.
 */
import { isSource, SOURCE_NAMES, type Board, type Source } from '#lib/jobs/posting.ts';
import { isToken, parseBoardLink } from '#lib/sources/board-link.ts';
import { fetchBoard, SourceHttpError } from '#lib/sources/source.ts';
import { ADAPTERS, checkBoard, failureNote, storeResult } from './daily-fetch.ts';
import { findBoard, insertBoard, removeBoard, setPaused } from './db.ts';

/** Longest company name we keep (the database allows 200). */
export const COMPANY_MAX = 200;

export type Field = 'link' | 'company';

export type AddResult =
	| { readonly ok: true; readonly message: string }
	| { readonly ok: false; readonly field: Field; readonly message: string };

/** A sentence-ready count: "1 open job", "12 open jobs". */
function jobs(count: number, kind = 'open job'): string {
	return `${String(count)} ${kind}${count === 1 ? '' : 's'}`;
}

export async function addCompany(
	db: D1Database,
	fetcher: typeof fetch,
	link: string,
	companyInput: string,
	now: Date
): Promise<AddResult> {
	const parsed = parseBoardLink(link);
	if (!parsed.ok) return { ok: false, field: 'link', message: parsed.message };

	const company = companyInput.trim().replace(/\s+/g, ' ');
	if (company === '') {
		return { ok: false, field: 'company', message: 'Give the company a name.' };
	}
	if (company.length > COMPANY_MAX) {
		return {
			ok: false,
			field: 'company',
			message: `Keep the name under ${String(COMPANY_MAX)} characters.`
		};
	}

	const existing = await findBoard(db, parsed.source, parsed.token);
	if (existing !== null) {
		return {
			ok: false,
			field: 'link',
			message: `That board is already on your list, as ${existing.company}.`
		};
	}

	const board: Board = { source: parsed.source, token: parsed.token, company };
	const sourceName = SOURCE_NAMES[board.source];

	// Check before saving: a board that can't be read isn't added.
	let result;
	try {
		result = await fetchBoard(ADAPTERS[board.source], board, fetcher);
	} catch (error) {
		const message =
			error instanceof SourceHttpError && error.status === 404
				? `There's no ${sourceName} board called “${board.token}”. Check the spelling in the link.`
				: `Couldn't read that ${sourceName} board: ${failureNote(error)}. Nothing was added. Try again later.`;
		return { ok: false, field: 'link', message };
	}

	if (!(await insertBoard(db, board))) {
		// Added in another tab between the check and now.
		return { ok: false, field: 'link', message: 'That board is already on your list.' };
	}
	const stored = await storeResult(db, board, result, now.toISOString());
	return { ok: true, message: `Added ${company}: ${jobs(stored.open)} found.` };
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
