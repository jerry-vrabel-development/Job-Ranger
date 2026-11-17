import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Data comes from e2e/seed.sql: 43 open jobs (3 new), 1 closed, and one board
// that couldn't be read. These tests only read, so they can run in parallel.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const LONG_TITLE = /^Principal Staff Senior Lead Software Development Engineer in Test/;

test.describe('the jobs page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/jobs');
	});

	test('has one main heading, a clear title, and says how many jobs there are', async ({
		page
	}) => {
		await expect(page).toHaveTitle('Jobs · Job Ranger');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jobs');
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
		await expect(page.getByText('43 open jobs from 2 job boards, newest first.')).toBeVisible();
		await expect(page.getByText('3 new.')).toBeVisible();
	});

	test('lists every open job as its own heading, newest first, without closed ones', async ({
		page
	}) => {
		const headings = page.getByRole('list').first().getByRole('heading', { level: 2 });
		await expect(headings).toHaveCount(43);
		await expect(headings.nth(0)).toHaveText('Senior Software Engineer, AccessibilityNew');
		await expect(headings.nth(1)).toHaveText(LONG_TITLE);
		// Undated postings come last.
		await expect(headings.last()).toHaveText('QA EngineerNew');
		await expect(page.getByRole('heading', { name: 'Closed Role' })).toHaveCount(0);
	});

	test('gives every job its real apply link, named for the job', async ({ page }) => {
		const apply = page.getByRole('link', {
			name: 'Apply for Senior Software Engineer, Accessibility at Example Co',
			exact: true
		});
		await expect(apply).toHaveAttribute(
			'href',
			'https://jobs.ashbyhq.com/example/newest/application'
		);
		await expect(apply).toHaveText(
			'Apply for Senior Software Engineer, Accessibility at Example Co'
		);
		const posting = page.getByRole('link', {
			name: 'Read the posting for Senior Software Engineer, Accessibility at Example Co',
			exact: true
		});
		await expect(posting).toHaveText(
			'Read the posting for Senior Software Engineer, Accessibility at Example Co'
		);
		const all = page.getByRole('link', { name: /^Apply for / });
		await expect(all).toHaveCount(43);
		for (const href of await all.evaluateAll((links) =>
			links.map((link) => link.getAttribute('href') ?? '')
		)) {
			expect(href).toMatch(/^https:\/\/jobs\.ashbyhq\.com\/example\/.+\/application$/);
		}
	});

	test('says everything in words: new, pay, workplace and dates', async ({ page }) => {
		const first = page.getByRole('article').first();
		await expect(first.getByText('New', { exact: true })).toBeVisible();
		await expect(first.getByText('Chicago, IL; Remote (US) · Hybrid')).toBeVisible();
		await expect(first.getByText('$150K - $180K')).toBeVisible();
		await expect(first.locator('time')).toHaveAttribute('datetime', '2026-11-16T15:00:00.000Z');

		const undated = page.getByRole('article', { name: /QA Engineer/ });
		await expect(undated.getByText('Pay not posted')).toBeVisible();
		await expect(undated.getByText('Location not given · Workplace not stated')).toBeVisible();
		await expect(undated.getByText('Posting date not given')).toBeVisible();
	});

	test('says when a board could not be read, and why', async ({ page }) => {
		await expect(page.getByText('1 board couldn’t be read in the last check.')).toBeVisible();
		await page.getByText('Job boards (2)').click();
		await expect(
			page.getByText(/could not be read on Nov 17, 2026\. Board not found \(404\)/)
		).toBeVisible();
	});

	test('marks the page it is on in the main navigation', async ({ page }) => {
		const nav = page.getByRole('navigation', { name: 'Main' });
		await expect(nav.getByRole('link', { name: 'Jobs' })).toHaveAttribute('aria-current', 'page');
	});

	for (const colorScheme of ['light', 'dark'] as const) {
		test(`has no WCAG 2.2 AA violations (${colorScheme})`, async ({ page }) => {
			await page.emulateMedia({ colorScheme });
			await page.goto('/jobs');
			await page.getByText('Job boards (2)').click();
			const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
			expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
		});
	}

	test('reflows at 320 pixels wide, long titles and all', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 640 });
		await page.goto('/jobs');
		await expect(page.getByRole('heading', { name: LONG_TITLE })).toBeVisible();
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
	});

	test('reaches the first apply link by keyboard, with a visible focus', async ({
		page,
		browserName
	}) => {
		test.skip(browserName === 'webkit', 'WebKit does not tab to links by default');
		const apply = page.getByRole('link', { name: /^Apply for Senior Software Engineer/ });
		for (let i = 0; i < 10 && !(await apply.evaluate((el) => el === document.activeElement)); i++) {
			await page.keyboard.press('Tab');
		}
		await expect(apply).toBeFocused();
		const outline = await apply.evaluate((el) => getComputedStyle(el).outlineStyle);
		expect(outline).toBe('solid');
	});

	test('breaks no rule of its own security policy', async ({ page }) => {
		const violations: string[] = [];
		page.on('console', (message) => {
			if (/Content Security Policy|Content-Security-Policy/i.test(message.text())) {
				violations.push(message.text());
			}
		});
		await page.goto('/jobs');
		await page.waitForLoadState('networkidle');
		expect(violations).toEqual([]);
	});
});
