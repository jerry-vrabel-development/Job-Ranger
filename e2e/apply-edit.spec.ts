import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// These change the data, so they run once, after every other browser test (playwright.config.ts).
// The made-up Lever job and saved answers come from e2e/seed.sql.

test.describe.configure({ mode: 'serial' });

const KIT = '/apply/lever/flight/6e5c2b1a-0f3d-4f1e-9a51-1c2d3e4f5a6b';
const TITLE = 'Senior Firmware Engineer, Flight Controls';
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test('prepares a kit, lines up saved answers, records the AI rule, and records applying', async ({
	page,
	context
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.goto(KIT);
	const status = page.getByRole('status');

	await page.getByRole('button', { name: 'Prepare the kit' }).click();
	await expect(status).toHaveText(
		"Lever doesn't share a form's questions. Paste them in from the form."
	);
	await expect(
		page.getByText(/Not checked\. Job Ranger couldn't read this posting's text/)
	).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Questions (0)' })).toBeVisible();

	await page.getByText('Paste questions from the form…').click();
	await page
		.getByRole('textbox', { name: 'Questions, one per line' })
		.fill('Are you authorized to work in the US?\nTell us about yourself\nFavorite airplane?');
	await page.getByRole('button', { name: 'Save questions' }).click();
	await expect(status).toHaveText('Saved 3 pasted questions.');
	await expect(page.getByRole('heading', { name: 'Questions (3)' })).toBeVisible();

	const items = page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 3 }) });
	await expect(items.nth(0)).toContainText('Pasted in · Matches: Work authorization');
	await expect(items.nth(0)).toContainText('Yes. I can work in the US without sponsorship.');
	await expect(items.nth(1)).toContainText('Matches: About you, your story');
	await expect(items.nth(2)).toContainText('No saved type matches');

	await items
		.nth(0)
		.getByRole('button', { name: 'Copy answer for Are you authorized to work in the US?' })
		.click();
	await expect(status).toHaveText(
		'Copied your answer for “Are you authorized to work in the US?”. Paste it into the form.'
	);
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
		'Yes. I can work in the US without sponsorship.'
	);

	await items.nth(2).getByRole('combobox', { name: 'Show saved answers for' }).selectOption({
		label: 'Work authorization'
	});
	await expect(items.nth(2)).toContainText('Yes. I can work in the US without sponsorship.');

	await page.getByText('Say whether there is an AI rule…').click();
	await page
		.getByRole('textbox', { name: "The posting's line about AI (optional)" })
		.fill('No AI-written answers, please.');
	await page.getByRole('button', { name: 'It forbids AI answers' }).click();
	await expect(status).toHaveText(
		'Marked: this posting forbids AI-written answers. Only answers in your own words are offered.'
	);
	await expect(
		page.getByText('This posting forbids AI-written answers (your call).')
	).toBeVisible();
	await expect(page.getByText('No AI-written answers, please.', { exact: true })).toBeVisible();
	// Both saved answers are in my own words or written together, so they're still offered.
	await expect(items.nth(1)).toContainText('Written together');

	expect(
		(await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map(
			(v) => `${v.id}: ${v.help}`
		)
	).toEqual([]);

	await page.getByRole('button', { name: 'I applied' }).click();
	await expect(status).toHaveText(`Recorded: you applied to ${TITLE} at Flight Co.`);
	await expect(page.getByText(/^You applied on [A-Z][a-z]{2} \d{1,2}, \d{4}\.$/)).toBeVisible();

	await page.goto('/jobs');
	const card = page.getByRole('article', { name: TITLE });
	await expect(card.getByText(/^Applied [A-Z][a-z]{2} \d{1,2}, \d{4}$/)).toBeVisible();

	await page.goto(KIT);
	await page.getByRole('button', { name: "Undo: I haven't applied" }).click();
	await expect(status).toHaveText('Removed the application record.');
	await expect(page.getByRole('button', { name: 'I applied' })).toBeVisible();

	// The posting's words find skills the facts don't have: each is a question, not a verdict.
	await page.getByText('Paste the posting’s text…').click();
	await page
		.getByRole('textbox', { name: 'The posting’s text' })
		.fill('You will write Rust and manage it with Terraform.');
	await page.getByRole('button', { name: 'Save the posting’s text' }).click();
	await expect(status).toHaveText('Saved the posting text.');
	await expect(page.getByRole('group', { name: 'Rust', exact: true })).toBeVisible();
	await expect(page.getByRole('group', { name: 'Terraform', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Learning now Terraform' }).click();
	await expect(status).toHaveText(
		'Added Terraform to your facts (learning now). Add where and when on Facts.'
	);
	await page.getByRole('button', { name: 'No Rust' }).click();
	await expect(status).toHaveText('Noted: no Rust. It stays off this resume, which is honest.');
	await expect(page.getByRole('heading', { name: /Skills the posting names/ })).toHaveCount(0);

	await page.getByRole('link', { name: 'Open the resume for this job' }).click();
	await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible();
	await expect(
		page.getByRole('listitem').filter({ hasText: 'Terraform (learning)' })
	).toBeVisible();
	await expect(page.getByText('Rust', { exact: true })).toHaveCount(0);
});
