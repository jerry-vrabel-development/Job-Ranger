import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Data comes from e2e/seed.sql (see jobs.spec.ts). Filters only read, so these run in parallel.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// On a slow phone the page can be used before its script has loaded. Choices
// made then must survive the script starting (it used to reset them all).
test('keeps filter choices made before the page has finished loading', async ({ page }) => {
	await page.route('**/_app/immutable/**/*.js', async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 1500));
		await route.continue();
	});
	await page.goto('/jobs', { waitUntil: 'domcontentloaded' });
	await page.getByRole('combobox', { name: 'Company' }).selectOption({ label: 'Civic Co' });
	await page.getByRole('combobox', { name: 'Order' }).selectOption({ label: 'Best fit first' });
	await page.getByRole('searchbox', { name: 'Search' }).fill('engineer');
	await page.getByRole('checkbox', { name: 'Only new' }).check();
	await page.waitForLoadState('networkidle');

	await expect(page.getByRole('combobox', { name: 'Company' })).toHaveValue('greenhouse:civic');
	await expect(page.getByRole('combobox', { name: 'Order' })).toHaveValue('fit');
	await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('engineer');
	await expect(page.getByRole('checkbox', { name: 'Only new' })).toBeChecked();
});

test.describe('filtering the jobs page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/jobs');
	});

	test('searches titles and says how many match, out of all', async ({ page }) => {
		await page.getByRole('searchbox', { name: 'Search' }).fill('flight controls');
		await page.getByRole('button', { name: 'Show jobs' }).click();

		await expect(page).toHaveURL(/[?&]q=flight\+controls/);
		await expect(page.getByText('1 of 45 open jobs match, newest first.')).toBeVisible();
		await expect(page.getByRole('heading', { level: 2 })).toHaveText([
			/^Senior Firmware Engineer, Flight Controls/
		]);
		await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('flight controls');
	});

	test('filters by company and by new, and clears back to everything', async ({ page }) => {
		await page.getByRole('combobox', { name: 'Company' }).selectOption({ label: 'Civic Co' });
		await page.getByRole('button', { name: 'Show jobs' }).click();
		await expect(page.getByText('1 of 45 open jobs match, newest first.')).toBeVisible();
		await expect(page.getByRole('combobox', { name: 'Company' })).toHaveValue('greenhouse:civic');

		await page.getByRole('combobox', { name: 'Company' }).selectOption({ label: 'All companies' });
		await page.getByRole('checkbox', { name: 'Only new' }).check();
		await page.getByRole('button', { name: 'Show jobs' }).click();
		await expect(page.getByText('3 of 45 open jobs match, newest first.')).toBeVisible();

		await page.getByRole('link', { name: 'Clear filters' }).click();
		await expect(page.getByText('45 open jobs from 4 job boards, newest first.')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Clear filters' })).toHaveCount(0);
	});

	test('filters by interest, and says on each job why it matched', async ({ page }) => {
		const interest = page.getByRole('combobox', { name: 'Interest' });
		await expect(interest.getByRole('option')).toHaveText([
			'Any interest',
			'Accessibility',
			'Civic tech'
		]);

		await interest.selectOption({ label: 'Accessibility' });
		await page.getByRole('button', { name: 'Show jobs' }).click();
		await expect(page).toHaveURL(/[?&]interest=1/);
		await expect(page.getByText('2 of 45 open jobs match, newest first.')).toBeVisible();
		await expect(page.getByText('Accessibility: title has “accessibility”')).toHaveCount(2);
		await expect(
			page.getByRole('article', { name: /^Senior Software Engineer, Accessibility/ })
		).toContainText("Why it's listed: Accessibility: title has “accessibility”");

		await interest.selectOption({ label: 'Civic tech' });
		await page.getByRole('button', { name: 'Show jobs' }).click();
		await expect(page.getByText('1 of 45 open jobs match, newest first.')).toBeVisible();
		await expect(page.getByRole('heading', { level: 2 })).toHaveText([
			/^Software Engineer, Benefits Access/
		]);
		await expect(page.getByText('Civic tech: company tag')).toBeVisible();
	});

	test('ignores an interest that is not on the list', async ({ page }) => {
		await page.goto('/jobs?interest=999');
		await expect(page.getByText('45 open jobs from 4 job boards, newest first.')).toBeVisible();
		await expect(page.getByRole('combobox', { name: 'Interest' })).toHaveValue('');
	});

	test('says so when nothing matches', async ({ page }) => {
		await page.goto('/jobs?q=zzzz-no-such-job');
		await expect(page.getByText('0 of 45 open jobs match, newest first.')).toBeVisible();
		await expect(page.getByText('No open jobs match these filters.')).toBeVisible();
	});

	test('ignores filters it does not understand', async ({ page }) => {
		await page.goto('/jobs?company=workday:x&workplace=moon&new=yes');
		await expect(page.getByText('45 open jobs from 4 job boards, newest first.')).toBeVisible();
	});

	test('works without JavaScript', async ({ browser }) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto('/jobs');
		await page.getByRole('combobox', { name: 'Workplace' }).selectOption({ label: 'On site' });
		await page.getByRole('button', { name: 'Show jobs' }).click();
		await expect(page).toHaveURL(/workplace=on-site/);
		await expect(page.getByText(/ of 45 open jobs match, newest first\./)).toBeVisible();
		await context.close();
	});

	for (const colorScheme of ['light', 'dark'] as const) {
		test(`has no WCAG 2.2 AA violations with filters on (${colorScheme})`, async ({ page }) => {
			await page.emulateMedia({ colorScheme });
			await page.goto('/jobs?q=engineer&workplace=remote&interest=1');
			expect(
				(await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map(
					(v) => `${v.id}: ${v.help}`
				)
			).toEqual([]);
		});
	}

	test('reflows at 320 pixels wide with the filters showing', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 640 });
		await page.goto('/jobs?q=engineer');
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
	});
});
