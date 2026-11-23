/**
 * The honest-signals eval (design note 0005): made-up postings shaped like
 * real ones, each labelled with whether a careful reader would want the
 * warning. False alarms and misses are counted separately, because a signal
 * that cries wolf stops being read. Both must stay at zero; changing a rule
 * or a label here is a decision, said in the PR.
 */
import { describe, expect, it } from 'vitest';
import { ghostSignal, type GhostInput } from './ghost.ts';
import { paySignal, type PayInput } from './pay.ts';
import { scamSignals } from './scam.ts';

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

interface PayCase {
	readonly name: string;
	readonly posting: PayInput;
	readonly flag: boolean;
}

const RANGE = {
	summary: '$120K - $140K',
	min: 120_000,
	max: 140_000,
	currency: 'USD',
	interval: null
};

const PAY_CASES: readonly PayCase[] = [
	{
		name: 'Chicago job, no pay',
		posting: { source: 'ashby', location: 'Chicago, IL', pay: null },
		flag: true
	},
	{
		name: 'hybrid New York or remote, no pay',
		posting: { source: 'lever', location: 'New York, NY; Remote (US)', pay: null },
		flag: true
	},
	{
		name: 'Chicago job with its range posted',
		posting: { source: 'ashby', location: 'Chicago, IL', pay: RANGE },
		flag: false
	},
	{
		name: 'Greenhouse job: its list never carries pay',
		posting: { source: 'greenhouse', location: 'Chicago, IL', pay: null },
		flag: false
	},
	{
		name: 'remote anywhere in the US, no pay',
		posting: { source: 'ashby', location: 'Remote (US)', pay: null },
		flag: false
	},
	{
		name: 'Texas job, no pay',
		posting: { source: 'breezy', location: 'Austin, TX', pay: null },
		flag: false
	},
	{
		name: 'West Virginia job, no pay',
		posting: { source: 'ashby', location: 'Morgantown, West Virginia', pay: null },
		flag: false
	},
	{
		name: 'Washington, D.C. job, no pay',
		posting: { source: 'lever', location: 'Washington, D.C.', pay: null },
		flag: true
	}
];

describe('signals eval: pay missing where the law may require it', () => {
	const results = PAY_CASES.map((c) => ({ ...c, flagged: paySignal(c.posting, NOW) !== null }));

	it('raises no false alarms', () => {
		expect(results.filter((r) => r.flagged && !r.flag).map((r) => r.name)).toEqual([]);
	});

	it('misses nothing', () => {
		expect(results.filter((r) => !r.flagged && r.flag).map((r) => r.name)).toEqual([]);
	});
});

const SCAM_CASES: readonly { name: string; text: string; scam: boolean }[] = [
	{
		name: 'ordinary engineering posting',
		text: 'You’ll build accessible web apps in TypeScript. We pay for conferences and training. Offers depend on a background check. Interviews happen on Zoom.',
		scam: false
	},
	{
		name: 'messaging product team',
		text: 'Join the team behind our WhatsApp and Telegram integrations. Email jobs@example.com with questions.',
		scam: false
	},
	{
		name: 'remote laptop shipped by the company',
		text: 'We’ll send you a laptop and a home-office budget on day one.',
		scam: false
	},
	{
		name: 'warehouse role with equipment checks',
		text: 'You’ll run daily equipment checks and keep the line safe.',
		scam: false
	},
	{
		name: 'fake-check equipment scam',
		text: 'Congratulations! We will send you a check to purchase equipment from our vendor.',
		scam: true
	},
	{
		name: 'chat-app interview with a free email',
		text: 'Your interview will be held on Telegram. Questions: recruiter.team@outlook.com.',
		scam: true
	},
	{
		name: 'developer "meeting app" scam',
		text: 'Before the technical call, please download our meeting app from the link below.',
		scam: true
	},
	{
		name: 'starter-kit fee',
		text: 'A small onboarding fee covers your training materials.',
		scam: true
	}
];

describe('signals eval: scam checks', () => {
	const results = SCAM_CASES.map((c) => ({ ...c, flagged: scamSignals(c.text).length > 0 }));

	it('raises no false alarms', () => {
		expect(results.filter((r) => r.flagged && !r.scam).map((r) => r.name)).toEqual([]);
	});

	it('misses nothing', () => {
		expect(results.filter((r) => !r.flagged && r.scam).map((r) => r.name)).toEqual([]);
	});
});
