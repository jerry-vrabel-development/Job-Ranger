import { describe, expect, it } from 'vitest';
import {
	companyBars,
	companyRows,
	marketSummary,
	MAX_COMPANIES,
	payLine,
	totalOpen,
	workplaceBars,
	type MarketCounts
} from './market.ts';

const counts: MarketCounts = {
	byCompany: [
		{ company: 'Spotify', open: 90 },
		{ company: 'Zipline', open: 329 },
		{ company: 'Agility', open: 75 },
		{ company: 'Beta', open: 6 }
	],
	byWorkplace: [
		{ workplace: 'on-site', open: 300 },
		{ workplace: 'remote', open: 125 },
		{ workplace: 'unknown', open: 75 }
	],
	payListed: 90,
	payPosted: 36,
	payUnlisted: 410
};
const empty: MarketCounts = {
	byCompany: [],
	byWorkplace: [],
	payListed: 0,
	payPosted: 0,
	payUnlisted: 0
};

describe('the market by company', () => {
	it('runs from most open jobs to fewest, with each one’s share', () => {
		expect(totalOpen(counts)).toBe(500);
		expect(companyRows(counts)).toEqual([
			{ label: 'Zipline', count: 329, detail: '66%' },
			{ label: 'Spotify', count: 90, detail: '18%' },
			{ label: 'Agility', count: 75, detail: '15%' },
			{ label: 'Beta', count: 6, detail: '1%' }
		]);
		expect(companyBars(counts)).toEqual({ bars: companyRows(counts), more: null });
	});

	it('folds companies past the limit into a line, and keeps them in the table', () => {
		const many: MarketCounts = {
			...counts,
			byCompany: Array.from({ length: MAX_COMPANIES + 2 }, (_, i) => ({
				company: `Co ${String(i).padStart(2, '0')}`,
				open: i === MAX_COMPANIES + 1 ? 1 : 10
			}))
		};
		const { bars, more } = companyBars(many);
		expect(bars).toHaveLength(MAX_COMPANIES);
		expect(more).toBe('And 2 more companies with 11 open jobs, in the table.');
		expect(companyRows(many)).toHaveLength(MAX_COMPANIES + 2);
		const one = { ...many, byCompany: many.byCompany.slice(0, MAX_COMPANIES + 1) };
		expect(companyBars(one).more).toBe('And 1 more company with 10 open jobs, in the table.');
		const lone = {
			...many,
			byCompany: [...many.byCompany.slice(0, MAX_COMPANIES), { company: 'Zz', open: 1 }]
		};
		expect(companyBars(lone).more).toBe('And 1 more company with 1 open job, in the table.');
	});

	it('breaks ties by name, and gives no share when nothing is open', () => {
		expect(
			companyRows({
				...empty,
				byCompany: [
					{ company: 'B', open: 0 },
					{ company: 'A', open: 0 }
				]
			})
		).toEqual([
			{ label: 'A', count: 0, detail: null },
			{ label: 'B', count: 0, detail: null }
		]);
	});
});

describe('the market by workplace', () => {
	it('always shows the same four rows, in the same order', () => {
		expect(workplaceBars(counts)).toEqual([
			{ label: 'Remote', count: 125, detail: '25%' },
			{ label: 'Hybrid', count: 0, detail: '0%' },
			{ label: 'On site', count: 300, detail: '60%' },
			{ label: 'Not stated', count: 75, detail: '15%' }
		]);
		expect(workplaceBars(empty).map((b) => b.detail)).toEqual([null, null, null, null]);
	});
});

describe('the market in words', () => {
	it('sums it up', () => {
		expect(marketSummary(counts)).toBe('500 open jobs at 4 companies; 25% remote.');
		expect(
			marketSummary({
				...empty,
				byCompany: [
					{ company: 'A', open: 1 },
					{ company: 'B', open: 0 }
				]
			})
		).toBe('1 open job at 1 company; 0% remote.');
		expect(marketSummary(empty)).toBe('No open jobs on your list right now.');
	});

	it('counts pay only where the board’s list can show it, and says what it left out', () => {
		expect(payLine(counts)).toBe(
			'36 of 90 open jobs post pay (40%), on Ashby, Lever and Breezy boards. Greenhouse’s list doesn’t include pay, so its 410 jobs aren’t counted here.'
		);
		expect(payLine({ ...counts, payListed: 1, payPosted: 1, payUnlisted: 1 })).toBe(
			'1 of 1 open job post pay (100%), on Ashby, Lever and Breezy boards. Greenhouse’s list doesn’t include pay, so its 1 job isn’t counted here.'
		);
		expect(payLine({ ...counts, payUnlisted: 0 })).toBe(
			'36 of 90 open jobs post pay (40%), on Ashby, Lever and Breezy boards.'
		);
		expect(payLine({ ...empty, payUnlisted: 3 })).toBe(
			'No open jobs on boards whose list includes pay. Greenhouse’s list doesn’t include pay, so its 3 jobs aren’t counted here.'
		);
		expect(payLine(empty)).toBe('No open jobs to check for pay.');
	});
});
