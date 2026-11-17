import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
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
