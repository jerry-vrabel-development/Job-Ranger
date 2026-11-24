import { describe, expect, it } from 'vitest';
import {
	byChange,
	dayLabel,
	parseRange,
	points,
	trend,
	trendSummary,
	windowDays,
	type CompanyTrend,
	type DayCount,
	type Trend
} from './trend.ts';

const TODAY = '2026-11-24';
const c = (day: string, openJobs: number): DayCount => ({ day, openJobs });

describe('the window', () => {
	it('reads 30 from the address, and 7 otherwise', () => {
		expect(parseRange('30')).toBe(30);
		expect(parseRange('7')).toBe(7);
		expect(parseRange(null)).toBe(7);
		expect(parseRange('365')).toBe(7);
	});

	it('runs from the start day to today, across a month end', () => {
		expect(windowDays(TODAY, 7)).toEqual([
			'2026-11-17',
			'2026-11-18',
			'2026-11-19',
			'2026-11-20',
			'2026-11-21',
			'2026-11-22',
			'2026-11-23',
			'2026-11-24'
		]);
		const month = windowDays('2026-12-02', 30);
		expect(month).toHaveLength(31);
		expect(month[0]).toBe('2026-11-02');
		expect(month.at(-1)).toBe('2026-12-02');
	});

	it('leaves a gap, not a zero, on a day with no count', () => {
		expect(
			points([c('2026-11-17', 5), c('2026-11-19', 0)], ['2026-11-17', '2026-11-18', '2026-11-19'])
		).toEqual([
			{ day: '2026-11-17', count: 5 },
			{ day: '2026-11-18', count: null },
			{ day: '2026-11-19', count: 0 }
		]);
	});

	it('labels a day by its date, not shifted by a time zone', () => {
		expect(dayLabel('2026-11-20')).toBe('Nov 20');
		expect(dayLabel('2026-12-01')).toBe('Dec 1');
	});
});

describe('a trend', () => {
	it('grows or shrinks only by a real change, said in words with a symbol', () => {
		expect(trend([c('2026-11-17', 62), c(TODAY, 75)], TODAY, 7)).toEqual({
			direction: 'growing',
			change: 13,
			words: '↑ Growing: 62 → 75 open (+13) in 7 days.'
		});
		expect(trend([c('2026-11-17', 75), c(TODAY, 62)], TODAY, 7)).toEqual({
			direction: 'shrinking',
			change: -13,
			words: '↓ Shrinking: 75 → 62 open (−13) in 7 days.'
		});
	});

	it('calls a small change steady: under 3 jobs, or under 10% of the start', () => {
		expect(trend([c('2026-11-17', 5), c(TODAY, 7)], TODAY, 7).direction).toBe('steady');
		expect(trend([c('2026-11-17', 5), c(TODAY, 8)], TODAY, 7).direction).toBe('growing');
		// 10% of 329 is 33: a change of 30 is steady, 33 is growth.
		expect(trend([c('2026-11-17', 329), c(TODAY, 359)], TODAY, 7)).toEqual({
			direction: 'steady',
			change: 30,
			words: '→ Steady: 329 → 359 open in 7 days.'
		});
		expect(trend([c('2026-11-17', 329), c(TODAY, 362)], TODAY, 7).direction).toBe('growing');
	});

	it('starts from the last count on or before the start day, and ends at the latest', () => {
		// No count on the 17th (a failed fetch): the 16th stands in. Today's fetch hasn't run: the 23rd ends it.
		expect(
			trend(
				[c('2026-11-10', 1), c('2026-11-16', 20), c('2026-11-20', 99), c('2026-11-23', 30)],
				TODAY,
				7
			).words
		).toBe('↑ Growing: 20 → 30 open (+10) in 7 days.');
		// Counts after today (a clock mix-up) are ignored.
		expect(trend([c('2026-11-17', 20), c('2026-11-25', 90)], TODAY, 7).words).toBe(
			'→ Steady: 20 → 20 open in 7 days.'
		);
	});

	it('says when there isn’t enough data, and why', () => {
		expect(trend([], TODAY, 7)).toEqual({
			direction: 'unknown',
			change: null,
			words: 'Not enough data yet: no counts so far.'
		});
		expect(trend([c('2026-11-20', 9), c(TODAY, 12)], TODAY, 7).words).toBe(
			'Not enough data yet: counts start Nov 20.'
		);
		expect(trend([c('2026-11-01', 9)], TODAY, 7).words).toBe(
			'Not enough data yet: no counts since Nov 1.'
		);
	});
});

describe('the list of trends', () => {
	const item = (
		company: string,
		direction: Trend['direction'],
		change: number | null
	): CompanyTrend => ({
		company,
		trend: { direction, change, words: '' }
	});
	const list = [
		item('Quiet', 'unknown', null),
		item('Flight', 'shrinking', -8),
		item('Example', 'growing', 13),
		item('Civic', 'steady', 0),
		item('Acme', 'unknown', null),
		item('Bravo', 'steady', 0)
	];

	it('runs from most growth to most shrinkage, then no data, ties by name', () => {
		expect(byChange(list).map((x) => x.company)).toEqual([
			'Example',
			'Bravo',
			'Civic',
			'Flight',
			'Acme',
			'Quiet'
		]);
	});

	it('sums up in words', () => {
		expect(trendSummary(list, 7)).toBe(
			'1 growing, 2 steady and 1 shrinking over 7 days; 2 without enough data yet.'
		);
		expect(trendSummary(list.slice(1, 4), 30)).toBe(
			'1 growing, 1 steady and 1 shrinking over 30 days.'
		);
		expect(trendSummary(list.slice(0, 1), 7)).toBe(
			'Not enough data yet for any company. Trends need a count from the start of the window.'
		);
		expect(trendSummary([], 7)).toBe('No companies on your list yet.');
	});
});
