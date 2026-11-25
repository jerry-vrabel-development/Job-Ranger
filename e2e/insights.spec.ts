import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// From e2e/seed.sql: 46 jobs (45 open) and 4 applications, one of them interviewing. The
// application dates are relative to today, so one is waiting, one due a follow-up, one at no reply.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function violations(page: Page) {
	return (await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map(
		(v) => `${v.id}: ${v.help}`
	);
}

test.describe('Insights: My search', () => {
	test('shows the funnel with every step in words, and the numbers as a table', async ({
		page
	}) => {
		await page.goto('/insights');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Insights');
		await expect(page.getByRole('link', { name: 'Insights' })).toHaveAttribute(
			'aria-current',
			'page'
		);
		await expect(page.getByText('46 jobs found, 45 open now.')).toBeVisible();

		const funnel = page.getByRole('figure', { name: /From saved to offer/ });
		await expect(funnel.locator('figcaption').getByText('From saved to offer')).toBeVisible();
		await expect(
			funnel.getByText(
				'You saved 4 jobs, applied to 4, and heard back from 1; 1 reached an interview.'
			)
		).toBeVisible();
		// Each step says its name and count; under 5 before it, no percentage.
		await expect(funnel.getByRole('listitem')).toHaveText([
			'Saved 4',
			'Applied 4',
			'Replied 1',
			'Interviewing 1',
			'Offer 0'
		]);

		const numbers = funnel.getByRole('table', { name: 'From saved to offer' });
		await expect(numbers).toBeHidden();
		await funnel.getByText('Show the numbers').click();
		await expect(numbers.getByRole('row')).toHaveText([
			'StepCountShare of the step before',
			'Saved4—',
			'Applied4—',
			'Replied1—',
			'Interviewing1—',
			'Offer0—'
		]);

		await expect(page.getByRole('heading', { name: 'Waiting to hear' })).toBeVisible();
		await expect(
			page.getByRole('region', { name: 'My search' }).getByRole('list').last().getByRole('listitem')
		).toHaveText(['1 to follow up now', '1 waiting to hear', '1 with no reply']);
		expect(await violations(page)).toEqual([]);
	});

	test('passes the accessibility checks in dark mode too', async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
		await page.goto('/insights');
		await page
			.getByRole('figure', { name: /From saved to offer/ })
			.getByText('Show the numbers')
			.click();
		expect(await violations(page)).toEqual([]);
	});
});

// From e2e/seed.sql: daily counts dated back from today. Over 7 days Example Co grows, Civic Co
// is steady, Flight Co shrinks (with a two-day gap), and Quiet Co's counts are too new.
test.describe('Insights: Trending companies', () => {
	test('lists companies by change, each said in words, most growth first', async ({ page }) => {
		await page.goto('/insights');
		const trending = page.getByRole('region', { name: 'Trending companies' });
		await expect(page.getByRole('button', { name: 'Last 7 days' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(
			trending.getByText(
				'1 growing, 1 steady and 1 shrinking over 7 days; 1 without enough data yet.'
			)
		).toBeVisible();
		await expect(trending.getByRole('heading', { level: 3 })).toHaveText([
			'Example Co',
			'Civic Co',
			'Flight Co',
			'Quiet Co'
		]);
		const article = (name: string) => trending.getByRole('article', { name });
		await expect(
			article('Example Co').getByText('↑ Growing: 63 → 70 open (+7) in 7 days.')
		).toBeVisible();
		await expect(article('Civic Co').getByText('→ Steady: 13 → 12 open in 7 days.')).toBeVisible();
		await expect(
			article('Flight Co').getByText('↓ Shrinking: 23 → 20 open (−3) in 7 days.')
		).toBeVisible();
		await expect(
			article('Quiet Co').getByText(/^Not enough data yet: counts start [A-Z][a-z]{2} \d+\.$/)
		).toBeVisible();
		expect(await violations(page)).toEqual([]);
	});

	test('reads a chart day by day from the keyboard, gaps included', async ({ page }) => {
		await page.goto('/insights');
		const chart = page.getByRole('slider', { name: 'Flight Co, open jobs by day' });
		// It starts on the latest day: today, 20 open.
		await expect(chart).toHaveAttribute('aria-valuetext', /: 20 open$/);
		await expect(chart).toHaveAttribute('aria-valuenow', '8');
		await chart.focus();
		await page.keyboard.press('ArrowLeft');
		await page.keyboard.press('ArrowLeft');
		await page.keyboard.press('ArrowLeft');
		// Three days back is a failed fetch: a gap, not a zero.
		await expect(chart).toHaveAttribute('aria-valuetext', /: no count that day$/);
		await page.keyboard.press('Home');
		await expect(chart).toHaveAttribute('aria-valuetext', /: 23 open$/);
		await expect(chart).toHaveAttribute('aria-valuenow', '1');
		await page.keyboard.press('End');
		await expect(chart).toHaveAttribute('aria-valuenow', '8');

		const numbers = page
			.getByRole('article', { name: 'Flight Co' })
			.getByRole('table', { name: 'Flight Co: open jobs by day' });
		await page.getByRole('article', { name: 'Flight Co' }).getByText('Show the numbers').click();
		await expect(numbers.getByRole('row')).toHaveCount(9);
		await expect(numbers.getByRole('cell', { name: 'No count' })).toHaveCount(2);
	});

	test('switches to 30 days, in the address so it works without JavaScript', async ({ page }) => {
		await page.goto('/insights');
		await page.getByRole('button', { name: 'Last 30 days' }).click();
		await expect(page).toHaveURL(/\?range=30$/);
		await expect(page.getByRole('button', { name: 'Last 30 days' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		const trending = page.getByRole('region', { name: 'Trending companies' });
		await expect(trending.getByText('↑ Growing: 40 → 70 open (+30) in 30 days.')).toBeVisible();
		await expect(trending.getByText('→ Steady: 12 → 12 open in 30 days.')).toBeVisible();
		await expect(trending.getByText('↓ Shrinking: 35 → 20 open (−15) in 30 days.')).toBeVisible();
		await expect(
			page.getByRole('slider', { name: 'Example Co, open jobs by day' })
		).toHaveAttribute('aria-valuemax', '31');
	});

	test('passes the accessibility checks in dark mode, while reading a chart', async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
		await page.goto('/insights?range=30');
		await page.getByRole('slider', { name: 'Example Co, open jobs by day' }).focus();
		await page.keyboard.press('ArrowLeft');
		expect(await violations(page)).toEqual([]);
	});
});

// From e2e/seed.sql: 45 open jobs on watched boards (Example Co 43, Civic Co 1, Flight Co 1,
// Quiet Co 0); 3 remote, 1 hybrid, 40 on site, 1 not stated; 29 of the 44 on boards whose list
// includes pay post it, and Greenhouse's 1 isn't counted.
test.describe('Insights: The market I watch', () => {
	test('shows open jobs by company and by workplace, and pay, in words', async ({ page }) => {
		await page.goto('/insights');
		const market = page.getByRole('region', { name: 'The market I watch' });
		await expect(market.getByText('45 open jobs at 3 companies; 7% remote.')).toBeVisible();

		const companies = market.getByRole('figure', { name: /Open jobs by company/ });
		await expect(companies.getByRole('listitem')).toHaveText([
			'Example Co 43 · 96%',
			'Civic Co 1 · 2%',
			'Flight Co 1 · 2%',
			'Quiet Co 0 · 0%'
		]);
		await companies.getByText('Show the numbers').click();
		await expect(companies.getByRole('table').getByRole('row')).toHaveText([
			'CompanyOpen jobsShare',
			'Example Co4396%',
			'Civic Co12%',
			'Flight Co12%',
			'Quiet Co00%'
		]);

		const workplaces = market.getByRole('figure', { name: /Remote, hybrid or on site/ });
		await expect(workplaces.getByRole('listitem')).toHaveText([
			'Remote 3 · 7%',
			'Hybrid 1 · 2%',
			'On site 40 · 89%',
			'Not stated 1 · 2%'
		]);
		await expect(
			market.getByText(
				'29 of 44 open jobs post pay (66%), on Ashby, Lever and Breezy boards. Greenhouse’s list doesn’t include pay, so its 1 job isn’t counted here.'
			)
		).toBeVisible();
		expect(await violations(page)).toEqual([]);
	});
});

test.describe('Insights: motion', () => {
	const firstBar = (page: Page) =>
		page
			.getByRole('figure', { name: /Remote, hybrid or on site/ })
			.locator('[data-reveal="bar"]')
			.first();
	const width = async (page: Page) =>
		firstBar(page).evaluate((el) => el.getBoundingClientRect().width);

	test('grows a chart’s bars as it scrolls into view, with no CSP errors', async ({ page }) => {
		const blocked: string[] = [];
		page.on('console', (message) => {
			if (/Content.Security.Policy|Refused to apply/i.test(message.text())) {
				blocked.push(message.text());
			}
		});
		await page.goto('/insights');
		// Below the fold, the bars wait at the baseline until they're seen.
		await expect.poll(() => width(page)).toBeLessThan(1);
		await firstBar(page).scrollIntoViewIfNeeded();
		await expect.poll(() => width(page), { timeout: 5000 }).toBeGreaterThan(5);
		expect(blocked).toEqual([]);
	});

	test('keeps everything still and complete under reduced motion', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/insights');
		await page.waitForLoadState('networkidle');
		expect(await width(page)).toBeGreaterThan(5);
	});

	test('shows every chart complete without JavaScript', async ({ browser }) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto('/insights');
		expect(await width(page)).toBeGreaterThan(5);
		await expect(page.getByRole('listitem').filter({ hasText: 'Example Co 43' })).toBeVisible();
		await context.close();
	});
});

// From e2e/seed.sql: of 45 open jobs, 1 is reposted twice (a possible ghost job), 14 have no
// pay in a state whose law may require it, and 1 of the 1 kit with posting text has scam
// patterns. No API key in tests, so drafting is off; the seeded applications carry $0.20.
test.describe('Insights: Signals and costs', () => {
	test('counts each warning, lists the jobs behind it, and links to them', async ({ page }) => {
		await page.goto('/insights');
		const signals = page.getByRole('region', { name: 'Signals and costs' });
		await expect(
			signals.getByText('15 jobs have at least one warning, out of 45 open jobs.')
		).toBeVisible();
		await expect(
			signals.getByRole('figure', { name: /Open jobs with a warning/ }).getByRole('listitem')
		).toHaveText([
			'Possible ghost job 1 · 2% of open jobs',
			'Pay missing 14 · 31% of open jobs',
			'Scam patterns 1 · out of 1 posting checked'
		]);

		const pay = signals.locator('details.flagged', {
			has: page.getByText('Pay missing where a state law may require it')
		});
		await pay.locator('summary').click();
		const payJobs = pay.getByRole('listitem');
		await expect(payJobs).toHaveCount(14);
		// Natural order: 3 before 12.
		await expect(payJobs.nth(1)).toHaveText('Example Co: Software Engineer 3 Illinois');
		await expect(payJobs.nth(2)).toHaveText('Example Co: Software Engineer 6 Illinois');

		const scam = signals.locator('details.flagged').filter({
			has: page.locator('summary', { hasText: 'Scam patterns' })
		});
		await scam.locator('summary').click();
		await expect(scam.getByRole('listitem')).toHaveText([
			'Example Co: Software Engineer 1 Check for equipment, Chat-app contact'
		]);
		await scam.getByRole('link', { name: 'Example Co: Software Engineer 1' }).click();
		await expect(page).toHaveURL(/\/apply\/ashby\/example\//);
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Software Engineer 1');
	});

	test('says plainly that drafting is off, and what it has cost', async ({ page }) => {
		await page.goto('/insights');
		const signals = page.getByRole('region', { name: 'Signals and costs' });
		await expect(
			signals.getByText(
				'Drafting isn’t set up yet: the Worker has no API key. Nothing is spent until it is.'
			)
		).toBeVisible();
		await expect(signals.getByRole('list').last().getByRole('listitem')).toHaveText([
			'$0.00 today, of a $1.00 cap',
			'$0.00 this month',
			'$0.00 in all'
		]);
		await expect(
			signals.getByText('$0.20 across 4 applications, $0.05 each on average.')
		).toBeVisible();
	});

	test('passes the accessibility checks in light and dark, with every list open', async ({
		page
	}) => {
		for (const colorScheme of ['light', 'dark'] as const) {
			await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
			await page.goto('/insights');
			for (const summary of await page.locator('details.flagged summary').all()) {
				await summary.click();
			}
			expect(await violations(page)).toEqual([]);
		}
	});
});
