/**
 * A job posting as Job Ranger keeps it, whatever board it came from. Pure
 * types and small helpers, shared by the sources, the daily fetch and the
 * pages.
 */

/** The job boards Job Ranger can read. One adapter each (see src/lib/sources). */
export const SOURCES = ['ashby', 'greenhouse'] as const;
export type Source = (typeof SOURCES)[number];

/**
 * Whether a source's job list includes pay. Ashby's does; Greenhouse's
 * doesn't (pay is only on each job's own page), so a missing pay there means
 * "not in the list", not "not posted".
 */
export const SOURCE_LISTS_PAY: Readonly<Record<Source, boolean>> = {
	ashby: true,
	greenhouse: false
};

export function isSource(value: unknown): value is Source {
	return typeof value === 'string' && (SOURCES as readonly string[]).includes(value);
}

/** A company's job board: which source, the board's name there, and who it is. */
export interface Board {
	readonly source: Source;
	/** The board's name on the source, lowercased (e.g. `example` in jobs.ashbyhq.com/example). */
	readonly token: string;
	/** The company's name as I want to see it. The sources don't all provide one. */
	readonly company: string;
}

/** Where the work happens, as the employer states it. `unknown` when they don't say. */
export type Workplace = 'remote' | 'hybrid' | 'on-site' | 'unknown';

/** Pay exactly as posted. A summary is always kept; numbers only when they're given. */
export interface Pay {
	readonly summary: string;
	readonly min: number | null;
	readonly max: number | null;
	readonly currency: string | null;
	/** As the source words it, e.g. `1 YEAR`. */
	readonly interval: string | null;
}

/** One posting, normalised. Every field comes from the employer's board, never from a model. */
export interface Posting {
	readonly source: Source;
	readonly board: string;
	/** The posting's id on its board. With `source` and `board`, the dedupe key. */
	readonly id: string;
	readonly company: string;
	readonly title: string;
	readonly location: string;
	readonly workplace: Workplace;
	readonly employmentType: string | null;
	readonly department: string | null;
	/** Always present and always https: no apply link, no listing. */
	readonly applyUrl: string;
	readonly jobUrl: string | null;
	/** ISO 8601, when the board says it was (last) published. */
	readonly postedAt: string | null;
	readonly pay: Pay | null;
}

/** The dedupe key: a posting is the same posting if its source, board and id match. */
export function postingKey(posting: Pick<Posting, 'source' | 'board' | 'id'>): string {
	return `${posting.source}:${posting.board}:${posting.id}`;
}

/** Board names are case-insensitive on the sources, so they are kept lowercased. */
export function normaliseToken(token: string): string {
	return token.trim().toLowerCase();
}

/**
 * Plain, single-line text from a board: whitespace collapsed, control
 * characters removed, and cut to a sensible length so a runaway field can't
 * break a page. Returns null when nothing is left.
 */
export function cleanText(value: unknown, maxLength = 300): string | null {
	if (typeof value !== 'string') return null;
	const text = value
		// eslint-disable-next-line no-control-regex -- removing control characters on purpose
		.replace(/[\u0000-\u001f\u007f]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!text) return null;
	return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

/** An https URL, or null. Anything else (http, javascript:, garbage) is refused. */
export function httpsUrl(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	let url: URL;
	try {
		url = new URL(value.trim());
	} catch {
		return null;
	}
	return url.protocol === 'https:' && url.hostname ? url.href : null;
}

/** An ISO date-time if the value parses as one, or null. */
export function isoDate(value: unknown): string | null {
	if (typeof value !== 'string' || !value.trim()) return null;
	const time = Date.parse(value);
	return Number.isNaN(time) ? null : new Date(time).toISOString();
}
