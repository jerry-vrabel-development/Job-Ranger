import { expect, test } from '@playwright/test';

// The test server lets localhost in (ACCESS_LOCAL_DEV), as a developer's
// machine does. Asked for under any other host name, the same built Worker
// must stay closed: the lock is on, not just configured at the edge.

const ELSEWHERE = { host: 'job-ranger.example.workers.dev' };

test.describe('sign-in', () => {
	for (const path of ['/', '/jobs', '/a-page-that-does-not-exist']) {
		test(`keeps ${path} closed when sign-in is not set up`, async ({ request }) => {
			const response = await request.get(path, { headers: ELSEWHERE });
			expect(response.status()).toBe(503);
			expect(await response.text()).toBe('Sign-in is not set up yet, so Job Ranger is closed.');
			expect(response.headers()['cache-control']).toBe('no-store');
			expect(response.headers()['x-content-type-options']).toBe('nosniff');
		});
	}

	test('refuses a forged Access token', async ({ request }) => {
		const response = await request.get('/jobs', {
			headers: { ...ELSEWHERE, 'cf-access-jwt-assertion': 'forged.token.value' }
		});
		expect(response.status()).toBe(503);
	});

	test('refuses "Mark all as seen" from outside', async ({ request }) => {
		const response = await request.post('/jobs?/seen', {
			headers: { ...ELSEWHERE, origin: `https://${ELSEWHERE.host}`, accept: 'text/html' },
			form: {}
		});
		expect(response.status()).toBe(503);
	});
});
