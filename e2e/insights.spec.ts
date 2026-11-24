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
		await expect(
			page.getByRole('region', { name: 'My search' }).getByRole('list').last().getByRole('listitem')
		).toHaveText(['1 to follow up now', '1 waiting to hear', '1 with no reply']);
		expect(await violations(page)).toEqual([]);
	});

	test('passes the accessibility checks in dark mode too', async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
		await page.goto('/insights');
		await page
			.getByRole('figure', { name: /From saved to offer/ })
			.getByText('Show the numbers')
			.click();
		expect(await violations(page)).toEqual([]);
	});
});

// From e2e/seed.sql: daily counts dated back from today. Over 7 days Example Co grows, Civic Co
// is steady, Flight Co shrinks (with a two-day gap), and Quiet Co's counts are too new.
test.describe('Insights: Trending companies', () => {
	test('lists companies by change, each said in words, most growth first', async ({ page }) => {
		await page.goto('/insights');
		const trending = page.getByRole('region', { name: 'Trending companies' });
		await expect(page.getByRole('button', { name: 'Last 7 days' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(
			trending.getByText(
				'1 growing, 1 steady and 1 shrinking over 7 days; 1 without enough data yet.'
			)
		).toBeVisible();
		await expect(trending.getByRole('heading', { level: 3 })).toHaveText([
			'Example Co',
			'Civic Co',
			'Flight Co',
			'Quiet Co'
		]);
		const article = (name: string) => trending.getByRole('article', { name });
		await expect(
			article('Example Co').getByText('↑ Growing: 63 → 70 open (+7) in 7 days.')
		).toBeVisible();
		await expect(article('Civic Co').getByText('→ Steady: 13 → 12 open in 7 days.')).toBeVisible();
		await expect(
			article('Flight Co').getByText('↓ Shrinking: 23 → 20 open (−3) in 7 days.')
		).toBeVisible();
		await expect(
			article('Quiet Co').getByText(/^Not enough data yet: counts start [A-Z][a-z]{2} \d+\.$/)
		).toBeVisible();
		expect(await violations(page)).toEqual([]);
	});

	test('reads a chart day by day from the keyboard, gaps included', async ({ page }) => {
		await page.goto('/insights');
		const chart = page.getByRole('slider', { name: 'Flight Co, open jobs by day' });
		// It starts on the latest day: today, 20 open.
		await expect(chart).toHaveAttribute('aria-valuetext', /: 20 open$/);
		await expect(chart).toHaveAttribute('aria-valuenow', '8');
		await chart.focus();
		await page.keyboard.press('ArrowLeft');
		await page.keyboard.press('ArrowLeft');
		await page.keyboard.press('ArrowLeft');
		// Three days back is a failed fetch: a gap, not a zero.
		await expect(chart).toHaveAttribute('aria-valuetext', /: no count that day$/);
		await page.keyboard.press('Home');
		await expect(chart).toHaveAttribute('aria-valuetext', /: 23 open$/);
		await expect(chart).toHaveAttribute('aria-valuenow', '1');
		await page.keyboard.press('End');
		await expect(chart).toHaveAttribute('aria-valuenow', '8');

		const numbers = page
			.getByRole('article', { name: 'Flight Co' })
			.getByRole('table', { name: 'Flight Co: open jobs by day' });
		await page.getByRole('article', { name: 'Flight Co' }).getByText('Show the numbers').click();
		await expect(numbers.getByRole('row')).toHaveCount(9);
		await expect(numbers.getByRole('cell', { name: 'No count' })).toHaveCount(2);
	});

	test('switches to 30 days, in the address so it works without JavaScript', async ({ page }) => {
		await page.goto('/insights');
		await page.getByRole('button', { name: 'Last 30 days' }).click();
		await expect(page).toHaveURL(/\?range=30$/);
		await expect(page.getByRole('button', { name: 'Last 30 days' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		const trending = page.getByRole('region', { name: 'Trending companies' });
		await expect(trending.getByText('↑ Growing: 40 → 70 open (+30) in 30 days.')).toBeVisible();
		await expect(trending.getByText('→ Steady: 12 → 12 open in 30 days.')).toBeVisible();
		await expect(trending.getByText('↓ Shrinking: 35 → 20 open (−15) in 30 days.')).toBeVisible();
		await expect(
			page.getByRole('slider', { name: 'Example Co, open jobs by day' })
		).toHaveAttribute('aria-valuemax', '31');
	});

	test('passes the accessibility checks in dark mode, while reading a chart', async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
		await page.goto('/insights?range=30');
		await page.getByRole('slider', { name: 'Example Co, open jobs by day' }).focus();
		await page.keyboard.press('ArrowLeft');
		expect(await violations(page)).toEqual([]);
	});
});
