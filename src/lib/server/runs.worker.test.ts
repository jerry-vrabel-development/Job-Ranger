import { beforeEach, describe, expect, it } from 'vitest';
import { StoredDataError } from './db.ts';
import { finishRun, KEEP_RUNS_DAYS, recentRuns, recordRunFetch, startRun } from './runs.ts';
import { migratedDb } from './test-db.ts';

const SCHEDULED = new Date('2026-11-29T11:23:00.000Z');
const STARTED = new Date('2026-11-29T11:23:02.000Z');
const FINISHED = new Date('2026-11-29T11:31:40.000Z');
const FETCH = { boards: 17, ok: 16, failed: 1, added: 4, closed: 2, deferred: 0 };

let db: D1Database;

beforeEach(async () => {
	db = await migratedDb();
	await db.prepare('DELETE FROM runs').run();
});

describe('the run record', () => {
	it('starts with only the times, then gains the fetch counts, then how it ended', async () => {
		const id = await startRun(db, SCHEDULED, STARTED);
		expect(await recentRuns(db, 5)).toEqual([
			{
				id,
				scheduledAt: SCHEDULED.toISOString(),
				startedAt: STARTED.toISOString(),
				finishedAt: null,
				fetch: null,
				scoring: null,
				scoringCounts: null,
				problem: null
			}
		]);

		await recordRunFetch(db, id, FETCH);
		expect((await recentRuns(db, 5))[0]?.fetch).toEqual(FETCH);

		const summary = {
			scored: 3,
			unscored: 1,
			waiting: 0,
			spentMicros: 1800,
			stopped: null,
			error: null
		};
		await finishRun(db, id, { kind: 'ran', summary }, null, FINISHED);
		expect(await recentRuns(db, 5)).toMatchObject([
			{
				finishedAt: FINISHED.toISOString(),
				fetch: FETCH,
				scoring: 'ran',
				scoringCounts: { scored: 3, unscored: 1, waiting: 0, spentMicros: 1800, stopped: null },
				problem: null
			}
		]);
	});

	it('keeps a problem in words, and no counts when scoring was off, failed or never reached', async () => {
		for (const kind of ['off', 'failed', 'not reached'] as const) {
			await db.prepare('DELETE FROM runs').run();
			const id = await startRun(db, SCHEDULED, STARTED);
			await finishRun(db, id, { kind }, kind === 'off' ? null : 'It stopped.', FINISHED);
			expect(await recentRuns(db, 1)).toMatchObject([
				{
					scoring: kind === 'not reached' ? null : kind,
					scoringCounts: null,
					problem: kind === 'off' ? null : 'It stopped.'
				}
			]);
		}
	});

	it('records why scoring stopped', async () => {
		const id = await startRun(db, SCHEDULED, STARTED);
		const summary = {
			scored: 0,
			unscored: 0,
			waiting: 5,
			spentMicros: 0,
			stopped: 'error' as const,
			error: 'The API key was refused (401).'
		};
		await finishRun(db, id, { kind: 'ran', summary }, 'Scoring failed.', FINISHED);
		expect((await recentRuns(db, 1))[0]?.scoringCounts?.stopped).toBe('error');
	});

	it('lists the newest first, as many as asked for', async () => {
		const day = (n: number) => new Date(STARTED.getTime() + n * 86_400_000);
		for (const n of [0, 2, 1]) await startRun(db, day(n), day(n));
		expect((await recentRuns(db, 2)).map((run) => run.startedAt)).toEqual([
			day(2).toISOString(),
			day(1).toISOString()
		]);
	});

	it(`deletes runs older than ${String(KEEP_RUNS_DAYS)} days when a new one starts`, async () => {
		const daysAgo = (n: number) => new Date(STARTED.getTime() - n * 86_400_000);
		await startRun(db, daysAgo(KEEP_RUNS_DAYS + 1), daysAgo(KEEP_RUNS_DAYS + 1));
		await startRun(db, daysAgo(KEEP_RUNS_DAYS - 1), daysAgo(KEEP_RUNS_DAYS - 1));
		await startRun(db, SCHEDULED, STARTED);
		expect((await recentRuns(db, 10)).map((run) => run.startedAt)).toEqual([
			STARTED.toISOString(),
			daysAgo(KEEP_RUNS_DAYS - 1).toISOString()
		]);
	});

	it('fails loudly on a stored word it doesn’t know', async () => {
		const id = await startRun(db, SCHEDULED, STARTED);
		// The table's own checks forbid this, so they're switched off for the test.
		await db.batch([
			db.prepare('PRAGMA ignore_check_constraints = ON'),
			db
				.prepare(
					`UPDATE runs SET scoring = 'ran', scored = 0, unscored = 0, waiting = 0,
					 spent_micros = 0, stopped = 'tired' WHERE id = ?1`
				)
				.bind(id),
			db.prepare('PRAGMA ignore_check_constraints = OFF')
		]);
		await expect(recentRuns(db, 1)).rejects.toThrow(
			new StoredDataError('stopped is not a known word')
		);
	});
});
