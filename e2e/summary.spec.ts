import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The made-up summary draft from e2e/seed.sql, on a prepared kit. There's no API key here, so
// drafting itself is tested with a fake API in src/lib/server/drafts.worker.test.ts. The kit
// page's axe and reflow checks are in letter.spec.ts.

const KIT = '/apply/ashby/example/newest';
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const DRAFT = 'Senior Developer at Example Co. Cut page load time in half for 40 stores.';

test.describe('a resume summary draft', () => {
	test('shows the draft with its problem, in words, and keeps it off the resume', async ({
		page
	}) => {
		await page.goto(KIT);
		await expect(page.getByRole('heading', { name: 'Summary', level: 3 })).toBeVisible();
		await expect(
			page.getByText(
				'The resume’s summary is your picked facts, as they are, until you choose a draft.'
			)
		).toBeVisible();
		await expect(
			page.getByText('Drafting isn’t set up yet, so Job Ranger can’t draft a summary.')
		).toBeVisible();
		await expect(page.getByRole('button', { name: /summary$/ })).toHaveCount(0);

		const draft = page.getByRole('article', { name: 'Drafted summary' });
		await expect(draft.getByText('Drafted Nov 21, 2026 · $0.01')).toBeVisible();
		await expect(
			draft.getByText('Sentence 2: The number 40 isn’t in the facts it cites.')
		).toBeVisible();
		await expect(draft.getByText(`${DRAFT} [Check 1]`)).toBeVisible();
		await expect(
			draft.getByRole('textbox', { name: 'Put it on the resume, as it is or as you edit it' })
		).toHaveValue(DRAFT);
		await expect(draft.getByText('Fix or cut the flagged sentences first.')).toBeVisible();

		await page.goto(`${KIT}/resume`);
		await expect(page.getByText(/nothing is added or reworded\./)).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Summary' })).toHaveCount(0);
	});

	test('reviews the box as it is now, in words, and changes nothing', async ({ page }) => {
		await page.goto(KIT);
		const draft = page.getByRole('article', { name: 'Drafted summary' });
		const box = draft.getByRole('textbox', {
			name: 'Put it on the resume, as it is or as you edit it'
		});
		await draft.getByRole('button', { name: 'Review', exact: true }).click();
		await expect(page.getByRole('status')).toHaveText(
			'Reviewed: 1 thing to look at. Nothing was changed.'
		);
		await expect(
			draft.getByText(
				'Not in your facts: The number 40 isn’t in any confirmed fact: “Cut page load time in half for 40 stores.”'
			)
		).toBeVisible();
		await expect(box).toHaveValue(DRAFT);

		const mine = 'Senior Developer at Example Co.';
		await box.fill(mine);
		await draft.getByRole('button', { name: 'Review', exact: true }).click();
		await expect(page.getByRole('status')).toHaveText(
			'Reviewed: nothing to fix in names, length or numbers. Tone and clarity are yours to judge.'
		);
		await expect(box).toHaveValue(mine);
		expect(
			(await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map(
				(v) => `${v.id}: ${v.help}`
			)
		).toEqual([]);
	});
});
