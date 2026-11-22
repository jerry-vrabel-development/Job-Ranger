import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The made-up posting text on one kit in e2e/seed.sql has two scam patterns.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const KIT = '/apply/ashby/example/job-1';

test.describe('the scam check', () => {
	test('names each pattern in words and quotes the sentence it found', async ({ page }) => {
		await page.goto(KIT);
		await expect(
			page.getByText(
				'Scam check (2): the posting’s text has patterns job scams use. A reason to look closer, not a verdict.'
			)
		).toBeVisible();
		await expect(
			page
				.getByRole('listitem')
				.filter({ hasText: /^Check for equipment: “We will mail you a check/ })
		).toBeVisible();
		await expect(
			page
				.getByRole('listitem')
				.filter({ hasText: /^Chat-app contact: “Your interview will be held over Telegram\.”/ })
		).toBeVisible();
		expect(
			(await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map(
				(v) => `${v.id}: ${v.help}`
			)
		).toEqual([]);
	});

	test('says nothing when the posting’s text is clean', async ({ page }) => {
		await page.goto('/apply/ashby/example/newest');
		await expect(page.getByText(/Scam check/)).toHaveCount(0);
	});
});
