// See https://svelte.dev/docs/kit/types#app.d.ts
// Cloudflare bindings (env.DB and so on) come from `cloudflare:workers`, typed
// by worker-configuration.d.ts. SvelteKit 3's adapter has no `platform`.
declare global {
	namespace App {}
}

export {};
