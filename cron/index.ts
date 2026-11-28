/**
 * job-ranger-daily: a Worker that only runs the daily cron (design note
 * 0010). It has no fetch handler, no address and no route, so nothing can
 * reach it from outside. The app Worker is just SvelteKit's.
 *
 * The work itself, the daily fetch and then scoring, is in
 * src/lib/server/scheduled.ts, where it's tested.
 */
import { scheduled } from '../src/lib/server/scheduled.ts';

/** The database and the scoring settings, read by name (see scheduled.ts). */
type Settings = Parameters<typeof scheduled>[1];

export default {
	scheduled: (controller: ScheduledController, env: Settings) =>
		scheduled(controller, env, fetch.bind(globalThis))
};
