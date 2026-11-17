import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANNOUNCER_STYLE, styleHash } from './csp.js';

describe('styleHash', () => {
	it('is the base64 SHA-256 of the exact style, as browsers compute it', () => {
		// The hash Chrome reported for the announcer's style.
		expect(styleHash(ANNOUNCER_STYLE)).toBe('sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo=');
		expect(styleHash(`${ANNOUNCER_STYLE};`)).not.toBe(styleHash(ANNOUNCER_STYLE));
	});
});

describe('the announcer style', () => {
	it('still matches the one the installed SvelteKit renders', () => {
		// If a SvelteKit upgrade changes the announcer's style, this fails here
		// instead of the browser quietly blocking it: update ANNOUNCER_STYLE.
		const kit = dirname(createRequire(import.meta.url).resolve('@sveltejs/kit/package.json'));
		const root = readFileSync(join(kit, 'src/runtime/components/root.svelte'), 'utf8');
		expect(root).toContain(`id="svelte-announcer"`);
		expect(root).toContain(`style="${ANNOUNCER_STYLE}"`);
	});
});
