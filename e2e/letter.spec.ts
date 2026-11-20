import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// A made-up draft from e2e/seed.sql, on a prepared kit. There's no API key here, so drafting
// itself is tested with a fake API in src/lib/server/drafts.worker.test.ts.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const KIT = '/apply/ashby/example/newest';
const LETTER =
	'Dear hiring team,\n\nI would like to join Example Co.\n\nI led the checkout rebuild that cut page load time in half. It served 40 stores.\n\nSincerely,\n[Your name]';

test.describe('a cover letter draft', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(KIT);
	});

	test('says drafting needs an API key', async ({ page }) => {
		await expect(
			page.getByText(
				'Drafting isn’t set up yet: the Worker has no API key. The README says how to add one.'
			)
		).toBeVisible();
		await expect(page.getByRole('button', { name: 'Draft a full letter' })).toHaveCount(0);
	});

	test('shows the letter with its problems, in words, next to the sentence', async ({ page }) => {
		const draft = page.getByRole('article', { name: 'Full letter' });
		await expect(draft.getByText('Drafted Nov 20, 2026 · $0.01')).toBeVisible();
		await expect(draft.getByText('Check before using (1):')).toBeVisible();
		await expect(
			draft.getByText('Paragraph 2, sentence 2: The number 40 isn’t in the facts it cites.')
		).toBeVisible();
		await expect(
			draft.getByText(
				'I led the checkout rebuild that cut page load time in half. It served 40 stores. [Check 1]'
			)
		).toBeVisible();
		await draft.getByText('Facts each sentence uses…').click();
		await expect(draft.getByText('No facts: framing only.')).toBeVisible();
		await expect(
			draft.getByRole('listitem').filter({ hasText: /^Led the checkout rebuild/ })
		).toHaveCount(2);
	});

	test('copies the letter as plain text, without the check markers', async ({
		page,
		browserName,
		context
	}) => {
		test.skip(browserName !== 'chromium', 'clipboard permission is Chromium-only in tests');
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await page.getByRole('button', { name: 'Copy the full letter' }).click();
		await expect(page.getByRole('status')).toHaveText(
			'Copied the letter. Read it once more in the form before you send it.'
		);
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(LETTER);
	});

	for (const colorScheme of ['light', 'dark'] as const) {
		test(`has no WCAG 2.2 AA violations (${colorScheme})`, async ({ page }) => {
			await page.emulateMedia({ colorScheme });
			await page.goto(KIT);
			await page.getByText('Facts each sentence uses…').click();
			expect(
				(await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map(
					(v) => `${v.id}: ${v.help}`
				)
			).toEqual([]);
		});
	}

	test('reflows at 320 pixels wide', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 640 });
		await page.goto(KIT);
		await page.getByText('Facts each sentence uses…').click();
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
	});
});
