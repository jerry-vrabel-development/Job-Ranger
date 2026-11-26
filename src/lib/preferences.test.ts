import { describe, expect, it } from 'vitest';
import {
	AREA_MAX,
	checkPreferences,
	EMPTY_PREFERENCES,
	forScoring,
	LOOKING_FOR_MAX,
	parsePay,
	wholeDollars,
	type PreferenceValues
} from './preferences.ts';

const blank: PreferenceValues = {
	workplaces: [],
	area: '',
	levels: [],
	payFloor: '',
	lookingFor: ''
};

describe('parsePay', () => {
	it.each([
		['120000', 120000],
		['120,000', 120000],
		['$120,000', 120000],
		['$ 120000.50', 120000],
		['120k', 120000],
		['120K', 120000],
		['10000000', 10000000]
	])('reads %s as %i', (text, amount) => {
		expect(parsePay(text)).toBe(amount);
	});

	it.each(['', 'lots', '120 thousand', '12,00', '-5', '0', '10000001', '1,2345'])(
		'rejects %j',
		(text) => {
			expect(parsePay(text)).toBeNull();
		}
	);
});

describe('checkPreferences', () => {
	it('keeps known words in order, tidies text, and reads the pay floor', () => {
		expect(
			checkPreferences({
				workplaces: ['on-site', 'nowhere', 'remote'],
				area: '  Chicago   area ',
				levels: ['lead', 'senior', 'boss'],
				payFloor: ' $130k ',
				lookingFor: '  Smart people,   ingenious products.\nDrones or music. '
			})
		).toEqual({
			ok: true,
			preferences: {
				workplaces: ['remote', 'on-site'],
				area: 'Chicago area',
				levels: ['senior', 'lead'],
				payFloor: 130000,
				lookingFor: 'Smart people, ingenious products.\nDrones or music.'
			}
		});
	});

	it('takes everything blank as no preferences', () => {
		expect(checkPreferences(blank)).toEqual({ ok: true, preferences: EMPTY_PREFERENCES });
	});

	it('says which field is wrong and why', () => {
		expect(checkPreferences({ ...blank, area: 'x'.repeat(AREA_MAX + 1) })).toEqual({
			ok: false,
			field: 'area',
			message: 'Keep the area under 100 characters.'
		});
		expect(checkPreferences({ ...blank, lookingFor: 'x'.repeat(LOOKING_FOR_MAX + 1) })).toEqual({
			ok: false,
			field: 'lookingFor',
			message: 'Keep this under 600 characters.'
		});
		expect(checkPreferences({ ...blank, payFloor: 'a lot' })).toEqual({
			ok: false,
			field: 'payFloor',
			message: 'Enter a yearly amount in US dollars, like 120000 or $120k.'
		});
	});
});

describe('forScoring', () => {
	it('says each set preference as a plain sentence', () => {
		expect(
			forScoring({
				workplaces: ['remote', 'hybrid', 'on-site'],
				area: 'Chicago area',
				levels: ['senior', 'staff', 'lead'],
				payFloor: 130000,
				lookingFor: 'Drones or music.'
			})
		).toEqual({
			where: 'Remote, or hybrid or on site in Chicago area',
			level: 'Senior, Staff or Lead',
			pay: 'At least $130,000 a year',
			looking_for: 'Drones or music.'
		});
	});

	it('words a single choice, and local work with no area', () => {
		expect(
			forScoring({ ...EMPTY_PREFERENCES, workplaces: ['remote'], levels: ['senior'] })
		).toEqual({
			where: 'Remote',
			level: 'Senior'
		});
		expect(forScoring({ ...EMPTY_PREFERENCES, workplaces: ['hybrid'] })).toEqual({
			where: 'Hybrid'
		});
		expect(
			forScoring({
				...EMPTY_PREFERENCES,
				workplaces: ['remote', 'on-site'],
				levels: ['mid', 'senior']
			})
		).toEqual({ where: 'Remote, or on site', level: 'Mid-level or Senior' });
	});

	it('leaves out what isn’t set', () => {
		expect(forScoring(EMPTY_PREFERENCES)).toEqual({});
		expect(forScoring({ ...EMPTY_PREFERENCES, area: 'Chicago area' })).toEqual({});
	});
});

describe('wholeDollars', () => {
	it('adds the sign and commas', () => {
		expect(wholeDollars(1250000)).toBe('$1,250,000');
	});
});
