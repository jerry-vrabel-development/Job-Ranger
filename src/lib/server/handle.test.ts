import type { RequestEvent } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createHandle } from './handle.ts';

// The Worker's bindings, as the hook sees them. Each test sets what it needs.
const workerEnv: Record<string, unknown> = {};
const handle = createHandle(() => workerEnv);

function event(url: string): RequestEvent {
	return { request: new Request(url) } as RequestEvent;
}

const app = vi.fn(() =>
	Promise.resolve(new Response('the page', { headers: { 'X-Test': 'kept' } }))
);

beforeEach(() => {
	for (const key of Object.keys(workerEnv)) Reflect.deleteProperty(workerEnv, key);
	app.mockClear();
});

describe('handle', () => {
	it('stays closed, with the security headers, when sign-in is not set up', async () => {
		const response = await handle({
			event: event('https://job-ranger.example.workers.dev/jobs'),
			resolve: app
		});
		expect(response.status).toBe(503);
		expect(await response.text()).toBe('Sign-in is not set up yet, so Job Ranger is closed.');
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(app).not.toHaveBeenCalled();
	});

	it('refuses a request that did not come through Access', async () => {
		Object.assign(workerEnv, {
			ACCESS_TEAM_DOMAIN: 'https://example-team.cloudflareaccess.com',
			ACCESS_AUD: 'a'.repeat(64),
			ACCESS_ALLOWED_EMAILS: 'jerry@example.com'
		});
		const response = await handle({
			event: event('https://job-ranger.example.workers.dev/'),
			resolve: app
		});
		expect(response.status).toBe(403);
		expect(app).not.toHaveBeenCalled();
	});

	it('serves the app, with the security headers, in local development', async () => {
		workerEnv['ACCESS_LOCAL_DEV'] = 'true';
		const response = await handle({ event: event('http://localhost:4173/jobs'), resolve: app });
		expect(response.status).toBe(200);
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(response.headers.get('X-Test')).toBe('kept');
		expect(await response.text()).toBe('the page');
	});
});
