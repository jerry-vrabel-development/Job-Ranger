import { expect, test } from '@playwright/test';

// These change the data, so they run once, after every other browser test (playwright.config.ts).

test.describe.configure({ mode: 'serial' });

test('adds, pastes, edits, confirms, retires, restores and removes facts', async ({ page }) => {
	await page.goto('/facts');
	const status = page.getByRole('status');

	await page
		.getByRole('textbox', { name: 'Fact', exact: true })
		.first()
		.fill('Mentored three junior developers.');
	await page.getByRole('textbox', { name: 'Where (optional)' }).first().fill('Example Co');
	await page.getByRole('button', { name: 'Add fact' }).click();
	await expect(status).toHaveText('Added “Mentored three junior developers.”.');

	await page.getByText('Paste many facts…').click();
	await page
		.getByRole('textbox', { name: 'Facts, one per line' })
		.fill(
			'# pasted\nskill | professional | Example Co | 2020 | Kubernetes\nskill | side | | | Raspberry Pi and Home Assistant'
		);
	await page.getByRole('button', { name: 'Add facts to check' }).click();
	await expect(status).toHaveText('Added 1 fact to check; 1 was already in your bank.');
	await expect(page.getByRole('heading', { name: 'To check (2)' })).toBeVisible();

	const kubernetes = page.getByRole('article', { name: 'Kubernetes' });
	await kubernetes.locator('summary', { hasText: 'Edit' }).click();
	await kubernetes
		.getByRole('combobox', { name: 'Experience' })
		.selectOption({ label: 'Learning now' });
	await kubernetes.getByRole('button', { name: 'Save Kubernetes' }).click();
	await expect(status).toHaveText('Saved “Kubernetes”.');
	await expect(
		kubernetes.getByText('Skill or tool · Learning now · Example Co · 2020')
	).toBeVisible();

	await page.getByRole('button', { name: 'Confirm Kubernetes' }).click();
	await expect(status).toHaveText('Confirmed “Kubernetes”.');
	await expect(page.getByRole('heading', { name: 'To check (1)' })).toBeVisible();

	await page.getByRole('button', { name: 'Retire Kubernetes' }).click();
	await expect(status).toHaveText(
		"Retired “Kubernetes”. It won't be used, and Restore brings it back."
	);
	await expect(page.getByRole('heading', { name: 'Retired (1)' })).toBeVisible();
	await page.getByRole('button', { name: 'Restore Kubernetes' }).click();
	await expect(status).toHaveText('Restored “Kubernetes”.');

	const mentored = page.getByRole('article', { name: 'Mentored three junior developers.' });
	await mentored.locator('summary', { hasText: 'Remove' }).click();
	await mentored.getByRole('button', { name: 'Remove Mentored three junior developers.' }).click();
	await expect(status).toHaveText('Removed “Mentored three junior developers.”.');
	await expect(
		page.getByRole('article', { name: 'Mentored three junior developers.' })
	).toHaveCount(0);
});
