import { describe, expect, it } from 'vitest';
import { PAY_LAWS, PAY_LAWS_CHECKED } from './pay-laws.ts';
import { lawsFor, paySignal, whoItCovers } from './pay.ts';

const NOW = '2026-11-22T12:00:00.000Z';
const codes = (location: string, now = NOW) => lawsFor(location, now).map((law) => law.code);

describe('lawsFor', () => {
	it('reads states from "City, ST" and from full names, in any segment', () => {
		expect(codes('Chicago, IL; Remote (US)')).toEqual(['IL']);
		expect(codes('Remote - US; Austin, TX')).toEqual([]);
		expect(codes('New York, NY / Jersey City, NJ')).toEqual(['NJ', 'NY']);
		expect(codes('Seattle, Washington or Denver, CO')).toEqual(['CO', 'WA']);
		expect(codes('Portland, ME')).toEqual(['ME']);
		expect(codes('Boston, Massachusetts | Minneapolis, MN')).toEqual(['MA', 'MN']);
	});

	it('tells Washington, D.C. from Washington state, and Virginia from West Virginia', () => {
		for (const dc of [
			'Washington, DC',
			'Washington, D.C.',
			'District of Columbia',
			'Washington DC'
		])
			expect(codes(dc)).toEqual(['DC']);
		expect(codes('Charleston, West Virginia')).toEqual([]);
		expect(codes('Richmond, Virginia')).toEqual(['VA']);
	});

	it('needs the capital code after a comma, so ordinary words never match', () => {
		expect(codes('Chicago IL')).toEqual([]);
		expect(codes('Remote, me and you')).toEqual([]);
		expect(codes('Example Co, Inc')).toEqual([]);
		expect(codes('Location not given')).toEqual([]);
	});

	it('only counts a law once it’s in effect', () => {
		expect(codes('Wilmington, DE')).toEqual([]);
		expect(codes('Wilmington, DE', '2027-09-26T00:00:00.000Z')).toEqual(['DE']);
		expect(codes('Hartford, CT', '2026-09-30T23:00:00.000Z')).toEqual([]);
		expect(codes('Hartford, CT')).toEqual(['CT']);
	});
});

describe('paySignal', () => {
	const pay = { summary: '$1', min: 1, max: 2, currency: 'USD', interval: null };

	it('flags no pay from a board that lists pay, in a state with a law', () => {
		expect(
			paySignal({ source: 'ashby', location: 'Chicago, IL', pay: null }, NOW)?.map((l) => l.name)
		).toEqual(['Illinois']);
	});

	it('stays quiet when pay is posted, the board never lists pay, or no state has a law', () => {
		expect(paySignal({ source: 'lever', location: 'Chicago, IL', pay }, NOW)).toBeNull();
		expect(paySignal({ source: 'greenhouse', location: 'Chicago, IL', pay: null }, NOW)).toBeNull();
		expect(paySignal({ source: 'breezy', location: 'Remote (US)', pay: null }, NOW)).toBeNull();
	});
});

describe('the law data', () => {
	it('says who each law covers, in words', () => {
		const law = { code: 'XX', name: 'X', effective: '2020-01-01', url: 'https://x.test' };
		expect(whoItCovers({ ...law, minEmployees: 15 })).toBe('employers with 15 or more employees');
		expect(whoItCovers({ ...law, minEmployees: 1 })).toBe('any employer');
	});

	it('keeps one entry per state, each with a date, a size and an https link', () => {
		expect(new Set(PAY_LAWS.map((law) => law.code)).size).toBe(PAY_LAWS.length);
		for (const law of PAY_LAWS) {
			expect(law.effective).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(law.minEmployees).toBeGreaterThanOrEqual(1);
			expect(law.url).toMatch(/^https:\/\//);
		}
		expect(PAY_LAWS_CHECKED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});
