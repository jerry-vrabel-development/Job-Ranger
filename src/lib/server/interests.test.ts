import { describe, expect, it } from 'vitest';
import {
	checkInput,
	KEYWORD_MAX,
	KEYWORDS_MAX,
	NAME_MAX,
	NOTE_MAX,
	parseBoardKey,
	parseId,
	parseKeywords
} from './interests.ts';

describe('parseKeywords', () => {
	it('splits on commas and lines, tidies, lowercases and drops repeats', () => {
		expect(parseKeywords(' Robot, ROBOTICS ,,autonomy\nROS ,robot ')).toEqual({
			ok: true,
			keywords: ['robot', 'robotics', 'autonomy', 'ros']
		});
		expect(parseKeywords('')).toEqual({ ok: true, keywords: [] });
	});

	it('keeps the joiners people use in tech words', () => {
		expect(parseKeywords('c++, c#, .net, e-bike, r&d, machine  learning')).toMatchObject({
			ok: true,
			keywords: ['c++', 'c#', '.net', 'e-bike', 'r&d', 'machine learning']
		});
	});

	it.each([
		['x'.repeat(KEYWORD_MAX + 1), /under 40 characters/],
		['robot; drop table', /can't be a keyword/],
		['-dash', /can't be a keyword/],
		[
			Array.from({ length: KEYWORDS_MAX + 1 }, (_, i) => `w${String(i)}`).join(','),
			/up to 20 keywords/
		]
	])('explains a keyword list it cannot use (%#)', (text, message) => {
		const parsed = parseKeywords(text);
		expect(parsed.ok).toBe(false);
		if (!parsed.ok) expect(parsed.message).toMatch(message);
	});
});

describe('checkInput', () => {
	it('tidies a good interest', () => {
		expect(checkInput('  Drones  and  robots ', ' flying things ', 'drone, uav')).toEqual({
			ok: true,
			input: { name: 'Drones and robots', note: 'flying things', keywords: ['drone', 'uav'] }
		});
	});

	it.each([
		['', '', '', 'name', 'Give the interest a name.'],
		['x'.repeat(NAME_MAX + 1), '', '', 'name', 'Keep the name under 60 characters.'],
		['Ok', 'x'.repeat(NOTE_MAX + 1), '', 'note', 'Keep the note under 300 characters.'],
		['Ok', '', 'bad;word', 'keywords', expect.stringMatching(/can't be a keyword/) as string]
	])('names the field that needs fixing (%#)', (name, note, keywords, field, message) => {
		expect(checkInput(name, note, keywords)).toEqual({ ok: false, field, message });
	});
});

describe('parseBoardKey', () => {
	it('reads a board key for a known source, with that source’s name rules', () => {
		expect(parseBoardKey('greenhouse:splice')).toEqual({ source: 'greenhouse', token: 'splice' });
		expect(parseBoardKey('lever:BluesInc')).toEqual({ source: 'lever', token: 'BluesInc' });
	});

	it.each(['splice', 'workday:x', 'greenhouse:Splice', 'breezy:a.b', 'greenhouse:', 7, null])(
		'refuses %s',
		(value) => {
			expect(parseBoardKey(value)).toBeNull();
		}
	);
});

describe('parseId', () => {
	it('reads a positive whole number, and nothing else', () => {
		expect(parseId('12')).toBe(12);
		for (const bad of [
			'0',
			'-1',
			'1.5',
			'01',
			'x',
			'',
			'9999999999999999',
			'99999999999999999',
			null,
			3
		]) {
			expect(parseId(bad)).toBeNull();
		}
	});
});
