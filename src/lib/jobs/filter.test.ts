import { describe, expect, it } from 'vitest';
import {
	boardKeyOf,
	isFiltered,
	NO_FILTER,
	parseFilter,
	QUERY_MAX,
	QUERY_WORDS,
	searchWords
} from './filter.ts';

const params = (query: string) => new URLSearchParams(query);

describe('parseFilter', () => {
	it('reads every filter from the address', () => {
		expect(
			parseFilter(params('q=Firmware++REMOTE&company=lever:BluesInc&workplace=hybrid&new=1'))
		).toEqual({
			words: ['firmware', 'remote'],
			board: { source: 'lever', token: 'BluesInc' },
			workplace: 'hybrid',
			onlyNew: true
		});
	});

	it('means no filter when the address has none', () => {
		expect(parseFilter(params(''))).toEqual(NO_FILTER);
		expect(isFiltered(parseFilter(params('q=%20%20')))).toBe(false);
	});

	it.each([
		'company=workday:x',
		'company=splice',
		'company=greenhouse:',
		`company=greenhouse:${'x'.repeat(101)}`,
		'workplace=moon',
		'workplace=constructor',
		'new=yes'
	])('ignores what it does not know: %s', (query) => {
		expect(parseFilter(params(query))).toEqual(NO_FILTER);
	});

	it('knows when a filter is on', () => {
		expect(isFiltered({ ...NO_FILTER, words: ['a'] })).toBe(true);
		expect(isFiltered({ ...NO_FILTER, board: { source: 'ashby', token: 'suno' } })).toBe(true);
		expect(isFiltered({ ...NO_FILTER, workplace: 'remote' })).toBe(true);
		expect(isFiltered({ ...NO_FILTER, onlyNew: true })).toBe(true);
		expect(isFiltered(NO_FILTER)).toBe(false);
	});
});

describe('searchWords', () => {
	it('lowercases, drops repeats, and keeps a sensible number of words', () => {
		expect(searchWords('  Robot  robot ARM ')).toEqual(['robot', 'arm']);
		const many = Array.from({ length: 10 }, (_, i) => `w${String(i)}`).join(' ');
		expect(searchWords(many)).toHaveLength(QUERY_WORDS);
		expect(searchWords('x'.repeat(QUERY_MAX + 50))[0]).toHaveLength(QUERY_MAX);
	});
});

describe('boardKeyOf', () => {
	it('writes a board as source:token', () => {
		expect(boardKeyOf({ source: 'greenhouse', token: 'splice' })).toBe('greenhouse:splice');
	});
});
