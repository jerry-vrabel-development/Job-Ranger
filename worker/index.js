// The Worker's entry point: SvelteKit's fetch handler. The adapter writes
// SvelteKit's worker to .svelte-kit (see sveltekit.wrangler.jsonc); `npm run
// build` must run before Wrangler bundles this file. The daily cron runs in its
// own Worker (cron/, design note 0010); this file goes with the move to
// adapter 9.
import kit from '../.svelte-kit/cloudflare/_worker.js';

export default {
	fetch: kit.fetch
};
