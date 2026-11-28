/**
 * The cron Worker's entry point (cron/index.ts, design note 0010): it hands
 * every scheduled run to the same scheduled() the app has always used, with
 * the Worker's own fetch, and offers nothing else.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const scheduled = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('./scheduled.ts', () => ({ scheduled }));

const { default: worker } = await import('../../../cron/index.ts');

describe('the cron Worker', () => {
	beforeEach(() => {
		scheduled.mockClear();
	});

	it('passes each run, its settings and fetch to scheduled()', async () => {
		const controller = { scheduledTime: Date.UTC(2026, 10, 28, 11, 23), cron: '23 11 * * *' };
		// A stand-in database: the run is handed on, not run here.
		const env = { DB: Object.create(null) as D1Database };
		await worker.scheduled(controller as ScheduledController, env);
		expect(scheduled).toHaveBeenCalledTimes(1);
		const [givenController, givenEnv, fetcher] = scheduled.mock.calls[0] as unknown as [
			unknown,
			unknown,
			unknown
		];
		expect(givenController).toBe(controller);
		expect(givenEnv).toBe(env);
		expect(typeof fetcher).toBe('function');
	});

	it('has no fetch handler, so nothing can reach it from outside', () => {
		expect(Object.keys(worker)).toEqual(['scheduled']);
	});
});
