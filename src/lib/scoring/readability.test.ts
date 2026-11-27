import { describe, expect, it } from 'vitest';
import { gradeLevel, syllables } from './readability.ts';

describe('syllables', () => {
	it.each([
		['cat', 1],
		['be', 1],
		['table', 2],
		['making', 2],
		['script', 1],
		['yellow', 2],
		['accessibility', 6],
		['pfft', 1],
		['42', 0]
	])('%s has %i', (word, count) => {
		expect(syllables(word)).toBe(count);
	});
});

describe('gradeLevel', () => {
	it('rates plain short sentences low and dense ones high', () => {
		const plain = gradeLevel('It is a drone job. You know TypeScript. It is in Chicago.');
		const dense = gradeLevel(
			'Comprehensive organizational responsibilities necessitate sophisticated interdisciplinary collaboration capabilities'
		);
		expect(plain).toBeLessThan(4);
		expect(dense).toBeGreaterThan(16);
	});

	it('counts text with no sentence ending as one sentence, and no words as 0', () => {
		expect(gradeLevel('a short line with no end')).toBe(gradeLevel('a short line with no end.'));
		expect(gradeLevel('42 — 17')).toBe(0);
		expect(gradeLevel('Go. Go. Go.')).toBe(0);
	});
});
