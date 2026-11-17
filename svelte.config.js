import adapter from '@sveltejs/adapter-cloudflare';
import { ANNOUNCER_STYLE, styleHash } from './src/lib/csp.js';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Runes mode for this project's code (libraries decide for themselves).
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter(),
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
	}
};

export default config;
