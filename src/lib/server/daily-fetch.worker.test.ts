import { NO_FILTER } from '#lib/jobs/filter.ts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Board } from '#lib/jobs/posting.ts';
import recorded from '#lib/sources/fixtures/ashby-board.json' with { type: 'json' };
import { SourceFormatError, SourceHttpError } from '#lib/sources/source.ts';
import {
	ADAPTERS,
	failureNote,
	MAX_BOARDS_PER_RUN,
	runDailyFetch,
	TIME_BUDGET_MS,
	successNote
} from './daily-fetch.ts';
import { listBoardStatus, listOpenPostings, StoredDataError } from './db.ts';
import { scheduled } from './scheduled.ts';
import { addBoard, migratedDb } from './test-db.ts';

const DAY1 = new Date('2026-11-16T11:23:00.000Z');
const DAY2 = new Date('2026-11-17T11:23:00.000Z');

const example: Board = { source: 'ashby', token: 'example', company: 'Example Co' };
const missing: Board = { source: 'ashby', token: 'missing', company: 'Missing Co' };

/** A network that answers per board name, and records what was asked. */
function network(boards: Record<string, () => Response>) {
	return vi.fn<typeof fetch>((input) => {
		const url = new URL(input instanceof Request ? input.url : String(input));
		const token = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
		const answer = boards[token];
		return Promise.resolve(answer ? answer() : new Response('not found', { status: 404 }));
	});
}

const json = (body: unknown) => () => Response.json(body);

let db: D1Database;

beforeEach(async () => {
	db = await migratedDb();
	await db.batch([db.prepare('DELETE FROM postings'), db.prepare('DELETE FROM boards')]);
});

describe('runDailyFetch', () => {
	it('fills the list from a board, with real apply links, and notes how it went', async () => {
		await addBoard(db, example);
		const summary = await runDailyFetch(db, network({ example: json(recorded) }), DAY1);
		expect(summary).toEqual({ boards: 1, ok: 1, failed: 0, added: 2, closed: 0, deferred: 0 });

		const open = await listOpenPostings(db);
		expect(open.map((p) => p.title)).toEqual([
			'Senior Software Engineer, Accessibility',
			'QA Engineer'
		]);
		expect(open.every((p) => p.applyUrl.startsWith('https://jobs.ashbyhq.com/example/'))).toBe(
			true
		);
		expect(open[0]?.company).toBe('Example Co');

		const [status] = await listBoardStatus(db);
		expect(status).toMatchObject({
			lastFetchedAt: DAY1.toISOString(),
			lastFetchOk: true,
			lastFetchNote: '2 open, 2 new, 0 closed. Left out: 1 no apply link, 1 unlisted.'
		});
	});

	it('closes what left the board the next day, and never re-adds what it has', async () => {
		await addBoard(db, example);
		await runDailyFetch(db, network({ example: json(recorded) }), DAY1);
		const smaller = { ...recorded, jobs: recorded.jobs.slice(1) };
		const summary = await runDailyFetch(db, network({ example: json(smaller) }), DAY2);
		expect(summary).toMatchObject({ added: 0, closed: 1 });
		expect((await listOpenPostings(db)).map((p) => p.title)).toEqual(['QA Engineer']);
	});

	it('records a failed board and carries on with the rest', async () => {
		await addBoard(db, example);
		await addBoard(db, missing);
		const summary = await runDailyFetch(db, network({ example: json(recorded) }), DAY1);
		expect(summary).toEqual({ boards: 2, ok: 1, failed: 1, added: 2, closed: 0, deferred: 0 });
		const statuses = await listBoardStatus(db);
		expect(statuses.find((b) => b.token === 'missing')).toMatchObject({
			lastFetchOk: false,
			lastFetchNote: 'Board not found (404)'
		});
	});

	it('keeps yesterday’s list when a board’s format changes, and says so', async () => {
		await addBoard(db, example);
		await runDailyFetch(db, network({ example: json(recorded) }), DAY1);
		await runDailyFetch(db, network({ example: json({ postings: [] }) }), DAY2);
		expect(await listOpenPostings(db)).toHaveLength(2);
		expect((await listBoardStatus(db))[0]?.lastFetchNote).toMatch(/^The board's format changed/);
	});

	it('reads one board per request, and at most the per-run limit', async () => {
		const boards = Array.from({ length: MAX_BOARDS_PER_RUN + 2 }, (_, i) => ({
			source: 'ashby' as const,
			token: `board-${String(i).padStart(3, '0')}`,
			company: `Company ${String(i).padStart(3, '0')}`
		}));
		for (const board of boards) await addBoard(db, board);
		const fetcher = network({});
		const summary = await runDailyFetch(db, fetcher, DAY1);
		expect(summary.boards).toBe(MAX_BOARDS_PER_RUN);
		expect(fetcher).toHaveBeenCalledTimes(MAX_BOARDS_PER_RUN);
		// The two left out go first tomorrow.
		const tomorrow = network({});
		await runDailyFetch(db, tomorrow, DAY2);
		const [first] = tomorrow.mock.calls[0] ?? [];
		expect(first).toBe(ADAPTERS.ashby.boardUrl(`board-${String(MAX_BOARDS_PER_RUN)}`));
	});

	it('stops starting boards when the time budget runs out, and goes on tomorrow', async () => {
		for (const token of ['a', 'b', 'c', 'd']) {
			await addBoard(db, { source: 'ashby', token, company: `Company ${token}` });
		}
		// Each board takes four minutes on this clock, so the budget fits three
		// starts at most (0, 4 and 8 minutes in) and stops before a fourth.
		let minutes = 0;
		const clock = () => minutes * 60_000;
		const slow = vi.fn<typeof fetch>(() => {
			minutes += 4;
			return Promise.resolve(Response.json({ jobs: [] }));
		});
		const summary = await runDailyFetch(db, slow, DAY1, clock);
		expect(minutes * 60_000).toBeGreaterThanOrEqual(TIME_BUDGET_MS);
		expect(summary).toMatchObject({ boards: 3, ok: 3, deferred: 1 });
		// The board it didn't reach is first in line the next day.
		const tomorrow = network({});
		await runDailyFetch(db, tomorrow, DAY2);
		const [first] = tomorrow.mock.calls[0] ?? [];
		expect(first).toBe(ADAPTERS.ashby.boardUrl('d'));
	});

	it('handles a big board: hundreds of jobs with long descriptions', async () => {
		await addBoard(db, example);
		const description = 'Build accessible software. '.repeat(400);
		const jobs = Array.from({ length: 600 }, (_, i) => ({
			id: `job-${String(i)}`,
			title: `Software Engineer ${String(i)}`,
			isListed: true,
			location: 'Remote',
			workplaceType: 'Remote',
			publishedAt: '2026-11-10T00:00:00.000Z',
			applyUrl: `https://jobs.ashbyhq.com/example/job-${String(i)}/application`,
			descriptionHtml: `<p>${description}</p>`,
			descriptionPlain: description
		}));
		const summary = await runDailyFetch(db, network({ example: json({ jobs }) }), DAY1);
		expect(summary).toMatchObject({ ok: 1, added: 600 });
		expect(await listOpenPostings(db, NO_FILTER, 1000)).toHaveLength(600);
		const again = await runDailyFetch(db, network({ example: json({ jobs }) }), DAY2);
		expect(again).toMatchObject({ ok: 1, added: 0, closed: 0 });
	});

	it('does nothing, quietly, with no boards', async () => {
		const fetcher = network({});
		expect(await runDailyFetch(db, fetcher, DAY1)).toEqual({
			boards: 0,
			ok: 0,
			failed: 0,
			added: 0,
			closed: 0,
			deferred: 0
		});
		expect(fetcher).not.toHaveBeenCalled();
	});
});

describe('scheduled', () => {
	it('runs the fetch at the scheduled time and logs counts only', async () => {
		await addBoard(db, example);
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		await scheduled(
			{ scheduledTime: DAY1.getTime() },
			{ DB: db },
			network({ example: json(recorded) })
		);
		expect(log).toHaveBeenCalledWith(
			JSON.stringify({
				event: 'daily-fetch',
				boards: 1,
				ok: 1,
				failed: 0,
				added: 2,
				closed: 0,
				deferred: 0
			})
		);
		const logged = log.mock.calls.flat().join(' ');
		expect(logged).not.toContain('Example');
		expect(logged).not.toContain('example');
		expect((await listBoardStatus(db))[0]?.lastFetchedAt).toBe(DAY1.toISOString());
		log.mockRestore();
	});
});

describe('notes', () => {
	it('words a clean run without a "left out" part', () => {
		expect(
			successNote(1, 1, 0, { 'no-apply-link': 0, 'missing-id': 0, 'missing-title': 0, unlisted: 0 })
		).toBe('1 open, 1 new, 0 closed.');
		expect(
			successNote(0, 0, 0, { 'no-apply-link': 0, 'missing-id': 2, 'missing-title': 1, unlisted: 0 })
		).toBe('0 open, 0 new, 0 closed. Left out: 2 no id, 1 no title.');
	});

	it('words each kind of failure in its own words, never the board’s', () => {
		expect(failureNote(new SourceHttpError(500))).toBe('Board answered 500');
		expect(failureNote(new SourceFormatError('x'))).toBe("The board's format changed: x");
		expect(failureNote(new StoredDataError('y'))).toBe('Stored data problem: y');
		expect(failureNote(new DOMException('slow', 'TimeoutError'))).toBe('The board took too long');
		expect(failureNote(new Error('<html>secret</html>'))).toBe('Something unexpected went wrong');
		expect(failureNote('odd')).toBe('Something unexpected went wrong');
	});
});
