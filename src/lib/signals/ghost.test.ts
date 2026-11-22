import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { GHOST_DAYS, GHOST_REPOSTS, ghostSignal, ghostWords } from './ghost.ts';

const NOW = '2026-11-22T12:00:00.000Z';
const daysAgo = (n: number) => new Date(Date.parse(NOW) - n * 86_400_000).toISOString();

describe('ghostSignal', () => {
	it('flags a job open 60 days or more, counting from the board’s date', () => {
		expect(
			ghostSignal({ postedAt: daysAgo(74), firstSeenAt: daysAgo(3), reopenCount: 0 }, NOW)
		).toEqual({ days: 74, since: daysAgo(74), from: 'board', reposts: 0 });
		expect(
			ghostSignal({ postedAt: daysAgo(59), firstSeenAt: daysAgo(3), reopenCount: 0 }, NOW)
		).toBeNull();
		expect(
			ghostSignal({ postedAt: daysAgo(60), firstSeenAt: daysAgo(60), reopenCount: 0 }, NOW)
		).toMatchObject({ days: 60, from: 'job-ranger' });
	});

	it('uses the first sighting when the board’s date is later, missing, unreadable or ahead', () => {
		const seen = daysAgo(90);
		for (const postedAt of [daysAgo(5), null, 'not a date', '2027-01-01T00:00:00.000Z']) {
			expect(ghostSignal({ postedAt, firstSeenAt: seen, reopenCount: 0 }, NOW)).toEqual({
				days: 90,
				since: seen,
				from: 'job-ranger',
				reposts: 0
			});
		}
	});

	it('flags two reposts or more on a young job, but not one', () => {
		const young = { postedAt: daysAgo(10), firstSeenAt: daysAgo(10) };
		expect(ghostSignal({ ...young, reopenCount: 1 }, NOW)).toBeNull();
		expect(ghostSignal({ ...young, reopenCount: 2 }, NOW)).toMatchObject({
			days: 10,
			reposts: 2
		});
		expect(ghostSignal({ ...young, reopenCount: -3 }, NOW)).toBeNull();
	});

	it('flags exactly when the job is old enough or reposted enough', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 400 }),
				fc.integer({ min: 0, max: 6 }),
				(age, reposts) => {
					const result = ghostSignal(
						{ postedAt: daysAgo(age), firstSeenAt: daysAgo(age), reopenCount: reposts },
						NOW
					);
					expect(result !== null).toBe(age >= GHOST_DAYS || reposts >= GHOST_REPOSTS);
					if (result) expect(result.days).toBe(age);
				}
			)
		);
	});
});

describe('ghostWords', () => {
	it('says the facts first, whose date it is, and that it’s a warning', () => {
		expect(
			ghostWords({ days: 74, since: '2026-09-09T08:00:00.000Z', from: 'board', reposts: 2 })
		).toBe(
			'Open 74 days (since Sep 9, 2026, the board’s date), reposted twice. Long-open or reposted jobs are sometimes never filled. A warning, not a verdict.'
		);
		expect(
			ghostWords({ days: 61, since: '2026-09-22T00:00:00.000Z', from: 'job-ranger', reposts: 0 })
		).toMatch(/^Open 61 days \(since Sep 22, 2026, when Job Ranger first saw it\)\. Long-open/);
		expect(ghostWords({ days: 1, since: NOW, from: 'board', reposts: 1 })).toMatch(
			/^Open 1 day .*reposted once\./
		);
		expect(ghostWords({ days: 3, since: NOW, from: 'board', reposts: 5 })).toMatch(
			/reposted 5 times\./
		);
	});
});
