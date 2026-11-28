/**
 * The daily Worker's cron handler (cron/index.ts, `triggers` in
 * cron/wrangler.jsonc; design note 0010). First the daily fetch, then
 * scoring the new jobs it found (design note 0008), if scoring is set up.
 */
import { runDailyFetch } from './daily-fetch.ts';
import { capMicros } from './drafts.ts';
import { chooseModel, PROVIDERS, SCORING } from './models/model.ts';
import { SCORE_CAP_USD, scoreNewJobs } from './scoring.ts';

/**
 * Scoring stops starting new jobs this long after the run began, leaving
 * room inside the 15 minutes a scheduled run may last (the fetch has 10).
 */
export const SCORING_DEADLINE_MS = 13 * 60 * 1000;

export async function scheduled(
	controller: Pick<ScheduledController, 'scheduledTime'>,
	env: Pick<Env, 'DB'> & Readonly<Record<string, unknown>>,
	fetcher: typeof fetch,
	clock: () => number = Date.now
): Promise<void> {
	const began = clock();
	const now = new Date(controller.scheduledTime);
	const summary = await runDailyFetch(env.DB, fetcher, now);
	// Counts only; which companies I'm watching stays out of the logs.
	console.log(JSON.stringify({ event: 'daily-fetch', ...summary }));

	const setting = (name: string) => {
		const value = env[name];
		return typeof value === 'string' ? value.trim() : '';
	};
	const setup = chooseModel(PROVIDERS, setting, fetcher, SCORING);
	if (!setup.ok) {
		console.log(JSON.stringify({ event: 'scoring', skipped: 'not set up' }));
		return;
	}
	const scoring = await scoreNewJobs(env.DB, setup, {
		capMicros: capMicros(setting('SCORE_DAILY_CAP_USD'), SCORE_CAP_USD),
		now,
		deadline: began + SCORING_DEADLINE_MS,
		clock
	});
	console.log(JSON.stringify({ event: 'scoring', ...scoring }));
}
