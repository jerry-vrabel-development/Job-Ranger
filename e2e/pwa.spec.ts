import { expect, test } from '@playwright/test';

// Installing Job Ranger on a phone (design note 0009, item 2). The real test
// is on the iPhone; this checks that the Worker serves what a browser reads
// to offer it.

test('links a manifest the browser can read, with every icon it names', async ({
	page,
	request
}) => {
	await page.goto('/jobs');
	const link = page.locator('link[rel="manifest"]');
	await expect(link).toHaveAttribute('crossorigin', 'use-credentials');
	const href = await link.getAttribute('href');
	expect(href).toBe('/manifest.webmanifest');

	const manifest = await request.get('/manifest.webmanifest');
	expect(manifest.status()).toBe(200);
	expect(manifest.headers()['content-type']).toContain('manifest+json');
	const { icons, start_url: start } = (await manifest.json()) as {
		icons: { src: string }[];
		start_url: string;
	};
	expect(start).toBe('/jobs');

	for (const src of [...icons.map((icon) => icon.src), '/apple-touch-icon.png']) {
		const icon = await request.get(src);
		expect(icon.status(), src).toBe(200);
		expect(icon.headers()['content-type'], src).toBe('image/png');
	}
});
