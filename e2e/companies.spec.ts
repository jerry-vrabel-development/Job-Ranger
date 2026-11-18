import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Data comes from e2e/seed.sql: Example Co and Quiet Co on Ashby, Civic Co on Greenhouse.
// These tests change nothing (a refused link is never saved), so they run in parallel.
// The ones that pause and remove are in companies-edit.spec.ts.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('the companies page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/companies');
	});

	test('has one main heading, a clear title, and lists every company', async ({ page }) => {
		await expect(page).toHaveTitle('Companies · Job Ranger');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Companies');
		await expect(page.getByText('Watching 3 of 3 companies.')).toBeVisible();
		const names = page.getByRole('heading', { level: 3 });
		await expect(names).toHaveText(['Civic Co', 'Example Co', 'Quiet Co']);
	});

	test('says each company’s board, jobs and last check in words', async ({ page }) => {
		const civic = page.getByRole('article', { name: 'Civic Co' });
		await expect(civic.getByText('Greenhouse: civic')).toBeVisible();
		await expect(civic.getByText('Read on')).toBeVisible();
		const quiet = page.getByRole('article', { name: 'Quiet Co' });
		await expect(quiet.getByText('Could not be read on')).toBeVisible();
		await expect(quiet.getByText('Board not found (404)')).toBeVisible();
	});

	test('names every button for its company', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Check now for Civic Co' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Pause Civic Co' })).toBeVisible();
		await page.locator('summary', { hasText: 'Civic Co' }).click();
		await expect(page.getByRole('button', { name: 'Remove Civic Co' })).toBeVisible();
	});

	test('explains a link it cannot use, keeps what was typed, and puts focus on it', async ({
		page
	}) => {
		const link = page.getByRole('textbox', { name: 'Job board link' });
		await link.fill('https://www.example.com/careers');
		await page.getByRole('textbox', { name: 'Company name' }).fill('Example Careers');
		await page.getByRole('button', { name: 'Check and add' }).click();

		await expect(
			page.getByText(/^Error: Job Ranger reads Ashby and Greenhouse boards/)
		).toBeVisible();
		await expect(link).toBeFocused();
		await expect(link).toHaveAttribute('aria-invalid', 'true');
		await expect(link).toHaveAccessibleDescription(/that link is on www\.example\.com/);
		await expect(link).toHaveValue('https://www.example.com/careers');
		await expect(page.getByRole('textbox', { name: 'Company name' })).toHaveValue(
			'Example Careers'
		);
		await expect(page.getByRole('heading', { level: 3 })).toHaveCount(3);
	});

	test('asks for a company name', async ({ page }) => {
		await page.getByRole('textbox', { name: 'Job board link' }).fill('jobs.ashbyhq.com/someone');
		await page.getByRole('button', { name: 'Check and add' }).click();
		const company = page.getByRole('textbox', { name: 'Company name' });
		await expect(company).toBeFocused();
		await expect(company).toHaveAccessibleDescription(/Give the company a name\./);
	});

	test('is reachable from the main navigation, and marks it', async ({ page }) => {
		await page.goto('/jobs');
		await page
			.getByRole('navigation', { name: 'Main' })
			.getByRole('link', { name: 'Companies' })
			.click();
		await expect(page).toHaveURL(/\/companies$/);
		await expect(
			page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Companies' })
		).toHaveAttribute('aria-current', 'page');
	});

	for (const colorScheme of ['light', 'dark'] as const) {
		test(`has no WCAG 2.2 AA violations (${colorScheme})`, async ({ page }) => {
			await page.emulateMedia({ colorScheme });
			await page.goto('/companies');
			await page.locator('summary', { hasText: 'Civic Co' }).click();
			expect(
				(await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map(
					(v) => `${v.id}: ${v.help}`
				)
			).toEqual([]);
		});

		test(`has no WCAG 2.2 AA violations with an error showing (${colorScheme})`, async ({
			page
		}) => {
			await page.emulateMedia({ colorScheme });
			await page.goto('/companies');
			await page.getByRole('button', { name: 'Check and add' }).click();
			await expect(page.getByText(/^Error:/)).toBeVisible();
			expect(
				(await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map(
					(v) => `${v.id}: ${v.help}`
				)
			).toEqual([]);
		});
	}

	test('reflows at 320 pixels wide', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 640 });
		await page.goto('/companies');
		await page.locator('summary', { hasText: 'Civic Co' }).click();
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
	});

	test('works without JavaScript', async ({ browser }) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto('/companies');
		await page.getByRole('textbox', { name: 'Job board link' }).fill('not a link');
		await page.getByRole('button', { name: 'Check and add' }).click();
		await expect(page.getByText(/^Error: That doesn't look like a link/)).toBeVisible();
		await expect(page.getByRole('textbox', { name: 'Job board link' })).toHaveValue('not a link');
		await context.close();
	});
});
