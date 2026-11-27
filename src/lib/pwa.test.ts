/**
 * Installing Job Ranger on a phone (design note 0009, item 2): the manifest,
 * its icons and the page head agree. A browser that can't read one of these
 * just doesn't offer to install, with no error anywhere, so they're checked
 * here instead.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Icon {
	readonly src: string;
	readonly sizes: string;
	readonly type: string;
	readonly purpose: string;
}

const manifest = JSON.parse(readFileSync('static/manifest.webmanifest', 'utf8')) as {
	readonly id: string;
	readonly name: string;
	readonly short_name: string;
	readonly start_url: string;
	readonly scope: string;
	readonly display: string;
	readonly background_color: string;
	readonly theme_color: string;
	readonly icons: readonly Icon[];
};
const head = readFileSync('src/app.html', 'utf8');

/** A PNG's width and height, from its header. */
function pngSize(file: string): [number, number] {
	const bytes = readFileSync(`static${file}`);
	expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
	return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

describe('the web app manifest', () => {
	it('opens the Jobs page, full screen, inside the app', () => {
		expect(manifest).toMatchObject({
			id: '/',
			name: 'Job Ranger',
			short_name: 'Job Ranger',
			start_url: '/jobs',
			scope: '/',
			display: 'standalone'
		});
		expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
	});

	it('uses the page’s own light background, so the bars match the app', () => {
		const css = readFileSync('src/app.css', 'utf8');
		const light = /--bg: (#[0-9a-f]{6})/.exec(css)?.[1];
		expect(manifest.background_color).toBe(light);
		expect(manifest.theme_color).toBe(light);
	});

	it('has the 192 and 512 icons Android needs, and a maskable one, each the size it says', () => {
		const sizes = manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose}`);
		expect(sizes).toEqual(['192x192 any', '512x512 any', '512x512 maskable']);
		for (const icon of manifest.icons) {
			expect(icon.type).toBe('image/png');
			expect(pngSize(icon.src).join('x')).toBe(icon.sizes);
		}
	});
});

describe('the page head', () => {
	it('links the manifest with cookies, since Cloudflare Access guards every path', () => {
		expect(head).toContain(
			'<link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials" />'
		);
	});

	it('gives iOS its icon, name and a status bar color for each theme', () => {
		expect(head).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
		expect(pngSize('/apple-touch-icon.png')).toEqual([180, 180]);
		expect(head).toContain('<meta name="apple-mobile-web-app-title" content="Job Ranger" />');
		expect(head).toContain('content="#fbfaf7" media="(prefers-color-scheme: light)"');
		expect(head).toContain('content="#131715" media="(prefers-color-scheme: dark)"');
	});
});
