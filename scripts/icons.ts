// Writes the app icons for installing Job Ranger on a phone (design note
// 0009, item 2) from the favicon's shapes. Run it with `npm run icons` if the
// favicon ever changes; the PNGs are committed, so nothing runs at build time.
//
// - icon-192.png, icon-512.png: the favicon as it is (rounded corners).
// - icon-maskable-512.png: full-bleed background with the compass inside
//   the middle 80%, because Android crops it to its own shape.
// - apple-touch-icon.png (180): full-bleed too; iOS rounds the corners itself.
import sharp from 'sharp';

const GREEN = '#1f5c3f';
const PAPER = '#fbfaf7';
const GOLD = '#e8b931';

/** The compass from static/favicon.svg, drawn in a 64-unit box. */
const COMPASS = `
	<circle cx="32" cy="32" r="20" fill="none" stroke="${PAPER}" stroke-width="4" />
	<path d="M32 14 L38 32 L32 50 L26 32 Z" fill="${PAPER}" />
	<path d="M32 14 L38 32 L26 32 Z" fill="${GOLD}" />`;

const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
	<rect width="64" height="64" rx="14" fill="${GREEN}" />${COMPASS}
</svg>`;

/** Square, edge to edge, with the compass scaled to `share` of the side. */
const fullBleed = (share: number) => {
	const offset = (32 * (1 - share)).toFixed(2);
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
	<rect width="64" height="64" fill="${GREEN}" />
	<g transform="translate(${offset} ${offset}) scale(${String(share)})">${COMPASS}</g>
</svg>`;
};

const icons: readonly [string, string, number][] = [
	['static/icon-192.png', rounded, 192],
	['static/icon-512.png', rounded, 512],
	// The compass already sits inside 40 of 64 units; 0.9 keeps it well inside Android's safe zone.
	['static/icon-maskable-512.png', fullBleed(0.9), 512],
	['static/apple-touch-icon.png', fullBleed(1), 180]
];

for (const [file, svg, size] of icons) {
	await sharp(Buffer.from(svg), { density: 72 * (size / 64) })
		.resize(size, size)
		.png({ compressionLevel: 9 })
		.toFile(file);
	console.log(`Wrote ${file} (${String(size)}×${String(size)})`);
}
