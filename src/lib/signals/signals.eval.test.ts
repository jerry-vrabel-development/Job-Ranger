/**
 * The honest-signals eval (design note 0005): made-up postings shaped like
 * real ones, each labelled with whether a careful reader would want the
 * warning. False alarms and misses are counted separately, because a signal
 * that cries wolf stops being read. Both must stay at zero; changing a rule
 * or a label here is a decision, said in the PR.
 */
import { describe, expect, it } from 'vitest';
import { ghostSignal, type GhostInput } from './ghost.ts';

const NOW = '2026-11-22T12:00:00.000Z';
const daysAgo = (n: number) => new Date(Date.parse(NOW) - n * 86_400_000).toISOString();

interface Case {
	readonly name: string;
	readonly posting: GhostInput;
	readonly ghost: boolean;
}

const GHOST_CASES: readonly Case[] = [
	{
		name: 'fresh, real opening',
		posting: { postedAt: daysAgo(4), firstSeenAt: daysAgo(3), reopenCount: 0 },
		ghost: false
	},
	{
		name: 'slow but ordinary hiring, six weeks open',
		posting: { postedAt: daysAgo(42), firstSeenAt: daysAgo(40), reopenCount: 0 },
		ghost: false
	},
	{
		name: 'closed once for a hiring freeze, then back',
		posting: { postedAt: daysAgo(30), firstSeenAt: daysAgo(30), reopenCount: 1 },
		ghost: false
	},
	{
		name: 'company just added to my list, job posted last week',
		posting: { postedAt: daysAgo(8), firstSeenAt: daysAgo(0), reopenCount: 0 },
		ghost: false
	},
	{
		name: 'evergreen "talent pool" posting, open half a year',
		posting: { postedAt: daysAgo(180), firstSeenAt: daysAgo(20), reopenCount: 0 },
		ghost: true
	},
	{
		name: 'board resets its date on every repost, but Job Ranger saw it long ago',
		posting: { postedAt: daysAgo(5), firstSeenAt: daysAgo(75), reopenCount: 3 },
		ghost: true
	},
	{
		name: 'taken down and put back three times in a month',
		posting: { postedAt: daysAgo(25), firstSeenAt: daysAgo(25), reopenCount: 3 },
		ghost: true
	},
	{
		name: 'open just over two months',
		posting: { postedAt: daysAgo(63), firstSeenAt: daysAgo(63), reopenCount: 0 },
		ghost: true
	}
];

describe('signals eval: ghost-job warning', () => {
	const results = GHOST_CASES.map((c) => ({
		...c,
		flagged: ghostSignal(c.posting, NOW) !== null
	}));

	it('raises no false alarms', () => {
		expect(results.filter((r) => r.flagged && !r.ghost).map((r) => r.name)).toEqual([]);
	});

	it('misses nothing', () => {
		expect(results.filter((r) => !r.flagged && r.ghost).map((r) => r.name)).toEqual([]);
	});
});
