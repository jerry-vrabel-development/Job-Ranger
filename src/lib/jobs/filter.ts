/**
 * Filters for the Jobs page. They live in the page's address (?q=…&company=…),
 * so they work without JavaScript, survive a reload and can be bookmarked.
 * Everything read from the address is checked here; anything odd is ignored,
 * never passed on.
 */
import type { InterestMatch } from './interest-match.ts';
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
	/** One active interest, or null for all jobs. */
	readonly interest: InterestMatch | null;
	/** Only saved jobs, only passed ones, or null: every job I haven't passed on. */
	readonly show: Show | null;
}

/** The marks the list can show on their own (design note 0006). */
export type Show = 'saved' | 'passed';

export const NO_FILTER: JobFilter = {
	words: [],
	board: null,
	workplace: null,
	onlyNew: false,
	interest: null,
	show: null
};

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

/**
 * The filter in the address. `interests` are the active ones: an interest id
 * that isn't among them (paused, removed, or made up) is ignored.
 */
export function parseFilter(
	params: URLSearchParams,
	interests: readonly InterestMatch[] = []
): JobFilter {
	const workplace = params.get('workplace');
	const interest = params.get('interest');
	const show = params.get('show');
	return {
		words: searchWords(params.get('q') ?? ''),
		board: parseBoard(params.get('company')),
		workplace: isWorkplace(workplace) ? workplace : null,
		onlyNew: params.get('new') === '1',
		interest: interests.find((each) => String(each.id) === interest) ?? null,
		show: show === 'saved' || show === 'passed' ? show : null
	};
}

export function isFiltered(filter: JobFilter): boolean {
	return (
		filter.words.length > 0 ||
		filter.board !== null ||
		filter.workplace !== null ||
		filter.onlyNew ||
		filter.interest !== null ||
		filter.show !== null
	);
}

/**
 * How the list is ordered: newest first, or best fit first (design note
 * 0008). It's in the address too (?sort=fit), but it isn't a filter: it
 * changes the order, never which jobs or how many.
 */
export type JobOrder = 'newest' | 'fit';

export function parseOrder(params: URLSearchParams): JobOrder {
	return params.get('sort') === 'fit' ? 'fit' : 'newest';
}
