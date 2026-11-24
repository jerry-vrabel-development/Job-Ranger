import { describe, expect, it } from 'vitest';
import type { Tracked } from '#lib/tracking/standing.ts';
import {
	foundLine,
	funnelSteps,
	funnelSummary,
	MIN_FOR_SHARE,
	waitingCounts,
	type SearchCounts
} from './search.ts';

const counts: SearchCounts = {
	found: 640,
	open: 612,
	saved: 20,
	applied: 10,
	replied: 4,
	interviewing: 2,
	offers: 1
};
const none: SearchCounts = {
	...counts,
	saved: 0,
	applied: 0,
	replied: 0,
	interviewing: 0,
	offers: 0
};

describe('the funnel', () => {
	it('gives each step its count and its share of the step before', () => {
		expect(funnelSteps(counts)).toEqual([
			{ label: 'Saved', count: 20, share: null },
			{ label: 'Applied', count: 10, share: '50% of saved' },
			{ label: 'Replied', count: 4, share: '40% of applied' },
			// Fewer than 5 before it: the count, but no percentage.
			{ label: 'Interviewing', count: 2, share: null },
			{ label: 'Offer', count: 1, share: null }
		]);
	});

	it('gives a share only from a step of at least the minimum', () => {
		const at = funnelSteps({ ...counts, applied: MIN_FOR_SHARE, replied: 2 });
		expect(at[2]?.share).toBe('40% of applied');
		const below = funnelSteps({ ...counts, applied: MIN_FOR_SHARE - 1, replied: 2 });
		expect(below[2]?.share).toBeNull();
	});
});

describe('the funnel in words', () => {
	it('says how far things got', () => {
		expect(funnelSummary(counts)).toBe(
			'You saved 20 jobs, applied to 10, and heard back from 4; 2 reached an interview, and 1 became an offer.'
		);
		expect(funnelSummary({ ...counts, offers: 3, interviewing: 3 })).toBe(
			'You saved 20 jobs, applied to 10, and heard back from 4; 3 reached an interview, and 3 became offers.'
		);
	});

	it('stops where the search has got to', () => {
		expect(funnelSummary({ ...counts, interviewing: 0, offers: 0 })).toBe(
			'You saved 20 jobs, applied to 10, and heard back from 4.'
		);
		expect(funnelSummary({ ...none, saved: 1 })).toBe('You saved 1 job, and haven’t applied yet.');
		expect(funnelSummary(none)).toBe('Nothing saved or applied to yet. As you do, this fills in.');
	});

	it('says how many jobs were found and are open', () => {
		expect(foundLine(counts)).toBe('640 jobs found, 612 open now.');
		expect(foundLine({ ...counts, found: 1, open: 1 })).toBe('1 job found, 1 open now.');
	});
});

describe('waiting to hear', () => {
	const NOW = '2026-11-24T18:00:00.000Z';
	const app = (appliedAt: string, status: Tracked['status'] = 'applied'): Tracked => ({
		status,
		appliedAt,
		statusAt: null,
		followedUpAt: null
	});

	it('counts follow-ups due, waiting and no reply, by the tracker’s rules', () => {
		expect(
			waitingCounts(
				[
					app('2026-11-22T00:00:00.000Z'), // 2 days: waiting
					app('2026-11-14T00:00:00.000Z'), // 10 days: follow up
					app('2026-10-01T00:00:00.000Z'), // 54 days: no reply
					app('2026-11-01T00:00:00.000Z', 'interviewing') // not waiting
				],
				NOW
			)
		).toEqual({ followUp: 1, waiting: 1, noReply: 1 });
		expect(waitingCounts([], NOW)).toEqual({ followUp: 0, waiting: 0, noReply: 0 });
	});
});
