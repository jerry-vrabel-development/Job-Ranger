import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/** Browser tests that change the data. */
const EDITS = /-edit\.spec\.ts$/;

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
		{ name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] }, testIgnore: EDITS },
		{ name: 'android', use: { ...devices['Pixel 7'] }, testIgnore: EDITS },
		{ name: 'iphone', use: { ...devices['iPhone 14'] }, testIgnore: EDITS },
		// Tests that change the data run last, once, so they can't disturb the rest.
		{
			name: 'edits',
			use: { ...devices['Desktop Chrome'] },
			testMatch: EDITS,
			dependencies: ['desktop-chrome', 'android', 'iphone']
		}
	],
	webServer: {
		// Builds, sets up a local D1 with the test data (e2e/seed.sql), then serves.
		command: 'npm run e2e:serve',
		port: PORT,
		reuseExistingServer: !process.env['CI'],
		timeout: 120_000
	}
});
