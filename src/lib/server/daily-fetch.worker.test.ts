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
import { listBoardStatus, listCounts, listOpenPostings, StoredDataError } from './db.ts';
import { recentRuns } from './runs.ts';
import { scheduled, SCORING_DEADLINE_MS } from './scheduled.ts';
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
	await db.batch([
		db.prepare('DELETE FROM postings'),
		db.prepare('DELETE FROM boards'),
		db.prepare('DELETE FROM runs')
	]);
});

/** The test database, except that statements matching `pattern` throw, as if D1 were down. */
function failingOn(pattern: RegExp): D1Database {
	return new Proxy(db, {
		get(target, property): unknown {
			if (property === 'prepare') {
				return (sql: string) => {
					if (pattern.test(sql)) throw new Error('D1 is down');
					return target.prepare(sql);
				};
			}
			const value: unknown = Reflect.get(target, property);
			return typeof value === 'function' ? value.bind(target) : value;
		}
	});
}

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

	// The heaviest test: 202 boards and two full runs. CI machines are slower
	// than a laptop, so it gets more than the default 5 seconds.
	it(
		'reads one board per request, and at most the per-run limit',
		{ timeout: 30_000 },
		async () => {
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
		}
	);

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

	it('records the run: its times, the fetch counts, and scoring off', async () => {
		await addBoard(db, example);
		vi.spyOn(console, 'log').mockImplementation(() => undefined);
		let now = DAY1.getTime() + 2000;
		await scheduled(
			{ scheduledTime: DAY1.getTime() },
			{ DB: db },
			network({ example: json(recorded) }),
			() => (now += 1000)
		);
		expect(await recentRuns(db, 5)).toMatchObject([
			{
				scheduledAt: DAY1.toISOString(),
				startedAt: new Date(DAY1.getTime() + 3000).toISOString(),
				finishedAt: new Date(DAY1.getTime() + 4000).toISOString(),
				fetch: { boards: 1, ok: 1, failed: 0, added: 2, closed: 0, deferred: 0 },
				scoring: 'off',
				scoringCounts: null,
				problem: null
			}
		]);
		vi.restoreAllMocks();
	});

	it('records a fetch that stops part way, in its own words, and still fails the run', async () => {
		await addBoard(db, example);
		const fetcher = network({ example: json(recorded) });
		await expect(
			scheduled(
				{ scheduledTime: DAY1.getTime() },
				{ DB: failingOn(/FROM boards WHERE paused/) },
				fetcher
			)
		).rejects.toThrow('D1 is down');
		expect(await recentRuns(db, 1)).toMatchObject([
			{
				fetch: null,
				scoring: null,
				problem: 'The fetch stopped part way through (Something unexpected went wrong).'
			}
		]);
		expect((await recentRuns(db, 1))[0]?.finishedAt).not.toBeNull();
	});

	it('leaves the run unfinished when even the record can’t be written', async () => {
		await addBoard(db, example);
		await expect(
			scheduled(
				{ scheduledTime: DAY1.getTime() },
				{ DB: failingOn(/FROM boards WHERE paused|UPDATE runs SET finished_at/) },
				network({ example: json(recorded) })
			)
		).rejects.toThrow('D1 is down');
		expect(await recentRuns(db, 1)).toMatchObject([{ finishedAt: null, problem: null }]);
	});

	it('does nothing when the run can’t even be started', async () => {
		await addBoard(db, example);
		const fetcher = network({ example: json(recorded) });
		await expect(
			scheduled({ scheduledTime: DAY1.getTime() }, { DB: failingOn(/INSERT INTO runs/) }, fetcher)
		).rejects.toThrow('D1 is down');
		expect(fetcher).not.toHaveBeenCalled();
		expect(await recentRuns(db, 1)).toEqual([]);
	});
});

describe('scheduled scoring', () => {
	/** An Anthropic messages answer in the documented tool-use shape (not recorded live). */
	const scoreAnswer = () =>
		Response.json({
			id: 'msg_01',
			type: 'message',
			role: 'assistant',
			content: [
				{
					type: 'tool_use',
					id: 'toolu_01',
					name: 'score_job',
					input: {
						score: 4,
						summary: 'It is a build role.',
						reasons: [
							{
								direction: 'for',
								text: 'You like building.',
								cites: [{ quote: 'things people can use' }]
							}
						]
					}
				}
			],
			model: 'claude-haiku-5-5',
			stop_reason: 'tool_use',
			stop_sequence: null,
			usage: { input_tokens: 3000, output_tokens: 300 }
		});

	it('skips scoring, and says so, when there is no API key', async () => {
		await addBoard(db, example);
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		await scheduled(
			{ scheduledTime: DAY1.getTime() },
			{ DB: db },
			network({ example: json(recorded) })
		);
		expect(log).toHaveBeenLastCalledWith(
			JSON.stringify({ event: 'scoring', skipped: 'not set up' })
		);
		log.mockRestore();
	});

	it('scores the new jobs after the fetch, checks each answer against its own posting, and logs counts only', async () => {
		await addBoard(db, example);
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const fetcher = network({ example: json(recorded), messages: scoreAnswer });
		await scheduled(
			{ scheduledTime: DAY1.getTime() },
			{ DB: db, ANTHROPIC_API_KEY: ' sk-test ', SCORE_DAILY_CAP_USD: '0.25' },
			fetcher
		);
		// The same answer quotes the first job's words, so the second ("Test everything.") stays unscored.
		const { results } = await db
			.prepare('SELECT ok, score, why FROM job_scores ORDER BY ok DESC')
			.all();
		expect(results).toEqual([
			{ ok: 1, score: 4, why: '' },
			{
				ok: 0,
				score: null,
				why: 'None of the model’s reasons could be traced, so it isn’t scored.'
			}
		]);
		expect(log).toHaveBeenLastCalledWith(
			JSON.stringify({
				event: 'scoring',
				scored: 1,
				unscored: 1,
				waiting: 0,
				spentMicros: 900,
				stopped: null
			})
		);
		const [, init] =
			fetcher.mock.calls.find(([input]) =>
				(input instanceof Request ? input.url : input.toString()).includes('anthropic')
			) ?? [];
		expect(new Headers(init?.headers).get('x-api-key')).toBe('sk-test');
		expect(log.mock.calls.flat().join(' ')).not.toContain('Example');
		expect(await recentRuns(db, 1)).toMatchObject([
			{
				scoring: 'ran',
				scoringCounts: { scored: 1, unscored: 1, waiting: 0, spentMicros: 900, stopped: null },
				problem: null
			}
		]);
		log.mockRestore();
	});

	it('records a scoring error in words, and logs counts only', async () => {
		await addBoard(db, example);
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		await scheduled(
			{ scheduledTime: DAY1.getTime() },
			{ DB: db, ANTHROPIC_API_KEY: 'sk-wrong' },
			network({
				example: json(recorded),
				messages: () => Response.json({ type: 'error' }, { status: 401 })
			})
		);
		expect(await recentRuns(db, 1)).toMatchObject([
			{
				scoring: 'ran',
				scoringCounts: { stopped: 'error' },
				problem: 'Scoring failed. The API key was refused (401).'
			}
		]);
		expect(log).toHaveBeenLastCalledWith(
			JSON.stringify({
				event: 'scoring',
				scored: 0,
				unscored: 0,
				waiting: 2,
				spentMicros: 0,
				stopped: 'error'
			})
		);
		log.mockRestore();
	});

	it('records scoring that stops part way as failed', async () => {
		await addBoard(db, example);
		vi.spyOn(console, 'log').mockImplementation(() => undefined);
		await expect(
			scheduled(
				{ scheduledTime: DAY1.getTime() },
				{ DB: failingOn(/FROM facts/), ANTHROPIC_API_KEY: 'sk-test' },
				network({ example: json(recorded), messages: scoreAnswer })
			)
		).rejects.toThrow('D1 is down');
		expect(await recentRuns(db, 1)).toMatchObject([
			{
				fetch: { boards: 1, ok: 1 },
				scoring: 'failed',
				problem: 'Scoring stopped part way through (Something unexpected went wrong).'
			}
		]);
		vi.restoreAllMocks();
	});

	it('stops when the scoring deadline has passed', async () => {
		await addBoard(db, example);
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		let now = 0;
		await scheduled(
			{ scheduledTime: DAY1.getTime() },
			{ DB: db, ANTHROPIC_API_KEY: 'sk-test' },
			network({ example: json(recorded), messages: scoreAnswer }),
			() => (now += SCORING_DEADLINE_MS)
		);
		expect(log).toHaveBeenLastCalledWith(
			JSON.stringify({
				event: 'scoring',
				scored: 0,
				unscored: 0,
				waiting: 2,
				spentMicros: 0,
				stopped: 'time'
			})
		);
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

describe('daily open-job counts', () => {
	it('records each board’s open jobs once a day, keeping the day’s last count', async () => {
		await addBoard(db, example);
		await runDailyFetch(db, network({ example: json(recorded) }), DAY1);
		const smaller = { ...recorded, jobs: recorded.jobs.slice(1) };
		await runDailyFetch(db, network({ example: json(smaller) }), DAY2);
		// A second check on the same day replaces that day's count.
		await runDailyFetch(db, network({ example: json(recorded) }), DAY2);
		expect(await listCounts(db, 'ashby', 'example')).toEqual([
			{ day: '2026-11-16', openJobs: 2 },
			{ day: '2026-11-17', openJobs: 2 }
		]);
	});

	it('records nothing for a board that could not be read: unknown is not zero', async () => {
		await addBoard(db, missing);
		await runDailyFetch(db, network({}), DAY1);
		expect(await listCounts(db, 'ashby', 'missing')).toEqual([]);
	});
});
