import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The applications in e2e/seed.sql are dated relative to today, so these groups always hold.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('the tracker', () => {
	test('groups applications by what needs me first, in words', async ({ page }) => {
		await page.goto('/tracker');
		await expect(page.getByRole('heading', { level: 2 })).toHaveText([
			'Follow up now (1)',
			'Interviewing (1)',
			'Waiting to hear (1)',
			'No reply (1)'
		]);
		const due = page.getByRole('article', { name: 'Software Engineer 2' });
		await expect(
			due.getByText('Applied: Applied 10 days ago with no reply: a good time to follow up.')
		).toBeVisible();
		await expect(
			due.getByRole('button', { name: 'I followed up today on Software Engineer 2 at Example Co' })
		).toBeVisible();
		await expect(
			page
				.getByRole('article', { name: 'Software Engineer 3' })
				.getByText(/^Applied: No reply in 45 days\. You can stop waiting/)
		).toBeVisible();
		const talking = page.getByRole('article', { name: 'Software Engineer 4' });
		await expect(talking.getByText('Interviewing: Interviewing, for 2 days.')).toBeVisible();
		await expect(talking.getByText('Your note: Call with Sam.')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Tracker' })).toHaveAttribute(
			'aria-current',
			'page'
		);
		expect(
			(await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map(
				(v) => `${v.id}: ${v.help}`
			)
		).toEqual([]);
	});

	test('shows where an application stands on its kit', async ({ page }) => {
		await page.goto('/apply/ashby/example/job-2');
		await expect(
			page.getByText(
				/You applied on .*\. Applied 10 days ago with no reply: a good time to follow up\./
			)
		).toBeVisible();
		await expect(page.getByRole('combobox', { name: 'Where it stands' })).toHaveValue('applied');
		await expect(page.getByRole('button', { name: 'I followed up today' })).toBeVisible();
	});
});
