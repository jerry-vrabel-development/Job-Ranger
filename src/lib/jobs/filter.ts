/**
 * Filters for the Jobs page. They live in the page's address (?q=…&company=…),
 * so they work without JavaScript, survive a reload and can be bookmarked.
 * Everything read from the address is checked here; anything odd is ignored,
 * never passed on.
 */
import { isSource, type Source, type Workplace } from './posting.ts';

export const WORKPLACES: readonly Workplace[] = ['remote', 'hybrid', 'on-site', 'unknown'];

/** Longest search kept, and most words searched for. */
export const QUERY_MAX = 100;
export const QUERY_WORDS = 6;

export interface JobFilter {
	/** Words that must all appear in the title, team or location (any case). */
	readonly words: readonly string[];
	/** One company's board, or null for all. */
	readonly board: { readonly source: Source; readonly token: string } | null;
	readonly workplace: Workplace | null;
	readonly onlyNew: boolean;
}

export const NO_FILTER: JobFilter = { words: [], board: null, workplace: null, onlyNew: false };

function isWorkplace(value: unknown): value is Workplace {
	return typeof value === 'string' && (WORKPLACES as readonly string[]).includes(value);
}

/** The search box's words: trimmed, de-duplicated, at most QUERY_WORDS of them. */
export function searchWords(query: string): string[] {
	const words = query
		.slice(0, QUERY_MAX)
		.toLowerCase()
		.split(/\s+/)
		.filter((word) => word !== '');
	return [...new Set(words)].slice(0, QUERY_WORDS);
}

/** A board key as the page writes it: "greenhouse:splice". */
export function boardKeyOf(board: { source: Source; token: string }): string {
	return `${board.source}:${board.token}`;
}

function parseBoard(value: string | null): JobFilter['board'] {
	if (value === null) return null;
	const colon = value.indexOf(':');
	if (colon === -1) return null;
	const source = value.slice(0, colon);
	const token = value.slice(colon + 1);
	if (!isSource(source) || token === '' || token.length > 100) return null;
	return { source, token };
}

export function parseFilter(params: URLSearchParams): JobFilter {
	const workplace = params.get('workplace');
	return {
		words: searchWords(params.get('q') ?? ''),
		board: parseBoard(params.get('company')),
		workplace: isWorkplace(workplace) ? workplace : null,
		onlyNew: params.get('new') === '1'
	};
}

export function isFiltered(filter: JobFilter): boolean {
	return (
		filter.words.length > 0 || filter.board !== null || filter.workplace !== null || filter.onlyNew
	);
}
