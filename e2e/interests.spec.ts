import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Data comes from e2e/seed.sql: Accessibility (with keywords) and Civic tech (tagged on Civic Co).
// These tests change nothing; adding, editing and removing are in interests-edit.spec.ts.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('the interests page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/interests');
	});

	test('has one main heading, a clear title, and lists each interest in words', async ({
		page
	}) => {
		await expect(page).toHaveTitle('Interests · Job Ranger');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Interests');
		await expect(page.getByRole('heading', { level: 3 })).toHaveText([
			'Accessibility',
			'Civic tech'
		]);
		const access = page.getByRole('article', { name: 'Accessibility' });
		await expect(access.getByText('Inclusive design and the people it serves')).toBeVisible();
		await expect(access.getByRole('definition')).toHaveText([
			'accessibility, a11y',
			'None tagged yet'
		]);
		const civic = page.getByRole('article', { name: 'Civic tech' });
		await expect(civic.getByRole('definition')).toHaveText(['None', 'Civic Co']);
	});

	test('shows each company as a checkbox, tagged ones ticked', async ({ page }) => {
		await page
			.locator('summary')
			.filter({ hasText: 'Civic tech' })
			.filter({ hasText: 'Edit' })
			.click();
		const tags = page.getByRole('group', { name: 'Companies tagged with Civic tech' });
		await expect(tags.getByRole('checkbox', { name: 'Civic Co' })).toBeChecked();
		await expect(tags.getByRole('checkbox', { name: 'Example Co' })).not.toBeChecked();
		await expect(page.getByRole('textbox', { name: 'Name' }).nth(1)).toHaveValue('Civic tech');
	});

	test('explains a problem next to its field, and puts focus there', async ({ page }) => {
		await page.getByRole('button', { name: 'Add interest' }).click();
		const name = page.getByRole('textbox', { name: 'Name' }).first();
		await expect(name).toBeFocused();
		await expect(name).toHaveAttribute('aria-invalid', 'true');
		await expect(name).toHaveAccessibleDescription(/Give the interest a name\./);

		await name.fill('Robots');
		const keywords = page.getByRole('textbox', { name: /^Keywords/ }).first();
		await keywords.fill('robot; drop table');
		await page.getByRole('button', { name: 'Add interest' }).click();
		await expect(keywords).toBeFocused();
		await expect(keywords).toHaveAccessibleDescription(/can't be a keyword/);
		await expect(name).toHaveValue('Robots');
	});

	test('refuses a name already used, in any case', async ({ page }) => {
		await page.getByRole('textbox', { name: 'Name' }).first().fill('ACCESSIBILITY');
		await page.getByRole('button', { name: 'Add interest' }).click();
		await expect(
			page.getByText('Error: You already have an interest called ACCESSIBILITY.')
		).toBeVisible();
	});

	test('is in the main navigation, marked when you are on it', async ({ page }) => {
		await expect(
			page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Interests' })
		).toHaveAttribute('aria-current', 'page');
	});

	for (const colorScheme of ['light', 'dark'] as const) {
		test(`has no WCAG 2.2 AA violations (${colorScheme})`, async ({ page }) => {
			await page.emulateMedia({ colorScheme });
			await page.goto('/interests');
			await page
				.locator('summary')
				.filter({ hasText: 'Civic tech' })
				.filter({ hasText: 'Edit' })
				.click();
			await page.locator('summary').filter({ hasText: 'Remove' }).first().click();
			expect(
				(await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map(
					(v) => `${v.id}: ${v.help}`
				)
			).toEqual([]);
		});
	}

	test('reflows at 320 pixels wide, edit form open', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 640 });
		await page.goto('/interests');
		await page
			.locator('summary')
			.filter({ hasText: 'Civic tech' })
			.filter({ hasText: 'Edit' })
			.click();
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
	});

	test('works without JavaScript', async ({ browser }) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto('/interests');
		await page
			.getByRole('textbox', { name: 'Note (optional)' })
			.first()
			.fill('kept after the error');
		await page.getByRole('button', { name: 'Add interest' }).click();
		await expect(page.getByText('Error: Give the interest a name.')).toBeVisible();
		await expect(page.getByRole('textbox', { name: 'Note (optional)' }).first()).toHaveValue(
			'kept after the error'
		);
		await context.close();
	});
});
