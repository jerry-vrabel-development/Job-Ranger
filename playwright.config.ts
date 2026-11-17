import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * Browser tests on the built Worker, as it will run on Cloudflare: desktop,
 * Android and iPhone (WebKit). Every page gets an axe check (see e2e/).
 */
export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: !!process.env['CI'],
	retries: process.env['CI'] ? 1 : 0,
	reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: { baseURL: `http://localhost:${String(PORT)}`, trace: 'retain-on-failure' },
	projects: [
		{ name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
		{ name: 'android', use: { ...devices['Pixel 7'] } },
		{ name: 'iphone', use: { ...devices['iPhone 14'] } }
	],
	webServer: {
		command: 'npm run build && npm run preview',
		port: PORT,
		reuseExistingServer: !process.env['CI'],
		timeout: 120_000
	}
});
