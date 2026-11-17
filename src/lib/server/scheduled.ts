/**
 * The Worker's cron handler (see `triggers` in wrangler.jsonc). It sits beside
 * SvelteKit's fetch handler in worker/index.js.
 */
import { runDailyFetch } from './daily-fetch.ts';

export async function scheduled(
	controller: Pick<ScheduledController, 'scheduledTime'>,
	env: Pick<Env, 'DB'>,
	fetcher: typeof fetch
): Promise<void> {
	const summary = await runDailyFetch(env.DB, fetcher, new Date(controller.scheduledTime));
	// Counts only; which companies I'm watching stays out of the logs.
	console.log(JSON.stringify({ event: 'daily-fetch', ...summary }));
}
