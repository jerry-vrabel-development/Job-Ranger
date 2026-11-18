import { expect, test } from '@playwright/test';

// These tests change the data (pause, resume, remove), so they run once, after every other
// browser test, in their own project (see playwright.config.ts). On your own machine, run the
// browser tests with a fresh server (npm run test:e2e reseeds when it starts one).

test.describe.configure({ mode: 'serial' });

test('pausing hides a company’s jobs, and resuming brings them back', async ({ page }) => {
	await page.goto('/companies');
	await page.getByRole('button', { name: 'Pause Civic Co' }).click();

	const status = page.getByRole('status');
	await expect(status).toHaveText(/Paused Civic Co\. Its jobs are hidden/);
	await expect(status).toBeFocused();
	const civic = page.getByRole('article', { name: /^Civic Co/ });
	await expect(civic.getByText('Paused', { exact: true })).toBeVisible();
	await expect(civic.getByText('(hidden while paused)')).toBeVisible();
	await expect(page.getByText('Watching 2 of 3 companies.')).toBeVisible();

	await page.goto('/jobs');
	await expect(page.getByText('43 open jobs from 2 job boards, newest first.')).toBeVisible();
	await expect(page.getByRole('heading', { name: /Benefits Access/ })).toHaveCount(0);

	await page.goto('/companies');
	await page.getByRole('button', { name: 'Resume Civic Co' }).click();
	await expect(page.getByRole('status')).toHaveText(/Resumed Civic Co\./);
	await page.goto('/jobs');
	await expect(page.getByText('44 open jobs from 3 job boards, newest first.')).toBeVisible();
});

test('removing a company asks first, then says what went', async ({ page }) => {
	await page.goto('/companies');
	await page.locator('summary', { hasText: 'Quiet Co' }).click();
	await expect(page.getByText(/This removes Quiet Co and every job stored for it/)).toBeVisible();
	await page.getByRole('button', { name: 'Remove Quiet Co' }).click();

	await expect(page.getByRole('status')).toHaveText('Removed Quiet Co and its 0 jobs.');
	await expect(page.getByRole('heading', { level: 3 })).toHaveText(['Civic Co', 'Example Co']);
});
