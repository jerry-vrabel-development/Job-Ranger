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
		// Read as one phrase, with a space: "Remove Civic Co…", not "RemoveCivic Co…".
		const toggles = page.locator('summary').filter({ hasText: 'Civic Co' });
		await expect(toggles).toHaveText(['Rename Civic Co…', 'Remove Civic Co…']);
		await page.locator('summary', { hasText: 'Remove' }).filter({ hasText: 'Civic Co' }).click();
		await expect(page.getByRole('button', { name: 'Remove Civic Co' })).toBeVisible();
	});

	test('says why each line was not added, and hands those lines back to fix', async ({ page }) => {
		const box = page.getByRole('textbox', { name: 'Job board links, one per line' });
		await box.fill('https://www.example.com/careers\n\nnot a link, Some Co');
		await page.getByRole('button', { name: 'Check and add' }).click();

		const status = page.getByRole('status');
		await expect(status).toContainText('0 companies added, 2 not added.');
		await expect(status).toBeFocused();
		await expect(status.getByRole('listitem')).toHaveText([
			/^Not added \(line 1, https:\/\/www\.example\.com\/careers\):\s+Job Ranger reads Ashby/,
			/^Not added \(line 3, not a link, Some Co\):\s+That doesn't look like a link/
		]);
		await expect(box).toHaveValue('https://www.example.com/careers\nnot a link, Some Co');
		await expect(page.getByRole('heading', { level: 3 })).toHaveCount(3);
	});

	test('explains an empty paste next to the box, and puts focus on it', async ({ page }) => {
		await page.getByRole('button', { name: 'Check and add' }).click();
		const box = page.getByRole('textbox', { name: 'Job board links, one per line' });
		await expect(page.getByText(/^Error: Paste at least one job board link/)).toBeVisible();
		await expect(box).toBeFocused();
		await expect(box).toHaveAttribute('aria-invalid', 'true');
		await expect(box).toHaveAccessibleDescription(/Paste at least one job board link/);
	});

	test('offers to rename each company, with its current name ready to edit', async ({ page }) => {
		await page.locator('summary', { hasText: 'Rename' }).filter({ hasText: 'Civic Co' }).click();
		await expect(page.getByRole('textbox', { name: 'New name for Civic Co' })).toHaveValue(
			'Civic Co'
		);
		await expect(page.getByRole('button', { name: 'Save name for Civic Co' })).toBeVisible();
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
			await page.locator('summary', { hasText: 'Remove' }).filter({ hasText: 'Civic Co' }).click();
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
			await page.getByRole('textbox', { name: 'Job board links, one per line' }).fill('not a link');
			await page.getByRole('button', { name: 'Check and add' }).click();
			await expect(page.getByRole('status')).toContainText('not added');
			expect(
				(await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map(
					(v) => `${v.id}: ${v.help}`
				)
			).toEqual([]);
			await page.getByRole('textbox', { name: 'Job board links, one per line' }).fill('');
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
		await page.locator('summary', { hasText: 'Remove' }).filter({ hasText: 'Civic Co' }).click();
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
	});

	test('works without JavaScript', async ({ browser }) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto('/companies');
		const box = page.getByRole('textbox', { name: 'Job board links, one per line' });
		await box.fill('not a link');
		await page.getByRole('button', { name: 'Check and add' }).click();
		await expect(page.getByRole('status')).toContainText("That doesn't look like a link");
		await expect(box).toHaveValue('not a link');
		await box.fill('');
		await page.getByRole('button', { name: 'Check and add' }).click();
		await expect(page.getByText(/^Error: Paste at least one job board link/)).toBeVisible();
		await context.close();
	});
});
