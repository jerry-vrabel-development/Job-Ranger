import { expect, test } from '@playwright/test';

// These change the data, so they run once, after every other browser test (playwright.config.ts).

test.describe.configure({ mode: 'serial' });

test('adds, edits and removes an answer', async ({ page }) => {
	await page.goto('/answers');
	const status = page.getByRole('status');

	await page
		.getByRole('combobox', { name: 'Question' })
		.first()
		.selectOption({ label: 'Pay expectations' });
	await page
		.getByRole('textbox', { name: 'Answer', exact: true })
		.first()
		.fill('I am looking for a fair range for the role.\n\nHappy to talk it through.');
	await page
		.getByRole('combobox', { name: 'How it was written' })
		.first()
		.selectOption({ label: 'AI draft, edited by me' });
	await page.getByRole('button', { name: 'Save answer' }).click();
	await expect(status).toHaveText('Saved your answer.');

	const pay = page.getByRole('article', { name: 'Pay expectations' });
	await expect(pay.getByText('AI draft, edited by me · 15 words')).toBeVisible();
	await pay.locator('summary', { hasText: 'Edit' }).click();
	await pay.getByRole('textbox', { name: 'Name (optional)' }).fill('short');
	await pay
		.getByRole('combobox', { name: 'How it was written' })
		.selectOption({ label: 'My own words' });
	await pay.getByRole('button', { name: 'Save Pay expectations' }).click();
	await expect(status).toHaveText('Saved your changes.');
	const short = page.getByRole('article', { name: 'Pay expectations, short' });
	await expect(short.getByText('short · My own words · 15 words')).toBeVisible();

	await short.locator('summary', { hasText: 'Remove' }).click();
	await short.getByRole('button', { name: 'Remove Pay expectations, short' }).click();
	await expect(status).toHaveText('Removed the answer.');
	await expect(page.getByRole('article', { name: 'Pay expectations, short' })).toHaveCount(0);
});
