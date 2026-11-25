import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// From e2e/seed.sql: Example Co (Ashby) has 43 open jobs, 1 closed, 1 reopened, 14 with a
// warning, 4 applications and 40 days of growing counts. Civic Co is tagged "Civic tech".

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function violations(page: Page) {
	return (await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map(
		(v) => `${v.id}: ${v.help}`
	);
}

test.describe('the company page', () => {
	test('opens from the Companies list, with the company at a glance', async ({ page }) => {
		await page.goto('/companies');
		await page.getByRole('link', { name: 'Example Co', exact: true }).click();
		await expect(page).toHaveURL(/\/companies\/ashby\/example$/);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Example Co');
		await expect(
			page.getByText(
				'43 open jobs; 1 closed in the last 30 days; 1 open again after closing; 14 jobs with a warning. You’ve applied 4 times.'
			)
		).toBeVisible();
		await expect(page.getByRole('link', { name: 'Ashby: example' })).toHaveAttribute(
			'href',
			'https://jobs.ashbyhq.com/example'
		);
	});

	test('shows hiring momentum in words and as a chart read from the keyboard', async ({ page }) => {
		await page.goto('/companies/ashby/example');
		const momentum = page.getByRole('region', { name: 'Hiring momentum' });
		await expect(momentum.getByRole('listitem')).toHaveText([
			'↑ Growing: 63 → 70 open (+7) in 7 days.',
			'↑ Growing: 40 → 70 open (+30) in 30 days.'
		]);
		const chart = momentum.getByRole('slider', { name: 'Example Co, open jobs by day' });
		await expect(chart).toHaveAttribute('aria-valuemax', '31');
		await chart.focus();
		await page.keyboard.press('Home');
		await expect(chart).toHaveAttribute('aria-valuetext', /: 40 open$/);
	});

	test('lists open jobs with their warnings, closed jobs, and my history', async ({ page }) => {
		await page.goto('/companies/ashby/example');
		const open = page.getByRole('region', { name: 'Open jobs (43)' });
		await expect(open.getByRole('listitem')).toHaveCount(43);
		const warned = open.getByRole('listitem').filter({ hasText: '⚠' });
		await expect(warned).toHaveCount(14);
		await expect(
			warned.filter({ has: page.getByRole('link', { name: 'Software Engineer 3', exact: true }) })
		).toHaveText('Software Engineer 3 ⚠ Pay missing (Illinois)');

		const closed = page.getByRole('region', { name: 'Closed in the last 30 days (1)' });
		await expect(closed.getByRole('listitem')).toHaveText([
			/^Closed Role Closed \w{3} \d+, \d{4}$/
		]);

		const mine = page.getByRole('region', { name: 'You and Example Co' });
		await expect(mine.getByRole('listitem')).toHaveCount(4);
		await expect(mine.getByRole('listitem').filter({ hasText: 'Software Engineer 4' })).toHaveText(
			/Applied \w{3} \d+, \d{4} · Interviewing$/
		);
		await mine.getByRole('link', { name: 'Software Engineer 4' }).click();
		await expect(page).toHaveURL(/\/apply\/ashby\/example\//);
	});

	test('names its interests, and opens from Trending companies', async ({ page }) => {
		await page.goto('/insights');
		await page
			.getByRole('region', { name: 'Trending companies' })
			.getByRole('link', { name: 'Civic Co' })
			.click();
		await expect(page).toHaveURL(/\/companies\/greenhouse\/civic$/);
		await expect(page.getByRole('definition').filter({ hasText: 'Civic tech' })).toBeVisible();
		await expect(page.getByText('Nothing saved, passed or applied to here yet.')).toBeVisible();
	});

	test('says so for a company that isn’t on the list', async ({ page }) => {
		const response = await page.goto('/companies/ashby/not-on-the-list');
		expect(response?.status()).toBe(404);
	});

	test('passes the accessibility checks in light and dark, and works without JavaScript', async ({
		page,
		browser
	}) => {
		for (const colorScheme of ['light', 'dark'] as const) {
			await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
			await page.goto('/companies/ashby/example');
			expect(await violations(page)).toEqual([]);
		}
		const context = await browser.newContext({ javaScriptEnabled: false });
		const still = await context.newPage();
		await still.goto('/companies/ashby/example');
		await expect(still.getByRole('heading', { level: 1 })).toHaveText('Example Co');
		await expect(
			still.getByRole('region', { name: 'Open jobs (43)' }).getByRole('listitem')
		).toHaveCount(43);
		await context.close();
	});
});
