import { expect, test } from '@playwright/test';

// Changes data, so it runs in the edits project after everything else.

test('records a follow-up, and moves an application on from its kit', async ({ page }) => {
	await page.goto('/tracker');
	await page
		.getByRole('button', { name: 'I followed up today on Software Engineer 2 at Example Co' })
		.click();
	await expect(page.getByRole('status')).toHaveText(
		'Recorded your follow-up on Software Engineer 2.'
	);
	await expect(
		page
			.getByRole('article', { name: 'Software Engineer 2' })
			.getByText('Applied: Applied 10 days ago; you followed up.')
	).toBeVisible();

	await page.goto('/apply/ashby/example/job-4');
	await page.getByRole('combobox', { name: 'Where it stands' }).selectOption('offer');
	await page
		.getByRole('textbox', { name: 'Note (optional, just for you)' })
		.fill('Start in January.');
	await page.getByRole('button', { name: 'Update' }).click();
	await expect(page.getByRole('status')).toHaveText('Software Engineer 4 at Example Co: Offer.');

	await page.goto('/tracker');
	const offer = page.getByRole('article', { name: 'Software Engineer 4' });
	await expect(offer.getByText('Offer: Offer.')).toBeVisible();
	await expect(offer.getByText('Your note: Start in January.')).toBeVisible();
});
