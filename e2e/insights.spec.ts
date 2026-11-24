import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// From e2e/seed.sql: 46 jobs (45 open) and 4 applications, one of them interviewing. The
// application dates are relative to today, so one is waiting, one due a follow-up, one at no reply.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function violations(page: Page) {
	return (await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map(
		(v) => `${v.id}: ${v.help}`
	);
}

test.describe('Insights: My search', () => {
	test('shows the funnel with every step in words, and the numbers as a table', async ({
		page
	}) => {
		await page.goto('/insights');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Insights');
		await expect(page.getByRole('link', { name: 'Insights' })).toHaveAttribute(
			'aria-current',
			'page'
		);
		await expect(page.getByText('46 jobs found, 45 open now.')).toBeVisible();

		const funnel = page.getByRole('figure', { name: /From saved to offer/ });
		await expect(funnel.locator('figcaption').getByText('From saved to offer')).toBeVisible();
		await expect(
			funnel.getByText(
				'You saved 4 jobs, applied to 4, and heard back from 1; 1 reached an interview.'
			)
		).toBeVisible();
		// Each step says its name and count; under 5 before it, no percentage.
		await expect(funnel.getByRole('listitem')).toHaveText([
			'Saved 4',
			'Applied 4',
			'Replied 1',
			'Interviewing 1',
			'Offer 0'
		]);

		const numbers = funnel.getByRole('table', { name: 'From saved to offer' });
		await expect(numbers).toBeHidden();
		await funnel.getByText('Show the numbers').click();
		await expect(numbers.getByRole('row')).toHaveText([
			'StepCountShare of the step before',
			'Saved4—',
			'Applied4—',
			'Replied1—',
			'Interviewing1—',
			'Offer0—'
		]);

		await expect(page.getByRole('heading', { name: 'Waiting to hear' })).toBeVisible();
		await expect(page.getByRole('list').last().getByRole('listitem')).toHaveText([
			'1 to follow up now',
			'1 waiting to hear',
			'1 with no reply'
		]);
		expect(await violations(page)).toEqual([]);
	});

	test('passes the accessibility checks in dark mode too', async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
		await page.goto('/insights');
		await page.getByText('Show the numbers').click();
		expect(await violations(page)).toEqual([]);
	});
});
