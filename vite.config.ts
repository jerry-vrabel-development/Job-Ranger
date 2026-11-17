import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { ANNOUNCER_STYLE, styleHash } from './src/lib/csp.js';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter(),
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
		include: ['src/**/*.{test,spec}.ts'],
		environment: 'node',
		coverage: {
			provider: 'v8',
			include: ['src/lib/**/*.{ts,js}', 'src/hooks.server.ts'],
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
