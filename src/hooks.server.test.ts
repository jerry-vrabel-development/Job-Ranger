import type { RequestEvent } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { handle } from './hooks.server';

describe('handle', () => {
	it('adds the security headers to whatever the app responds with', async () => {
		const response = await handle({
			event: {} as RequestEvent,
			resolve: () => Promise.resolve(new Response('ok', { headers: { 'X-Test': 'kept' } }))
		});
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(response.headers.get('X-Test')).toBe('kept');
		expect(await response.text()).toBe('ok');
	});
});
