import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The kit page before it's prepared, for the made-up Lever job in e2e/seed.sql.
// Preparing, pasting and applying change data, so they're in apply-edit.spec.ts.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const KIT = '/apply/lever/flight/6e5c2b1a-0f3d-4f1e-9a51-1c2d3e4f5a6b';
const TITLE = 'Senior Firmware Engineer, Flight Controls';

test.describe('the apply kit page', () => {
	test('opens from a job card', async ({ page }) => {
		await page.goto('/jobs');
		await page.getByRole('link', { name: `Apply kit for ${TITLE} at Flight Co` }).click();
		await expect(page).toHaveURL(KIT);
		await expect(page).toHaveTitle(`Apply: ${TITLE} · Job Ranger`);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Apply: ${TITLE}`);
	});

	test('explains the kit before it is prepared, and links to the real form', async ({ page }) => {
		await page.goto(KIT);
		await expect(
			page.getByText(`Flight Co · Remote - US; Austin, TX · Remote · $150,000 – $190,000 per year`)
		).toBeVisible();
		await expect(
			page.getByText(/Lever doesn't share a form's questions, so you'll paste them in/)
		).toBeVisible();
		await expect(page.getByRole('button', { name: 'Prepare the kit' })).toBeVisible();
		const apply = page.getByRole('link', { name: 'Open the application (opens in a new tab)' });
		await expect(apply).toHaveAttribute(
			'href',
			'https://jobs.lever.co/flight/6e5c2b1a-0f3d-4f1e-9a51-1c2d3e4f5a6b/apply'
		);
		await expect(apply).toHaveAttribute('rel', 'noopener noreferrer');
		await expect(
			page.getByRole('link', { name: 'Read the posting (opens in a new tab)' })
		).toBeVisible();
		await expect(page.getByText(/Job Ranger never submits anything for you\./)).toBeVisible();
	});

	test('says when a job is not in Job Ranger', async ({ page }) => {
		const missing = await page.goto('/apply/lever/flight/no-such-job');
		expect(missing?.status()).toBe(404);
		await expect(page.getByText('That job is no longer in Job Ranger.')).toBeVisible();
		const wrong = await page.goto('/apply/workday/flight/1');
		expect(wrong?.status()).toBe(404);
	});

	for (const colorScheme of ['light', 'dark'] as const) {
		test(`has no WCAG 2.2 AA violations (${colorScheme})`, async ({ page }) => {
			await page.emulateMedia({ colorScheme });
			await page.goto(KIT);
			expect(
				(await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map(
					(v) => `${v.id}: ${v.help}`
				)
			).toEqual([]);
		});
	}

	test('reflows at 320 pixels wide', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 640 });
		await page.goto('/apply/ashby/example/long');
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
	});
});
