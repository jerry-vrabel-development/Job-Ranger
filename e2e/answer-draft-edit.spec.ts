import { expect, test } from '@playwright/test';

// Changes data, so it runs in the edits project after everything else.

const KIT = '/apply/ashby/example/newest';
const LEAD = 'Tell us about a time you led a team.';

test('asks me to make a drafted answer mine, then saves it to Answers, labeled', async ({
	page
}) => {
	await page.goto(KIT);
	const status = page.getByRole('status');
	const item = () =>
		page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: LEAD }) });
	const box = item().getByRole('textbox', { name: 'Make it yours, then save it to Answers' });

	await item()
		.getByRole('button', { name: `Save to Answers ${LEAD}` })
		.click();
	await expect(status).toHaveText(
		'Not done: Make it yours first: change at least a word. It’s saved as “AI draft, edited by me”, so it should be.'
	);

	await box.fill('I led the checkout rebuild, start to finish.');
	await item()
		.getByRole('button', { name: `Save to Answers ${LEAD}` })
		.click();
	await expect(status).toHaveText(
		'Saved your edited answer to Answers, labeled “AI draft, edited by me”.'
	);
	await expect(item().getByText('Drafted answer')).toHaveCount(0);
	await expect(item().getByText('I led the checkout rebuild, start to finish.')).toBeVisible();
	await expect(item().getByText(/AI draft, edited by me/)).toBeVisible();

	await page.goto('/answers');
	await expect(page.getByRole('article', { name: `Leading or mentoring, ${LEAD}` })).toContainText(
		/Drafted by claude-sonnet-5-5 for Senior Software Engineer, Accessibility at Example Co on \d{4}-\d{2}-\d{2}, then edited by me\./
	);
});
