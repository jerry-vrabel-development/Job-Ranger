import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// A made-up drafted answer from e2e/seed.sql. Saving it is in answer-draft-edit.spec.ts.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const KIT = '/apply/ashby/example/newest';
const LEAD = 'Tell us about a time you led a team.';

test.describe('a drafted answer', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(KIT);
	});

	test('shows the draft with its problems, the facts it uses, and a box to make it yours', async ({
		page
	}) => {
		const item = page
			.getByRole('listitem')
			.filter({ has: page.getByRole('heading', { name: LEAD }) });
		await expect(item.getByText('Drafted answer · Nov 20, 2026 · $0.00')).toBeVisible();
		await expect(
			item.getByText('Paragraph 1, sentence 2: The number 6 isn’t in the facts it cites.')
		).toBeVisible();
		await expect(
			item.getByText('I led the checkout rebuild. The team had 6 people. [Check 1]')
		).toBeVisible();
		await expect(
			item.getByRole('textbox', { name: 'Make it yours, then save it to Answers' })
		).toHaveValue('I led the checkout rebuild. The team had 6 people.');
		// No key here, so no Draft button; the draft itself still shows.
		await expect(item.getByRole('button', { name: /^Draft/ })).toHaveCount(0);
	});

	test('says what drafting for this application has cost, and the average so far', async ({
		page
	}) => {
		await expect(page.getByText('Drafting for this application so far: $0.01.')).toBeVisible();
		await expect(
			page.getByText('Across 1 application: $0.05 of drafting in all, $0.05 each on average.')
		).toBeVisible();
	});

	test('offers no draft for a question about your situation', async ({ page }) => {
		const pay = page
			.getByRole('listitem')
			.filter({ has: page.getByRole('heading', { name: 'What are your salary expectations?' }) });
		await expect(pay.getByText('Matches: Pay expectations')).toBeVisible();
		await expect(pay.getByText('Drafted answer')).toHaveCount(0);
		await expect(pay.getByRole('textbox')).toHaveCount(0);
	});

	for (const colorScheme of ['light', 'dark'] as const) {
		test(`has no WCAG 2.2 AA violations (${colorScheme})`, async ({ page }) => {
			await page.emulateMedia({ colorScheme });
			await page.goto(KIT);
			for (const summary of await page.getByText('Facts each sentence uses…').all())
				await summary.click();
			expect(
				(await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map(
					(v) => `${v.id}: ${v.help}`
				)
			).toEqual([]);
		});
	}
});
