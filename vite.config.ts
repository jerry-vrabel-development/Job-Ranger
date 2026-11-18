import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { ANNOUNCER_STYLE, styleHash } from './src/lib/csp.js';

export default defineConfig({
	plugins: [
		sveltekit({
			// The adapter writes SvelteKit's worker where sveltekit.wrangler.jsonc
			// says; wrangler.jsonc's entry (worker/index.js) wraps it with the cron.
			// Local dev still gets the real bindings (D1) from wrangler.jsonc.
			adapter: adapter({
				config: 'sveltekit.wrangler.jsonc',
				platformProxy: { configPath: 'wrangler.jsonc' }
			}),
			compilerOptions: {
				// Runes mode for this project's code (libraries decide for themselves).
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// SvelteKit adds hashes or nonces for its own inline script, so nothing
			// else inline runs. No third-party scripts, ever.
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self'],
					// Only the route announcer's one inline style (see src/lib/csp.js).
					'style-src-attr': ['unsafe-hashes', styleHash(ANNOUNCER_STYLE)],
					'img-src': ['self'],
					'font-src': ['self'],
					'connect-src': ['self'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'frame-ancestors': ['none']
				}
			}
		})
	],
	test: {
		// A test with no assertions proves nothing.
		expect: { requireAssertions: true },
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					include: ['src/**/*.{test,spec}.ts'],
					exclude: ['src/**/*.worker.test.ts'],
					environment: 'node'
				}
			},
			{
				// Database tests run in the Workers runtime, against the real
				// migrations, with a fresh local D1 for each test file.
				plugins: [
					cloudflareTest(async () => ({
						miniflare: {
							// Keep these in step with wrangler.jsonc.
							compatibilityDate: '2026-11-17',
							compatibilityFlags: ['nodejs_als'],
							// MIGRATION_DB is a scratch database for the migration tests.
							d1Databases: ['DB', 'MIGRATION_DB'],
							bindings: { TEST_MIGRATIONS: await readD1Migrations('migrations') }
						}
					}))
				],
				test: {
					name: 'workers',
					include: ['src/**/*.worker.test.ts'],
					expect: { requireAssertions: true }
				}
			}
		],
		coverage: {
			// Istanbul works in both Node and the Workers runtime.
			provider: 'istanbul',
			// hooks.server.ts only hands the Worker's env to src/lib/server/handle.ts.
			include: ['src/lib/**/*.{ts,js}'],
			exclude: ['src/**/*.{test,spec}.ts'],
			reporter: ['text', 'json-summary', 'html'],
			// Floors, like the other projects. We aim for 100%.
			thresholds: {
				lines: 95,
				functions: 95,
				branches: 90,
				statements: 95
			}
		}
	}
});
