import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Data comes from e2e/seed.sql: two made-up answers.
// These tests change nothing; adding, editing and removing are in answers-edit.spec.ts.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('the answers page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/answers');
	});

	test('has a clear title and lists answers by question, in words', async ({ page }) => {
		await expect(page).toHaveTitle('Answers · Job Ranger');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Answers');
		await expect(page.getByText('2 answers saved.')).toBeVisible();
		await expect(page.getByRole('heading', { level: 3 })).toHaveText([
			'Work authorization',
			'About you, your story'
		]);
		const story = page.getByRole('article', { name: 'About you, your story, 50 words' });
		await expect(story.getByText('50 words · Written together · 15 words')).toBeVisible();
		await expect(story.getByText('Notes: From voice notes.')).toBeVisible();
		await expect(
			page.getByRole('article', { name: 'Work authorization' }).getByText('My own words · 9 words')
		).toBeVisible();
	});

	test('lists the common questions still without an answer', async ({ page }) => {
		await page.getByText('Common questions without an answer yet (11)').click();
		await expect(
			page.getByRole('listitem').filter({ hasText: /^Pay expectations$/ })
		).toBeVisible();
		await expect(page.getByRole('combobox', { name: 'Question' }).first()).toHaveValue(
			'start_date'
		);
	});

	test('copies an answer and says so', async ({ page, browserName, context }) => {
		const story = page.getByRole('article', { name: 'About you, your story, 50 words' });
		if (browserName === 'chromium') {
			await context.grantPermissions(['clipboard-read', 'clipboard-write']);
			await story.getByRole('button', { name: 'Copy About you, your story, 50 words' }).click();
			await expect(page.getByRole('status')).toHaveText(
				'Copied “About you, your story, 50 words”. Paste it into the form.'
			);
			await expect(page.getByRole('status')).toBeFocused();
			expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
				'I started out hiring engineers.\n\nNow I build accessible web apps and test them hard.'
			);
		} else {
			// WebKit can't be given clipboard permission in tests: either message is fine.
			await story.getByRole('button', { name: /^Copy/ }).click();
			await expect(page.getByRole('status')).toHaveText(/^(Copied|Couldn’t copy)/);
		}
	});

	test('counts words as you type, and explains a problem next to its field', async ({ page }) => {
		const text = page.getByRole('textbox', { name: 'Answer', exact: true }).first();
		await text.fill('Three short words');
		await expect(page.getByText('3 words so far.')).toBeVisible();
		await text.fill('');
		await page.getByRole('textbox', { name: 'Name (optional)' }).first().fill('short');
		await page.getByRole('button', { name: 'Save answer' }).click();
		await expect(text).toBeFocused();
		await expect(text).toHaveAttribute('aria-invalid', 'true');
		await expect(text).toHaveAccessibleDescription(/Write the answer itself\./);
		await expect(page.getByRole('textbox', { name: 'Name (optional)' }).first()).toHaveValue(
			'short'
		);
	});

	test('is in the main navigation, marked when you are on it', async ({ page }) => {
		await expect(
			page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Answers' })
		).toHaveAttribute('aria-current', 'page');
	});

	for (const colorScheme of ['light', 'dark'] as const) {
		test(`has no WCAG 2.2 AA violations (${colorScheme})`, async ({ page }) => {
			await page.emulateMedia({ colorScheme });
			await page.goto('/answers');
			for (const summary of await page.locator('summary').all()) await summary.click();
			expect(
				(await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map(
					(v) => `${v.id}: ${v.help}`
				)
			).toEqual([]);
		});
	}

	test('reflows at 320 pixels wide, forms open', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 640 });
		await page.goto('/answers');
		for (const summary of await page.locator('summary').all()) await summary.click();
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
	});

	test('works without JavaScript, where the text can still be selected', async ({ browser }) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto('/answers');
		await expect(page.getByRole('button', { name: /^Copy/ })).toHaveCount(0);
		await page.getByRole('textbox', { name: 'Name (optional)' }).first().fill('kept');
		await page.getByRole('button', { name: 'Save answer' }).click();
		await expect(page.getByText('Error: Write the answer itself.')).toBeVisible();
		await expect(page.getByRole('textbox', { name: 'Name (optional)' }).first()).toHaveValue(
			'kept'
		);
		await context.close();
	});
});
