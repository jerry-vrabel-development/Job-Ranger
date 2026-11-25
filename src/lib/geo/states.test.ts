import { describe, expect, it } from 'vitest';
import { statesIn, US_STATES } from './states.ts';

const codes = (location: string) => statesIn(location).map((s) => s.code);

describe('the state list', () => {
	it('has the 50 states and DC, each code, name and FIPS code once', () => {
		expect(US_STATES).toHaveLength(51);
		for (const key of ['code', 'name', 'fips'] as const) {
			expect(new Set(US_STATES.map((s) => s[key])).size).toBe(51);
		}
	});
});

describe('states in a location', () => {
	it('reads "City, ST" and full names, every state', () => {
		for (const state of US_STATES) {
			expect(codes(`Somewhere, ${state.code}`)).toEqual([state.code]);
			expect(codes(`Remote - ${state.name}`)).toEqual([state.code]);
		}
	});

	it('finds each state once, in the list’s order, across segments', () => {
		expect(codes('Austin, TX or Denver, CO; Chicago, IL / Austin, Texas')).toEqual([
			'CO',
			'IL',
			'TX'
		]);
	});

	it('doesn’t find a state inside another word or name', () => {
		expect(codes('Little Rock, Arkansas')).toEqual(['AR']);
		expect(codes('Charleston, West Virginia')).toEqual(['WV']);
		expect(codes('Indianapolis')).toEqual([]);
		expect(codes('Washington, DC')).toEqual(['DC']);
		expect(codes('Seattle, Washington')).toEqual(['WA']);
	});

	it('needs a capital code after a comma, so ordinary words don’t count', () => {
		expect(codes('Remote, or hybrid')).toEqual([]);
		expect(codes('London, UK')).toEqual([]);
		expect(codes('Remote')).toEqual([]);
	});
});
