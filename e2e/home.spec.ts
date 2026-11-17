import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('the home page', () => {
	test('says what Job Ranger will do, with one main heading', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveTitle('Job Ranger');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('What Job Ranger will do');
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
	});

	test('names the site once in the header, with its mark as decoration', async ({ page }) => {
		await page.goto('/');
		const brand = page.getByRole('banner').getByRole('link');
		// The mark has empty alt text, so the link's name is just the site's name.
		await expect(brand).toHaveAccessibleName('Job Ranger');
		await expect(brand.locator('img')).toHaveAttribute('alt', '');
		await expect(brand.locator('img')).toBeVisible();
	});

	for (const colorScheme of ['light', 'dark'] as const) {
		test(`has no WCAG 2.2 AA violations (${colorScheme})`, async ({ page }) => {
			await page.emulateMedia({ colorScheme });
			await page.goto('/');
			const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
			expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
		});
	}

	test('starts with a skip link that moves focus to the content', async ({ page, browserName }) => {
		// WebKit's Tab key skips links unless the system setting is on, so the
		// keyboard path is checked in Chromium.
		test.skip(browserName === 'webkit', 'WebKit does not tab to links by default');
		await page.goto('/');
		await page.keyboard.press('Tab');
		const skip = page.getByRole('link', { name: 'Skip to content' });
		await expect(skip).toBeFocused();
		await expect(skip).toBeInViewport();
		await page.keyboard.press('Enter');
		await expect(page.locator('main')).toBeFocused();
	});

	test('reflows at 320 pixels wide with no sideways scrolling', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 640 });
		await page.goto('/');
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
	});

	test('sends a strict content security policy and the security headers', async ({ page }) => {
		const response = await page.goto('/');
		const headers = response?.headers() ?? {};
		const csp = headers['content-security-policy'] ?? '';
		expect(csp).toContain("default-src 'self'");
		expect(csp).toContain("frame-ancestors 'none'");
		expect(csp).toContain("object-src 'none'");
		expect(csp).not.toContain('unsafe-inline');
		expect(headers['x-content-type-options']).toBe('nosniff');
		expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
	});

	test('breaks no rule of its own security policy', async ({ page }) => {
		const violations: string[] = [];
		page.on('console', (message) => {
			if (/Content Security Policy|Content-Security-Policy/i.test(message.text())) {
				violations.push(message.text());
			}
		});
		await page.goto('/');
		await page.waitForLoadState('networkidle');
		expect(violations).toEqual([]);
	});
});
