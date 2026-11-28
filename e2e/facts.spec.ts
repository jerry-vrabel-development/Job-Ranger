import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Data comes from e2e/seed.sql: one confirmed fact, one pasted fact to check.
// These tests change nothing; adding, confirming and removing are in facts-edit.spec.ts.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test('keeps choices made before the page has finished loading', async ({ page }) => {
	// Slow the page's script so the choices land before it starts.
	await page.route('**/_app/immutable/**/*.js', async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 1500));
		await route.continue();
	});
	await page.goto('/facts', { waitUntil: 'domcontentloaded' });
	const remote = page
		.getByRole('group', { name: /Where you’ll work/ })
		.getByRole('checkbox', { name: 'Remote' });
	const wasRemote = await remote.isChecked();
	await page.locator('#kind').selectOption({ label: 'Project' });
	await page.locator('#experience').selectOption({ label: 'Learning now' });
	await remote.setChecked(!wasRemote);
	await page.waitForLoadState('networkidle');

	await expect(page.locator('#kind')).toHaveValue('project');
	await expect(page.locator('#experience')).toHaveValue('learning');
	expect(await remote.isChecked()).toBe(!wasRemote);
});

test.describe('the facts page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/facts');
	});

	test('has a clear title, counts in words, and puts facts to check first', async ({ page }) => {
		await expect(page).toHaveTitle('Facts · Job Ranger');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Facts');
		await expect(page.getByText('3 facts: 2 confirmed, 1 to check, 0 retired.')).toBeVisible();
		await expect(page.getByRole('heading', { level: 2 })).toHaveText([
			'To check (1)',
			'Your details',
			'What you’re looking for',
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
		await expect(page.getByRole('heading', { level: 3 })).toHaveText([
			'Role (1)',
			'Accomplishment (1)'
		]);
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
		await expect(page.getByText('3 facts: 2 confirmed, 1 to check, 0 retired.')).toBeVisible();
	});

	test('asks for your details, and checks the email next to its field', async ({ page }) => {
		await expect(page.getByText('Add your details…')).toBeVisible();
		const email = page.getByRole('textbox', { name: 'Email (optional)' });
		await email.fill('jane@example');
		await page.getByRole('textbox', { name: 'Name (optional)' }).fill('Jane Doe');
		await page.getByRole('button', { name: 'Save your details' }).click();
		await expect(email).toBeFocused();
		await expect(email).toHaveAttribute('aria-invalid', 'true');
		await expect(email).toHaveAccessibleDescription(/doesn’t look complete/);
		await expect(page.getByRole('textbox', { name: 'Name (optional)' })).toHaveValue('Jane Doe');
	});

	test('asks what you’re looking for, and checks the pay floor next to its field', async ({
		page
	}) => {
		const wanted = page.getByRole('region', { name: 'What you’re looking for' });
		await expect(wanted.getByRole('group', { name: 'Where you’ll work (optional)' })).toBeVisible();
		await expect(
			wanted.getByRole('group', { name: 'Levels (optional)' }).getByRole('checkbox')
		).toHaveCount(7);
		const pay = wanted.getByRole('textbox', { name: 'Pay floor (optional)' });
		await wanted.getByRole('checkbox', { name: 'Remote' }).check();
		await pay.fill('a lot');
		await wanted.getByRole('button', { name: 'Save what you’re looking for' }).click();
		await expect(pay).toBeFocused();
		await expect(pay).toHaveAttribute('aria-invalid', 'true');
		await expect(pay).toHaveAccessibleDescription(/yearly amount in US dollars/);
		await expect(wanted.getByRole('checkbox', { name: 'Remote' })).toBeChecked();
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
