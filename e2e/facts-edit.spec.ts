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

test('saves your details', async ({ page }) => {
	await page.goto('/facts');
	await page.getByRole('textbox', { name: 'Name (optional)' }).fill('Jane Doe');
	await page.getByRole('textbox', { name: 'Headline (optional)' }).fill('Full-stack developer');
	await page.getByRole('button', { name: 'Save your details' }).click();
	await expect(page.getByRole('status')).toHaveText('Saved your details.');
	await expect(page.getByText('Edit your details (Jane Doe)…')).toBeVisible();
});

test('saves what you’re looking for, and shows it again on the next visit', async ({ page }) => {
	await page.goto('/facts');
	const wanted = page.getByRole('region', { name: 'What you’re looking for' });
	await wanted.getByRole('checkbox', { name: 'Remote' }).check();
	await wanted.getByRole('checkbox', { name: 'Hybrid' }).check();
	await wanted.getByRole('textbox', { name: 'Area (optional)' }).fill('Chicago area');
	await wanted.getByRole('checkbox', { name: 'Senior' }).check();
	await wanted.getByRole('textbox', { name: 'Pay floor (optional)' }).fill('$130k');
	await wanted
		.getByRole('textbox', { name: 'What you’re looking for (optional)' })
		.fill('Smart people making ingenious products.');
	await wanted.getByRole('button', { name: 'Save what you’re looking for' }).click();
	await expect(page.getByRole('status')).toHaveText('Saved what you’re looking for.');
	await page.reload();
	await expect(wanted.getByRole('checkbox', { name: 'Hybrid' })).toBeChecked();
	await expect(wanted.getByRole('checkbox', { name: 'On site' })).not.toBeChecked();
	await expect(wanted.getByRole('checkbox', { name: 'Senior' })).toBeChecked();
	await expect(wanted.getByRole('textbox', { name: 'Pay floor (optional)' })).toHaveValue('130000');
	await expect(
		wanted.getByRole('textbox', { name: 'What you’re looking for (optional)' })
	).toHaveValue('Smart people making ingenious products.');
});
