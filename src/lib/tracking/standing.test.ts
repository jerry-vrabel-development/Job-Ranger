import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FOLLOW_UP_DAYS, isStatus, NO_REPLY_DAYS, standing, type Tracked } from './standing.ts';

const NOW = '2026-11-23T18:00:00.000Z';
const daysAgo = (n: number) => new Date(Date.parse(NOW) - n * 86_400_000).toISOString();
const applied = (days: number, more: Partial<Tracked> = {}): Tracked => ({
	status: 'applied',
	appliedAt: daysAgo(days),
	statusAt: null,
	followedUpAt: null,
	...more
});

describe('standing', () => {
	it('waits, then says to follow up at 7 days, and again at 14', () => {
		expect(standing(applied(0), NOW)).toEqual({
			group: 'waiting',
			days: 0,
			words: 'Applied 0 days ago.'
		});
		expect(standing(applied(6), NOW).group).toBe('waiting');
		expect(standing(applied(7), NOW)).toEqual({
			group: 'follow-up',
			days: 7,
			words: 'Applied 7 days ago with no reply: a good time to follow up.'
		});
		const once = applied(10, { followedUpAt: daysAgo(2) });
		expect(standing(once, NOW)).toEqual({
			group: 'waiting',
			days: 10,
			words: 'Applied 10 days ago; you followed up.'
		});
		expect(standing(applied(14, { followedUpAt: daysAgo(6) }), NOW).group).toBe('follow-up');
		expect(standing(applied(20, { followedUpAt: daysAgo(5) }), NOW).group).toBe('waiting');
	});

	it('says "No reply" after 30 days still at applied, follow-ups or not', () => {
		expect(standing(applied(29), NOW).group).toBe('follow-up');
		expect(standing(applied(30, { followedUpAt: daysAgo(1) }), NOW)).toEqual({
			group: 'no-reply',
			days: 30,
			words: 'No reply in 30 days. You can stop waiting; if they write, change it here.'
		});
		expect(standing(applied(1), NOW).words).toBe('Applied 1 day ago.');
	});

	it('counts from the last change once a status moves on, and never reminds', () => {
		expect(standing(applied(60, { status: 'interviewing', statusAt: daysAgo(1) }), NOW)).toEqual({
			group: 'interviewing',
			days: 1,
			words: 'Interviewing, for 1 day.'
		});
		expect(standing(applied(60, { status: 'offer', statusAt: daysAgo(3) }), NOW).words).toBe(
			'Offer.'
		);
		expect(standing(applied(60, { status: 'rejected', statusAt: daysAgo(3) }), NOW)).toMatchObject({
			group: 'closed',
			words: 'Rejected.'
		});
		expect(standing(applied(60, { status: 'withdrawn' }), NOW).words).toBe('Withdrawn.');
	});

	it('never says follow up before the first interval or after "No reply"', () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 120 }), (days) => {
				const group = standing(applied(days), NOW).group;
				if (days < FOLLOW_UP_DAYS[0]) expect(group).toBe('waiting');
				else if (days < NO_REPLY_DAYS) expect(group).toBe('follow-up');
				else expect(group).toBe('no-reply');
			})
		);
	});

	it('knows its statuses', () => {
		expect(isStatus('offer')).toBe(true);
		expect(isStatus('ghosted')).toBe(false);
		expect(isStatus(3)).toBe(false);
	});
});
