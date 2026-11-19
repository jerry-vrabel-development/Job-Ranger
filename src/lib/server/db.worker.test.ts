import { NO_FILTER } from '#lib/jobs/filter.ts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Board, Posting } from '#lib/jobs/posting.ts';
import { planSync, type StoredPosting } from '#lib/jobs/sync.ts';
import {
	count,
	countOpenPostings,
	findBoard,
	insertBoard,
	listBoardStatus,
	listBoardsToFetch,
	listOpenPostings,
	loadBoard,
	markAllSeen,
	recordFetch,
	listCounts,
	removeBoard,
	setPaused,
	StoredDataError,
	toStoredPosting,
	WRITE_CHUNK,
	writePlan
} from './db.ts';
import { addBoard, migratedDb } from './test-db.ts';

const DAY1 = '2026-11-16T11:23:00.000Z';
const DAY2 = '2026-11-17T11:23:00.000Z';

const example: Board = { source: 'ashby', token: 'example', company: 'Example Co' };
const other: Board = { source: 'ashby', token: 'other', company: 'Another Co' };

function posting(id: string, overrides: Partial<Posting> = {}): Posting {
	return {
		source: 'ashby',
		board: 'example',
		id,
		company: 'Example Co',
		title: `Engineer ${id}`,
		location: 'Chicago, IL',
		workplace: 'hybrid',
		employmentType: 'Full time',
		department: 'Engineering',
		applyUrl: `https://jobs.ashbyhq.com/example/${id}/application`,
		jobUrl: `https://jobs.ashbyhq.com/example/${id}`,
		postedAt: DAY1,
		pay: {
			summary: '$150K - $180K',
			min: 150000,
			max: 180000,
			currency: 'USD',
			interval: '1 YEAR'
		},
		...overrides
	};
}

async function sync(db: D1Database, board: Board, incoming: Posting[], now: string) {
	const plan = planSync(await loadBoard(db, board), incoming, now);
	await writePlan(db, board, plan, now);
	return plan;
}

let db: D1Database;

beforeEach(async () => {
	db = await migratedDb();
	await db.batch([db.prepare('DELETE FROM postings'), db.prepare('DELETE FROM boards')]);
	await addBoard(db, example);
	await addBoard(db, other);
});

describe('writePlan and loadBoard', () => {
	it('round-trips every field of a posting exactly', async () => {
		await sync(db, example, [posting('a'), posting('b', { pay: null, jobUrl: null })], DAY1);
		const stored = await loadBoard(db, example);
		const byId = new Map(stored.map((p) => [p.id, p]));
		expect(byId.get('a')).toEqual({
			...posting('a'),
			firstSeenAt: DAY1,
			lastSeenAt: DAY1,
			closedAt: null,
			reopenCount: 0,
			seenAt: null
		} satisfies StoredPosting);
		expect(byId.get('b')?.pay).toBeNull();
		expect(byId.get('b')?.jobUrl).toBeNull();
	});

	it('touches, updates and closes on the next day, as the plan says', async () => {
		await sync(db, example, [posting('a'), posting('b'), posting('c')], DAY1);
		const plan = await sync(db, example, [posting('a'), posting('b', { title: 'Lead' })], DAY2);
		expect(plan.touch).toEqual(['a']);
		const stored = new Map((await loadBoard(db, example)).map((p) => [p.id, p]));
		expect(stored.get('a')).toMatchObject({ lastSeenAt: DAY2, firstSeenAt: DAY1, closedAt: null });
		expect(stored.get('b')).toMatchObject({ title: 'Lead', lastSeenAt: DAY2 });
		expect(stored.get('c')).toMatchObject({ closedAt: DAY2, lastSeenAt: DAY1 });
	});

	it('keeps boards apart: the same id on two boards is two postings', async () => {
		await sync(db, example, [posting('a')], DAY1);
		await sync(db, other, [posting('a', { board: 'other', company: 'Another Co' })], DAY1);
		expect(await loadBoard(db, example)).toHaveLength(1);
		expect(await loadBoard(db, other)).toHaveLength(1);
		// Closing one board's posting leaves the other's open.
		await sync(db, example, [], DAY2);
		expect((await loadBoard(db, other))[0]?.closedAt).toBeNull();
	});

	it('writes a big board in chunks, in one go', async () => {
		const many = Array.from({ length: WRITE_CHUNK * 2 + 7 }, (_, i) => posting(`job-${String(i)}`));
		await sync(db, example, many, DAY1);
		expect(await loadBoard(db, example)).toHaveLength(many.length);
		const plan = await sync(db, example, many.slice(0, WRITE_CHUNK + 3), DAY2);
		expect(plan.touch).toHaveLength(WRITE_CHUNK + 3);
		expect(plan.close).toHaveLength(WRITE_CHUNK + 4);
		const open = (await loadBoard(db, example)).filter((p) => p.closedAt === null);
		expect(open).toHaveLength(WRITE_CHUNK + 3);
		expect(open.every((p) => p.lastSeenAt === DAY2)).toBe(true);
	});

	it('does nothing when there is nothing to write', async () => {
		await writePlan(db, example, { insert: [], update: [], touch: [], close: [] }, DAY1);
		expect(await loadBoard(db, example)).toEqual([]);
	});

	it('refuses a posting without an https apply link, even if code slips', async () => {
		const bad = { ...posting('a'), applyUrl: 'http://example.com/apply' };
		await expect(sync(db, example, [bad], DAY1)).rejects.toThrow();
		expect(await loadBoard(db, example)).toEqual([]);
	});
});

describe('listOpenPostings', () => {
	it('lists open postings newest first, undated last', async () => {
		await sync(
			db,
			example,
			[
				posting('old', { postedAt: '2026-11-01T00:00:00.000Z' }),
				posting('undated', { postedAt: null }),
				posting('new', { postedAt: '2026-11-15T00:00:00.000Z' }),
				posting('gone')
			],
			DAY1
		);
		await sync(
			db,
			example,
			[
				posting('old', { postedAt: '2026-11-01T00:00:00.000Z' }),
				posting('undated', { postedAt: null }),
				posting('new', { postedAt: '2026-11-15T00:00:00.000Z' })
			],
			DAY2
		);
		expect((await listOpenPostings(db)).map((p) => p.id)).toEqual(['new', 'old', 'undated']);
		expect(await listOpenPostings(db, NO_FILTER, 1)).toHaveLength(1);
	});
});

describe('markAllSeen', () => {
	it('marks open, new postings seen, once', async () => {
		await sync(db, example, [posting('a'), posting('b')], DAY1);
		expect(await markAllSeen(db, DAY2)).toBe(2);
		expect(await markAllSeen(db, DAY2)).toBe(0);
		expect((await listOpenPostings(db)).every((p) => p.seenAt === DAY2)).toBe(true);
	});
});

describe('boards', () => {
	it('starts with the boards never fetched, then the stalest', async () => {
		await recordFetch(db, example, DAY1, true, '1 open');
		expect((await listBoardsToFetch(db, 10)).map((b) => b.token)).toEqual(['other', 'example']);
		await recordFetch(db, other, DAY2, true, '0 open');
		expect((await listBoardsToFetch(db, 10)).map((b) => b.token)).toEqual(['example', 'other']);
		expect(await listBoardsToFetch(db, 1)).toHaveLength(1);
	});

	it('shows each board with how its last fetch went', async () => {
		await recordFetch(db, example, DAY1, false, 'Board not found (404)');
		expect(await listBoardStatus(db)).toEqual([
			{
				source: 'ashby',
				token: 'other',
				company: 'Another Co',
				lastFetchedAt: null,
				lastFetchOk: null,
				lastFetchNote: null,
				paused: false,
				openJobs: 0
			},
			{
				source: 'ashby',
				token: 'example',
				company: 'Example Co',
				lastFetchedAt: DAY1,
				lastFetchOk: false,
				lastFetchNote: 'Board not found (404)',
				paused: false,
				openJobs: 0
			}
		]);
	});

	it('counts open jobs per board, not closed ones', async () => {
		await sync(db, example, [posting('a'), posting('b')], DAY1);
		await sync(db, example, [posting('a')], DAY2);
		expect(await findBoard(db, 'ashby', 'example')).toMatchObject({ openJobs: 1 });
	});

	it('finds one board, or says it is not there', async () => {
		expect(await findBoard(db, 'ashby', 'example')).toMatchObject({ company: 'Example Co' });
		expect(await findBoard(db, 'ashby', 'nope')).toBeNull();
		expect(await findBoard(db, 'greenhouse', 'example')).toBeNull();
	});

	it('adds a board once, and leaves an existing one alone', async () => {
		const board: Board = { source: 'greenhouse', token: 'splice', company: 'Splice' };
		expect(await insertBoard(db, board)).toBe(true);
		expect(await insertBoard(db, { ...board, company: 'Renamed' })).toBe(false);
		expect(await findBoard(db, 'greenhouse', 'splice')).toMatchObject({
			company: 'Splice',
			paused: false,
			lastFetchOk: null
		});
	});

	it('pauses a board: skipped by the fetch, its jobs hidden, its history kept', async () => {
		await sync(db, example, [posting('a')], DAY1);
		await sync(db, other, [posting('x', { board: 'other', company: 'Another Co' })], DAY1);

		expect(await setPaused(db, 'ashby', 'example', true)).toBe('Example Co');
		expect((await listBoardsToFetch(db, 10)).map((b) => b.token)).toEqual(['other']);
		expect((await listOpenPostings(db)).map((p) => p.id)).toEqual(['x']);
		// Marking seen only touches what you can see.
		expect(await markAllSeen(db, DAY2)).toBe(1);
		expect(await findBoard(db, 'ashby', 'example')).toMatchObject({ paused: true, openJobs: 1 });
		expect(await loadBoard(db, example)).toHaveLength(1);

		expect(await setPaused(db, 'ashby', 'example', false)).toBe('Example Co');
		expect((await listOpenPostings(db)).map((p) => p.id).sort()).toEqual(['a', 'x']);
		expect((await loadBoard(db, example))[0]?.seenAt).toBeNull();
	});

	it('says when there is no board to pause', async () => {
		expect(await setPaused(db, 'ashby', 'nope', true)).toBeNull();
	});

	it('removes a board with everything stored for it, and says how much went', async () => {
		await sync(db, example, [posting('a'), posting('b')], DAY1);
		await sync(db, example, [posting('a')], DAY2);
		expect(await removeBoard(db, 'ashby', 'example')).toEqual({
			company: 'Example Co',
			jobs: 2
		});
		expect(await loadBoard(db, example)).toEqual([]);
		expect(await findBoard(db, 'ashby', 'example')).toBeNull();
		expect(await findBoard(db, 'ashby', 'other')).not.toBeNull();
		expect(await removeBoard(db, 'ashby', 'example')).toBeNull();
	});

	it('removes a company’s count history with it, and only its own', async () => {
		await recordFetch(db, example, DAY1, true, '3 open', 3);
		await recordFetch(db, other, DAY1, true, '5 open', 5);
		await recordFetch(db, other, DAY1, false, 'Board not found (404)', 9);
		await removeBoard(db, 'ashby', 'example');
		expect(await listCounts(db, 'ashby', 'example')).toEqual([]);
		expect(await listCounts(db, 'ashby', 'other')).toEqual([{ day: '2026-11-16', openJobs: 5 }]);
	});

	it('fails loudly on a stored pause flag it does not know', async () => {
		// The column's CHECK keeps this out of real data; the reader checks anyway.
		await db.prepare('PRAGMA ignore_check_constraints = ON').run();
		await db.prepare("UPDATE boards SET paused = 2 WHERE token = 'example'").run();
		await db.prepare('PRAGMA ignore_check_constraints = OFF').run();
		await expect(listBoardStatus(db)).rejects.toThrow(StoredDataError);
	});

	it('only accepts lowercase board names from sources it knows', async () => {
		await expect(
			addBoard(db, { source: 'ashby', token: 'Example', company: 'X' })
		).rejects.toThrow();
		await expect(
			db.prepare("INSERT INTO boards (source, token, company) VALUES ('nope', 'x', 'X')").run()
		).rejects.toThrow();
	});

	it('removing a board removes its postings', async () => {
		await sync(db, example, [posting('a')], DAY1);
		await db.prepare("DELETE FROM boards WHERE token = 'example'").run();
		expect(await loadBoard(db, example)).toEqual([]);
	});
});

describe('toStoredPosting', () => {
	const row = {
		source: 'ashby',
		board: 'example',
		id: 'a',
		company: 'Example Co',
		title: 'Engineer',
		location: 'Remote',
		workplace: 'remote',
		employment_type: null,
		department: null,
		apply_url: 'https://jobs.ashbyhq.com/example/a',
		job_url: null,
		posted_at: null,
		pay_summary: null,
		first_seen_at: DAY1,
		last_seen_at: DAY1,
		closed_at: null,
		reopen_count: null,
		seen_at: null
	};

	it('reads a valid row', () => {
		expect(toStoredPosting(row)).toMatchObject({ id: 'a', pay: null, reopenCount: 0 });
	});

	it('fails loudly on a bad row', () => {
		for (const broken of [
			{ ...row, source: 'workday' },
			{ ...row, workplace: 'moon' },
			{ ...row, title: 7 },
			{ ...row, department: 7 },
			{ ...row, pay_summary: '$1', pay_min: 'one' }
		]) {
			expect(() => toStoredPosting(broken)).toThrow(StoredDataError);
		}
	});
});

describe('count', () => {
	it('reads a count, and fails loudly when there is none', () => {
		expect(count({ n: 3 }, 'n')).toBe(3);
		expect(() => count({ n: '3' }, 'n')).toThrow(StoredDataError);
		expect(() => count({}, 'n')).toThrow(StoredDataError);
		expect(() => count(undefined, 'n')).toThrow(StoredDataError);
		expect(() => count(null, 'n')).toThrow(StoredDataError);
	});
});

describe('listOpenPostings and countOpenPostings with a filter', () => {
	beforeEach(async () => {
		await sync(
			db,
			example,
			[
				posting('fw', { title: 'Firmware Engineer', department: 'Hardware', workplace: 'remote' }),
				posting('pm', { title: 'Product Manager, 50% Travel', location: 'Austin, TX' }),
				posting('ux', { title: 'Designer', department: 'Product_Design', workplace: 'on-site' })
			],
			DAY1
		);
		await sync(
			db,
			other,
			[posting('o1', { board: 'other', company: 'Another Co', title: 'Firmware Lead' })],
			DAY1
		);
	});

	const ids = async (filter: Partial<typeof NO_FILTER>) =>
		(await listOpenPostings(db, { ...NO_FILTER, ...filter })).map((p) => p.id).sort();

	it('matches every word, in any case, across title, team, location and company', async () => {
		expect(await ids({ words: ['firmware'] })).toEqual(['fw', 'o1']);
		expect(await ids({ words: ['firmware', 'hardware'] })).toEqual(['fw']);
		expect(await ids({ words: ['austin'] })).toEqual(['pm']);
		expect(await ids({ words: ['another'] })).toEqual(['o1']);
		expect(await countOpenPostings(db, { ...NO_FILTER, words: ['firmware'] })).toBe(2);
	});

	it('searches for % and _ as the characters themselves', async () => {
		expect(await ids({ words: ['50%'] })).toEqual(['pm']);
		expect(await ids({ words: ['%'] })).toEqual(['pm']);
		expect(await ids({ words: ['product_design'] })).toEqual(['ux']);
		expect(await ids({ words: ['_'] })).toEqual(['ux']);
	});

	it('filters by company, workplace and new', async () => {
		expect(await ids({ board: { source: 'ashby', token: 'other' } })).toEqual(['o1']);
		expect(await ids({ board: { source: 'greenhouse', token: 'other' } })).toEqual([]);
		expect(await ids({ workplace: 'on-site' })).toEqual(['ux']);
		await db.prepare("UPDATE postings SET seen_at = ?1 WHERE id = 'fw'").bind(DAY2).run();
		expect(await ids({ onlyNew: true })).toEqual(['o1', 'pm', 'ux']);
	});

	it('counts all matches even when the list stops at its limit', async () => {
		expect(await listOpenPostings(db, NO_FILTER, 2)).toHaveLength(2);
		expect(await countOpenPostings(db)).toBe(4);
	});

	it('leaves out paused companies, in the list and the count', async () => {
		await setPaused(db, 'ashby', 'other', true);
		expect(await ids({ words: ['firmware'] })).toEqual(['fw']);
		expect(await countOpenPostings(db)).toBe(3);
	});
});
