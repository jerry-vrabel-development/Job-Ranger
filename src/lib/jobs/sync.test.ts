import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Posting } from './posting.ts';
import { planSync, sameDetails, type StoredPosting, type SyncPlan } from './sync.ts';

const DAY1 = '2026-11-16T11:00:00.000Z';
const DAY2 = '2026-11-17T11:00:00.000Z';
const DAY3 = '2026-11-18T11:00:00.000Z';

function posting(id: string, overrides: Partial<Posting> = {}): Posting {
	return {
		source: 'ashby',
		board: 'example',
		id,
		company: 'Example Co',
		title: `Engineer ${id}`,
		location: 'Remote',
		workplace: 'remote',
		employmentType: 'Full time',
		department: null,
		applyUrl: `https://jobs.ashbyhq.com/example/${id}/application`,
		jobUrl: null,
		postedAt: DAY1,
		pay: null,
		...overrides
	};
}

/** The same plan, applied to an in-memory store: the model the database must match. */
function apply(store: readonly StoredPosting[], plan: SyncPlan, now: string): StoredPosting[] {
	const byId = new Map(store.map((p) => [p.id, p]));
	for (const p of [...plan.insert, ...plan.update]) byId.set(p.id, p);
	for (const id of plan.touch) {
		const p = byId.get(id);
		if (p) byId.set(id, { ...p, lastSeenAt: now });
	}
	for (const id of plan.close) {
		const p = byId.get(id);
		if (p) byId.set(id, { ...p, closedAt: now });
	}
	return [...byId.values()];
}

function run(store: readonly StoredPosting[], incoming: readonly Posting[], now: string) {
	const plan = planSync(store, incoming, now);
	return { plan, store: apply(store, plan, now) };
}

describe('planSync', () => {
	it('inserts a new board as new, unseen postings', () => {
		const { plan } = run([], [posting('a'), posting('b')], DAY1);
		expect(plan.insert.map((p) => p.id)).toEqual(['a', 'b']);
		expect(plan.insert[0]).toMatchObject({
			firstSeenAt: DAY1,
			lastSeenAt: DAY1,
			closedAt: null,
			reopenCount: 0,
			seenAt: null
		});
		expect(plan.update).toEqual([]);
		expect(plan.touch).toEqual([]);
		expect(plan.close).toEqual([]);
	});

	it('only touches an unchanged posting the next day', () => {
		const day1 = run([], [posting('a')], DAY1).store;
		const { plan, store } = run(day1, [posting('a')], DAY2);
		expect(plan).toEqual({ insert: [], update: [], touch: ['a'], close: [] });
		expect(store[0]?.lastSeenAt).toBe(DAY2);
		expect(store[0]?.firstSeenAt).toBe(DAY1);
	});

	it('updates a posting whose details changed, keeping its history', () => {
		const day1 = run([], [posting('a')], DAY1).store.map((p) => ({ ...p, seenAt: DAY1 }));
		const { plan } = run(day1, [posting('a', { title: 'Staff Engineer' })], DAY2);
		expect(plan.update).toHaveLength(1);
		expect(plan.update[0]).toMatchObject({
			title: 'Staff Engineer',
			firstSeenAt: DAY1,
			lastSeenAt: DAY2,
			seenAt: DAY1
		});
	});

	it('closes a posting that left the board', () => {
		const day1 = run([], [posting('a'), posting('b')], DAY1).store;
		const { plan } = run(day1, [posting('b')], DAY2);
		expect(plan.close).toEqual(['a']);
	});

	it('does not close a posting twice', () => {
		const day2 = run(run([], [posting('a')], DAY1).store, [], DAY2).store;
		expect(planSync(day2, [], DAY3).close).toEqual([]);
	});

	it('reopens a posting that came back, counts it, and keeps it seen', () => {
		let store: StoredPosting[] = run([], [posting('a')], DAY1).store.map((p) => ({
			...p,
			seenAt: DAY1
		}));
		store = run(store, [], DAY2).store;
		const { plan } = run(store, [posting('a')], DAY3);
		expect(plan.update).toHaveLength(1);
		expect(plan.update[0]).toMatchObject({
			closedAt: null,
			reopenCount: 1,
			seenAt: DAY1,
			firstSeenAt: DAY1
		});
	});

	it('counts a posting listed twice in one answer once (the first wins)', () => {
		const { plan } = run(
			[],
			[posting('a', { title: 'First' }), posting('a', { title: 'Second' })],
			DAY1
		);
		expect(plan.insert.map((p) => p.title)).toEqual(['First']);
	});

	it('keeps only board details, whatever extra fields a caller passes', () => {
		const sneaky = { ...posting('a'), seenAt: DAY1, reopenCount: 9 } as Posting;
		expect(planSync([], [sneaky], DAY1).insert[0]).toMatchObject({ seenAt: null, reopenCount: 0 });
	});
});

describe('sameDetails', () => {
	it('notices a change in any field the board gives, pay included', () => {
		const base = posting('a', {
			pay: { summary: '$1', min: 1, max: 2, currency: 'USD', interval: '1 YEAR' }
		});
		expect(sameDetails(base, { ...base })).toBe(true);
		expect(sameDetails(base, { ...base, location: 'Chicago' })).toBe(false);
		expect(sameDetails(base, { ...base, pay: null })).toBe(false);
		expect(sameDetails({ ...base, pay: null }, { ...base, pay: null })).toBe(true);
		expect(
			sameDetails(base, {
				...base,
				pay: { summary: '$1', min: 1, max: 3, currency: 'USD', interval: '1 YEAR' }
			})
		).toBe(false);
	});
});

// Property tests: a board is a list of postings drawn from a small id pool,
// so days overlap, repeat, drop and bring back postings.
const titles = fc.constantFrom('Engineer', 'Designer', 'QA Engineer');
const boardDay = fc.array(
	fc.record({ id: fc.constantFrom('a', 'b', 'c', 'd', 'e'), title: titles }),
	{ maxLength: 8 }
);
const days = fc.array(boardDay, { minLength: 1, maxLength: 6 });

function simulate(listings: readonly { id: string; title: string }[][]) {
	let store: StoredPosting[] = [];
	listings.forEach((day, index) => {
		const now = new Date(Date.UTC(2026, 10, 1 + index)).toISOString();
		store = run(
			store,
			day.map((j) => posting(j.id, { title: j.title })),
			now
		).store;
	});
	return store;
}

describe('planSync properties', () => {
	it('never stores a posting twice', () => {
		fc.assert(
			fc.property(days, (listings) => {
				const ids = simulate(listings).map((p) => p.id);
				expect(new Set(ids).size).toBe(ids.length);
			})
		);
	});

	it('is idempotent: the same board again changes nothing but the last-seen date', () => {
		fc.assert(
			fc.property(days, (listings) => {
				const store = simulate(listings);
				const last = (listings.at(-1) ?? []).map((j) => posting(j.id, { title: j.title }));
				const again = planSync(store, last, DAY3);
				expect(again.insert).toEqual([]);
				expect(again.update).toEqual([]);
				expect(again.close).toEqual([]);
			})
		);
	});

	it('leaves open exactly what the board lists today', () => {
		fc.assert(
			fc.property(days, (listings) => {
				const store = simulate(listings);
				const open = store
					.filter((p) => p.closedAt === null)
					.map((p) => p.id)
					.sort();
				const listed = [...new Set((listings.at(-1) ?? []).map((j) => j.id))].sort();
				expect(open).toEqual(listed);
			})
		);
	});

	it('never forgets when a posting was first seen, or that I have seen it', () => {
		fc.assert(
			fc.property(days, boardDay, (listings, next) => {
				const before = simulate(listings).map((p) => ({ ...p, seenAt: p.firstSeenAt }));
				const after = run(
					before,
					next.map((j) => posting(j.id, { title: j.title })),
					DAY3
				).store;
				for (const p of before) {
					const now = after.find((q) => q.id === p.id);
					expect(now?.firstSeenAt).toBe(p.firstSeenAt);
					expect(now?.seenAt).toBe(p.seenAt);
				}
			})
		);
	});
});
