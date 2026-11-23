import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Changes data, so it runs in the edits project after everything else.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test('saves a job, passes on another with a note, and puts it back', async ({ page }) => {
	await page.goto('/jobs');
	const status = page.getByRole('status').filter({ hasText: /Saved|Passed|back on the list/ });

	const keeper = page.getByRole('article', { name: 'Software Engineer 7', exact: true });
	await keeper.getByRole('button', { name: 'Save Software Engineer 7 at Example Co' }).click();
	await expect(status).toHaveText('Saved Software Engineer 7 at Example Co.');
	await expect(keeper.getByText(/^Saved /)).toBeVisible();

	const nope = page.getByRole('article', { name: 'Software Engineer 8', exact: true });
	await nope.getByText('Pass on this job').click();
	await nope
		.getByRole('textbox', { name: 'Why (optional, just for you)' })
		.fill('Needs a clearance.');
	await nope.getByRole('button', { name: 'Pass on Software Engineer 8 at Example Co' }).click();
	await expect(status).toHaveText(
		'Passed on Software Engineer 8 at Example Co. It’s off the list; choose “Passed only” to see it again.'
	);
	await expect(page.getByRole('article', { name: 'Software Engineer 8', exact: true })).toHaveCount(
		0
	);
	await expect(page.getByText(/1 passed job hidden\./)).toBeVisible();

	await page.goto('/jobs?show=saved');
	await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Software Engineer 7']);

	await page.goto('/jobs?show=passed');
	const passed = page.getByRole('article', { name: 'Software Engineer 8', exact: true });
	await expect(passed.getByText(/^Passed .*: Needs a clearance\.$/)).toBeVisible();
	expect(
		(await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map(
			(v) => `${v.id}: ${v.help}`
		)
	).toEqual([]);
	await passed
		.getByRole('button', { name: 'Put back on the list Software Engineer 8 at Example Co' })
		.click();
	await expect(page.getByRole('status').filter({ hasText: 'back on the list' })).toHaveText(
		'That job is back on the list.'
	);

	await page.goto('/jobs');
	await keeper.getByRole('button', { name: 'Unsave Software Engineer 7 at Example Co' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'no longer saved' })).toHaveText(
		'That job is no longer saved.'
	);
});
