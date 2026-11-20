import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The resume for the made-up Lever job, from the confirmed facts in e2e/seed.sql.
// Changes nothing; adding a skill from a gap is in apply-edit.spec.ts.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const RESUME = '/apply/lever/flight/6e5c2b1a-0f3d-4f1e-9a51-1c2d3e4f5a6b/resume';

test.describe('the resume page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(RESUME);
	});

	test('builds a resume from confirmed facts only, and says how', async ({ page }) => {
		await expect(page).toHaveTitle(
			'Resume: Senior Firmware Engineer, Flight Controls · Job Ranger'
		);
		await expect(
			page.getByText(
				/Picked by plain rules from your 2 confirmed facts: nothing is added or reworded\./
			)
		).toBeVisible();
		await expect(page.getByText('Your name isn’t set.')).toBeVisible();
		const resume = page.getByRole('article', { name: 'Resume' });
		await expect(resume.getByRole('heading', { level: 1 })).toHaveText('Your name');
		await expect(resume.getByRole('heading', { level: 2 })).toHaveText(['Experience']);
		await expect(resume.getByRole('heading', { level: 3 })).toHaveText(['Senior Developer']);
		await expect(resume.getByText('Example Co · 2019–2021')).toBeVisible();
		await expect(
			resume.getByText('Led the checkout rebuild that cut page load time in half.')
		).toBeVisible();
		// The pasted fact isn't confirmed, so it isn't used.
		await expect(page.getByText('Raspberry Pi and Home Assistant')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeVisible();
	});

	test('prints only the resume', async ({ page }) => {
		await page.emulateMedia({ media: 'print' });
		await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
		await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeHidden();
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	});

	for (const colorScheme of ['light', 'dark'] as const) {
		test(`has no WCAG 2.2 AA violations (${colorScheme})`, async ({ page }) => {
			await page.emulateMedia({ colorScheme });
			await page.goto(RESUME);
			expect(
				(await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map(
					(v) => `${v.id}: ${v.help}`
				)
			).toEqual([]);
		});
	}

	test('reflows at 320 pixels wide', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 640 });
		await page.goto(RESUME);
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
	});

	test('says when a job is not in Job Ranger', async ({ page }) => {
		expect((await page.goto('/apply/lever/flight/nope/resume'))?.status()).toBe(404);
		expect((await page.goto('/apply/workday/flight/1/resume'))?.status()).toBe(404);
	});
});
