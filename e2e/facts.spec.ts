import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Data comes from e2e/seed.sql: one confirmed fact, one pasted fact to check.
// These tests change nothing; adding, confirming and removing are in facts-edit.spec.ts.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('the facts page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/facts');
	});

	test('has a clear title, counts in words, and puts facts to check first', async ({ page }) => {
		await expect(page).toHaveTitle('Facts · Job Ranger');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Facts');
		await expect(page.getByText('2 facts: 1 confirmed, 1 to check, 0 retired.')).toBeVisible();
		await expect(page.getByRole('heading', { level: 2 })).toHaveText([
			'To check (1)',
			'Add a fact',
			'Confirmed facts'
		]);
		const pasted = page.getByRole('article', { name: 'Raspberry Pi and Home Assistant' });
		await expect(
			pasted.getByText('Skill or tool · Side project or hobby · Home lab · around 2015')
		).toBeVisible();
		await expect(
			pasted.getByRole('button', { name: 'Confirm Raspberry Pi and Home Assistant' })
		).toBeVisible();
		const typed = page.getByRole('article', { name: /^Led the checkout rebuild/ });
		await expect(page.getByRole('heading', { level: 3 })).toHaveText(['Accomplishment (1)']);
		await expect(typed.getByText('Professional · Example Co · 2019–2021')).toBeVisible();
		await expect(typed.getByRole('button', { name: /^Confirm/ })).toHaveCount(0);
	});

	test('explains a problem next to its field, and puts focus there', async ({ page }) => {
		await page.getByRole('textbox', { name: 'Where (optional)' }).first().fill('Somewhere');
		await page.getByRole('button', { name: 'Add fact' }).click();
		const fact = page.getByRole('textbox', { name: 'Fact', exact: true }).first();
		await expect(fact).toBeFocused();
		await expect(fact).toHaveAttribute('aria-invalid', 'true');
		await expect(fact).toHaveAccessibleDescription(/Write the fact itself\./);
		await expect(page.getByRole('textbox', { name: 'Where (optional)' }).first()).toHaveValue(
			'Somewhere'
		);
	});

	test('says which pasted lines are wrong, adds nothing, and keeps the paste', async ({ page }) => {
		await page.getByText('Paste many facts…').click();
		const box = page.getByRole('textbox', { name: 'Facts, one per line' });
		await box.fill('skill | side | | | Fine line\njust words');
		await page.getByRole('button', { name: 'Add facts to check' }).click();
		await expect(box).toBeFocused();
		await expect(box).toHaveAccessibleDescription(
			/Nothing was added\. Line 2 needs five parts separated by \|\./
		);
		await expect(box).toHaveValue('skill | side | | | Fine line\njust words');
		await expect(page.getByText('2 facts: 1 confirmed, 1 to check, 0 retired.')).toBeVisible();
	});

	test('is in the main navigation, marked when you are on it', async ({ page }) => {
		await expect(
			page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Facts' })
		).toHaveAttribute('aria-current', 'page');
	});

	for (const colorScheme of ['light', 'dark'] as const) {
		test(`has no WCAG 2.2 AA violations (${colorScheme})`, async ({ page }) => {
			await page.emulateMedia({ colorScheme });
			await page.goto('/facts');
			await page.getByText('Paste many facts…').click();
			for (const summary of await page.locator('article summary').all()) await summary.click();
			expect(
				(await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map(
					(v) => `${v.id}: ${v.help}`
				)
			).toEqual([]);
		});
	}

	test('reflows at 320 pixels wide, forms open', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 640 });
		await page.goto('/facts');
		await page.getByText('Paste many facts…').click();
		for (const summary of await page.locator('article summary').all()) await summary.click();
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
	});

	test('works without JavaScript', async ({ browser }) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto('/facts');
		await page.getByRole('textbox', { name: 'When (optional)' }).first().fill('2020');
		await page.getByRole('button', { name: 'Add fact' }).click();
		await expect(page.getByText('Error: Write the fact itself.')).toBeVisible();
		await expect(page.getByRole('textbox', { name: 'When (optional)' }).first()).toHaveValue(
			'2020'
		);
		await context.close();
	});
});
