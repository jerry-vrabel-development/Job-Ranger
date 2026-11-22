import { expect, test } from '@playwright/test';

// The made-up summary draft from e2e/seed.sql, on a prepared kit. There's no API key here, so
// drafting itself is tested with a fake API in src/lib/server/drafts.worker.test.ts. The kit
// page's axe and reflow checks are in letter.spec.ts.

const KIT = '/apply/ashby/example/newest';
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
});
