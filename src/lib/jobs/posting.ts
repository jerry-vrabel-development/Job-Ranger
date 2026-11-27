/**
 * A job posting as Job Ranger keeps it, whatever board it came from. Pure
 * types and small helpers, shared by the sources, the daily fetch and the
 * pages.
 */

/** The job boards Job Ranger can read. One adapter each (see src/lib/sources). */
export const SOURCES = ['ashby', 'greenhouse', 'lever', 'breezy'] as const;
export type Source = (typeof SOURCES)[number];

/**
 * Whether a source's job list includes pay. Ashby's does; Greenhouse's
 * doesn't (pay is only on each job's own page), so a missing pay there means
 * "not in the list", not "not posted".
 */
export const SOURCE_LISTS_PAY: Readonly<Record<Source, boolean>> = {
	ashby: true,
	greenhouse: false,
	lever: true,
	breezy: true
};

/** Each source's name as people know it. */
export const SOURCE_NAMES: Readonly<Record<Source, string>> = {
	ashby: 'Ashby',
	greenhouse: 'Greenhouse',
	lever: 'Lever',
	breezy: 'Breezy'
};

export function isSource(value: unknown): value is Source {
	return typeof value === 'string' && (SOURCES as readonly string[]).includes(value);
}

/** A company's job board: which source, the board's name there, and who it is. */
export interface Board {
	readonly source: Source;
	/**
	 * The board's name on the source (e.g. `example` in jobs.ashbyhq.com/example):
	 * lowercased, except on Lever, whose names are case-sensitive.
	 */
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
	/**
	 * A fingerprint of the posting's text ("" when the board sends none), so
	 * the daily fetch can tell when the text changed without reading it back.
	 */
	readonly textHash: string;
}

/** A posting as a board sends it today, with its text (stored apart, design note 0008). */
export interface FetchedPosting extends Posting {
	/** Plain text, at most POSTING_TEXT_MAX characters; "" when the board sends none. */
	readonly text: string;
}

/** The longest posting text kept, the same limit as a kit's pasted text. */
export const POSTING_TEXT_MAX = 30_000;

/**
 * A short fingerprint of a text (FNV-1a, 32 bits, as hex), for noticing a
 * change, not for security. "" for no text.
 */
export function fingerprint(text: string): string {
	if (text === '') return '';
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}

/** A posting's text made plain and kept within the limit; "" when there is none. */
export function postingText(parts: readonly unknown[]): string {
	const text = parts
		.filter((part): part is string => typeof part === 'string')
		.join('\n')
		// eslint-disable-next-line no-control-regex -- removing control characters on purpose
		.replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ')
		.replace(/[ \t]+/g, ' ')
		.replace(/\s*\n\s*/g, '\n')
		.trim();
	return text.length > POSTING_TEXT_MAX ? text.slice(0, POSTING_TEXT_MAX) : text;
}

/** A posting from a board, with its text and the text's fingerprint. */
export function withText(posting: Omit<Posting, 'textHash'>, text: string): FetchedPosting {
	return { ...posting, textHash: fingerprint(text), text };
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

/**
 * The value a source's own word maps to, or undefined. Only the map's own
 * entries count: a board sending "constructor" or "__proto__" gets nothing,
 * not one of JavaScript's built-ins.
 */
export function known<T>(map: Readonly<Record<string, T>>, key: unknown): T | undefined {
	return typeof key === 'string' && Object.hasOwn(map, key) ? map[key] : undefined;
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
