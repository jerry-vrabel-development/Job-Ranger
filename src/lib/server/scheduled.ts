/**
 * The daily Worker's cron handler (cron/index.ts, `triggers` in
 * cron/wrangler.jsonc; design note 0010). First the daily fetch, then
 * scoring the new jobs it found (design note 0008), if scoring is set up.
 */
import { failureNote, runDailyFetch } from './daily-fetch.ts';
import { capMicros } from './drafts.ts';
import { chooseModel, PROVIDERS, SCORING } from './models/model.ts';
import { finishRun, recordRunFetch, startRun } from './runs.ts';
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
	const db = env.DB;
	// The record of this run (design note 0011). If even this write fails, the
	// run stops here and the app reports the missing run.
	const run = await startRun(db, now, new Date(began));
	let stage: 'fetch' | 'scoring' = 'fetch';
	try {
		const summary = await runDailyFetch(db, fetcher, now);
		// Counts only; which companies I'm watching stays out of the logs.
		console.log(JSON.stringify({ event: 'daily-fetch', ...summary }));
		await recordRunFetch(db, run, summary);

		const setting = (name: string) => {
			const value = env[name];
			return typeof value === 'string' ? value.trim() : '';
		};
		const setup = chooseModel(PROVIDERS, setting, fetcher, SCORING);
		if (!setup.ok) {
			console.log(JSON.stringify({ event: 'scoring', skipped: 'not set up' }));
			await finishRun(db, run, { kind: 'off' }, null, new Date(clock()));
			return;
		}
		stage = 'scoring';
		const scoring = await scoreNewJobs(db, setup, {
			capMicros: capMicros(setting('SCORE_DAILY_CAP_USD'), SCORE_CAP_USD),
			now,
			deadline: began + SCORING_DEADLINE_MS,
			clock
		});
		const { error, ...counts } = scoring;
		console.log(JSON.stringify({ event: 'scoring', ...counts }));
		const problem = error === null ? null : `Scoring failed. ${error}`;
		await finishRun(db, run, { kind: 'ran', summary: scoring }, problem, new Date(clock()));
	} catch (error) {
		const problem =
			stage === 'fetch'
				? `The fetch stopped part way through (${failureNote(error)}).`
				: `Scoring stopped part way through (${failureNote(error)}).`;
		const scoring =
			stage === 'fetch' ? { kind: 'not reached' as const } : { kind: 'failed' as const };
		try {
			await finishRun(db, run, scoring, problem, new Date(clock()));
		} catch {
			// The database is what failed: the row stays unfinished, and the app
			// reports a run that didn't finish.
		}
		// Rethrown, so Cloudflare still records the run as failed.
		throw error;
	}
}
