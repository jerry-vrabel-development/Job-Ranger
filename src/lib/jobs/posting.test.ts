import { describe, expect, it } from 'vitest';
import {
	cleanText,
	httpsUrl,
	isoDate,
	isSource,
	known,
	normaliseToken,
	postingKey
} from './posting.ts';

describe('postingKey', () => {
	it('is the source, board and id together', () => {
		expect(postingKey({ source: 'ashby', board: 'example', id: 'a1' })).toBe('ashby:example:a1');
	});
});

describe('isSource', () => {
	it('knows the sources it has adapters for, and nothing else', () => {
		expect(isSource('ashby')).toBe(true);
		expect(isSource('greenhouse')).toBe(true);
		expect(isSource('lever')).toBe(true);
		expect(isSource('workday')).toBe(false);
		expect(isSource(1)).toBe(false);
	});
});

describe('normaliseToken', () => {
	it('lowercases and trims, since board names ignore case', () => {
		expect(normaliseToken('  Example ')).toBe('example');
	});
});

describe('cleanText', () => {
	it('makes one plain line', () => {
		expect(cleanText('  Senior\n\tEngineer\u0000 ')).toBe('Senior Engineer');
	});

	it('is null for empty or non-text values', () => {
		expect(cleanText('   ')).toBeNull();
		expect(cleanText(42)).toBeNull();
	});

	it('cuts long text with an ellipsis, within the limit', () => {
		const text = cleanText('x'.repeat(50), 10);
		expect(text).toBe(`${'x'.repeat(9)}…`);
		expect(text).toHaveLength(10);
	});
});

describe('httpsUrl', () => {
	it('keeps https links', () => {
		expect(httpsUrl(' https://jobs.ashbyhq.com/a ')).toBe('https://jobs.ashbyhq.com/a');
	});

	it('refuses anything else', () => {
		for (const value of ['http://a.example', 'javascript:alert(1)', 'nope', '', null, 3]) {
			expect(httpsUrl(value)).toBeNull();
		}
	});
});

describe('isoDate', () => {
	it('normalises a date-time to UTC ISO', () => {
		expect(isoDate('2026-11-12T10:00:00-05:00')).toBe('2026-11-12T15:00:00.000Z');
	});

	it('is null for anything that is not a date', () => {
		expect(isoDate('soon')).toBeNull();
		expect(isoDate('')).toBeNull();
		expect(isoDate(undefined)).toBeNull();
	});
});

describe('known', () => {
	const map = { Remote: 'remote' };

	it('finds only the map’s own words', () => {
		expect(known(map, 'Remote')).toBe('remote');
		expect(known(map, 'remote')).toBeUndefined();
		expect(known(map, 'constructor')).toBeUndefined();
		expect(known(map, '__proto__')).toBeUndefined();
		expect(known(map, 'hasOwnProperty')).toBeUndefined();
		expect(known(map, 7)).toBeUndefined();
		expect(known(map, undefined)).toBeUndefined();
	});
});
