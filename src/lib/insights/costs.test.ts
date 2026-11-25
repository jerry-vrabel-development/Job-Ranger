import { describe, expect, it } from 'vitest';
import { costTiles, draftingStatus, perApplication, type Spending } from './costs.ts';

const on: Spending = {
	setup: { ready: true, label: 'Anthropic, claude-sonnet-5-5' },
	capMicros: 1_000_000,
	todayMicros: 120_000,
	monthMicros: 940_000,
	totalMicros: 2_310_000,
	applications: 4,
	appliedMicros: 180_000
};
const off: Spending = {
	...on,
	setup: { ready: false, reason: 'Drafting isn’t set up yet: the Worker has no API key.' },
	todayMicros: 0,
	monthMicros: 0,
	totalMicros: 0,
	appliedMicros: 0
};

describe('drafting costs', () => {
	it('says whether drafting is on, and why not when it isn’t', () => {
		expect(draftingStatus(on)).toBe(
			'Drafting is on (Anthropic, claude-sonnet-5-5), with a daily cap of $1.00.'
		);
		expect(draftingStatus(off)).toBe(
			'Drafting isn’t set up yet: the Worker has no API key. Nothing is spent until it is.'
		);
	});

	it('shows today against the cap, this month and in all', () => {
		expect(costTiles(on)).toEqual([
			{ label: 'Today, of a $1.00 cap', value: '$0.12' },
			{ label: 'This month', value: '$0.94' },
			{ label: 'In all', value: '$2.31' }
		]);
	});

	it('gives the cost per application, or why there’s none', () => {
		expect(perApplication(on)).toBe('$0.18 across 4 applications, $0.05 each on average.');
		expect(perApplication({ ...on, applications: 1, appliedMicros: 40_000 })).toBe(
			'$0.04 across 1 application, $0.04 each on average.'
		);
		expect(perApplication(off)).toBe('None of your 4 applications used drafting.');
		expect(perApplication({ ...off, applications: 1 })).toBe(
			'Your one application didn’t use drafting.'
		);
		expect(perApplication({ ...off, applications: 0 })).toBe('No applications yet.');
	});
});
