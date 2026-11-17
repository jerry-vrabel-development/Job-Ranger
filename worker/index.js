// The Worker's entry point: SvelteKit's fetch handler, plus the daily fetch
// on a cron. The adapter writes SvelteKit's worker to .svelte-kit (see
// sveltekit.wrangler.jsonc); `npm run build` must run before Wrangler bundles
// this file. The logic lives in src/lib/server/scheduled.ts, where it's tested.
import kit from '../.svelte-kit/cloudflare/_worker.js';
import { scheduled } from '../src/lib/server/scheduled.ts';

export default {
	fetch: kit.fetch,
	scheduled: (controller, env) => scheduled(controller, env, fetch.bind(globalThis))
};
