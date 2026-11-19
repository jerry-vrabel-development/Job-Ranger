import { expect, test } from '@playwright/test';

// These change the data, so they run once, after every other browser test (playwright.config.ts).

test.describe.configure({ mode: 'serial' });

test('adds an interest, tags a company, pauses, resumes and removes it', async ({ page }) => {
	await page.goto('/interests');
	await page.getByRole('textbox', { name: 'Name' }).first().fill('Drones');
	await page
		.getByRole('textbox', { name: /^Keywords/ })
		.first()
		.fill('Drone, UAV, flight');
	await page.getByRole('button', { name: 'Add interest' }).click();
	await expect(page.getByRole('status')).toHaveText(
		'Added Drones. Tag companies with it from its Edit form.'
	);
	const drones = page.getByRole('article', { name: /^Drones/ });
	await expect(drones.getByRole('definition').first()).toHaveText('drone, uav, flight');

	await page.locator('summary').filter({ hasText: 'Drones' }).filter({ hasText: 'Edit' }).click();
	await page
		.getByRole('group', { name: 'Companies tagged with Drones' })
		.getByRole('checkbox', { name: 'Flight Co' })
		.check();
	await page.getByRole('button', { name: 'Save Drones' }).click();
	await expect(page.getByRole('status')).toHaveText('Saved Drones.');
	await expect(drones.getByRole('definition').nth(1)).toHaveText('Flight Co');

	await page.getByRole('button', { name: 'Pause Drones' }).click();
	await expect(page.getByRole('status')).toHaveText(
		"Paused Drones. It's hidden from the Jobs filters; its tags are kept."
	);
	await expect(drones.getByText('Paused', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Resume Drones' }).click();
	await expect(page.getByRole('status')).toHaveText('Resumed Drones.');

	await page.locator('summary').filter({ hasText: 'Drones' }).filter({ hasText: 'Remove' }).click();
	await page.getByRole('button', { name: 'Remove Drones' }).click();
	await expect(page.getByRole('status')).toHaveText(
		'Removed Drones. 1 company was tagged with it; the companies and their jobs stay.'
	);
	await expect(page.getByRole('heading', { name: /^Drones/ })).toHaveCount(0);
});
