import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// No eval run is published in the repo yet, so the page shows keyword
// matching on the 13 made-up postings, worked out live (src/lib/evals).

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Each violation with the elements behind it and why, so a CI log says what to fix. */
async function violations(page: Page) {
	return (await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map(
		(v) =>
			`${v.id}: ${v.help}\n${v.nodes
				.map((node) => `  ${node.target.join(' ')}: ${node.failureSummary ?? ''}`)
				.join('\n')}`
	);
}

test.describe('the eval page', () => {
	test('opens from Insights and the footer', async ({ page }) => {
		await page.goto('/insights');
		await page.getByRole('link', { name: 'How well scoring works' }).click();
		await expect(page).toHaveURL(/\/evals$/);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('How well scoring works');
		await page.goto('/jobs');
		await page
			.getByRole('contentinfo')
			.getByRole('link', { name: 'how well its job scoring works' })
			.click();
		await expect(page).toHaveURL(/\/evals$/);
	});

	test('shows keyword matching on the made-up postings before any run is published', async ({
		page
	}) => {
		await page.goto('/evals');
		await expect(page.getByText('No model run is published yet.')).toBeVisible();
		const passed = page.getByRole('table', { name: 'Cases passed, by kind' });
		await expect(passed.getByRole('columnheader')).toHaveText([
			'Keyword matchingWorked out now, free'
		]);
		await expect(passed.getByRole('row', { name: /All cases/ })).toHaveText(/7 of 13/);
		await expect(passed.getByRole('row', { name: /Traps/ })).toHaveText(/2 of 7/);
		await expect(page.getByRole('heading', { name: 'Your saved and passed jobs' })).toHaveCount(0);
	});

	test('lists every case, with results in words', async ({ page }) => {
		await page.goto('/evals');
		await page.getByText('Every case').click();
		const cases = page.getByRole('table', { name: /Each case/ });
		await expect(cases.getByRole('row')).toHaveCount(14);
		await expect(cases.getByRole('row', { name: /my skills only as nice to have/ })).toHaveText(
			/1–3\s*5, miss/
		);
		await expect(cases.getByRole('row', { name: /civic forms in my stack/ })).toHaveText(
			/4–5\s*5, pass/
		);
	});

	test('lets a keyboard reach a table that scrolls on a narrow screen', async ({ page }) => {
		await page.setViewportSize({ width: 360, height: 800 });
		await page.goto('/evals');
		const region = page.getByRole('region', { name: 'Cases passed, by kind' });
		await region.focus();
		await expect(region).toBeFocused();
	});
});

for (const colorScheme of ['light', 'dark'] as const) {
	test.describe(`the eval page in ${colorScheme} mode`, () => {
		test.use({ colorScheme, reducedMotion: 'reduce' });

		test('passes the accessibility checks, with every case open', async ({ page }) => {
			await page.goto('/evals');
			await page.waitForLoadState('networkidle');
			await page.getByText('Every case').click();
			expect(await violations(page)).toEqual([]);
		});
	});
}
