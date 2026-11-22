import { expect, test } from '@playwright/test';

// Changes data, so it runs in the edits project after everything else.

const KIT = '/apply/ashby/example/newest';
const MINE =
	'Senior Developer at Example Co. Led the checkout rebuild that cut page load time in half.';

test('puts a flagged summary on the resume only once edited, and takes it off again', async ({
	page
}) => {
	await page.goto(KIT);
	const status = page.getByRole('status');
	const draft = page.getByRole('article', { name: 'Drafted summary' });
	const box = draft.getByRole('textbox', {
		name: 'Put it on the resume, as it is or as you edit it'
	});

	await draft.getByRole('button', { name: 'Use on the resume' }).click();
	await expect(status).toHaveText(
		'Not done: The checks found problems in this draft. Fix or cut those sentences in the box first, or draft it again.'
	);

	await box.fill(MINE);
	await draft.getByRole('button', { name: 'Use on the resume' }).click();
	await expect(status).toHaveText('Your edited summary is on the resume for this job.');
	await expect(
		page.getByText('On the resume: your edited version of the drafted summary.')
	).toBeVisible();
	await expect(box).toHaveValue(MINE);

	await page.goto(`${KIT}/resume`);
	await expect(
		page.getByText(/except the summary: your edit of a drafted one\. Change it on the kit\./)
	).toBeVisible();
	const resume = page.getByRole('article', { name: 'Resume' });
	// Other edit tests may add facts meanwhile, so only the first section is pinned down.
	await expect(resume.getByRole('heading', { level: 2 }).first()).toHaveText('Summary');
	await expect(resume.getByText(MINE)).toBeVisible();

	await page.goto(KIT);
	await page.getByRole('button', { name: 'Use your picked facts instead' }).click();
	await expect(status).toHaveText('The resume uses your picked facts for its summary again.');
	await page.goto(`${KIT}/resume`);
	await expect(page.getByRole('heading', { name: 'Summary' })).toHaveCount(0);
});
