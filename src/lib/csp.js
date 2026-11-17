// @ts-check
import { createHash } from 'node:crypto';

/**
 * SvelteKit's route announcer tells screen readers when the page changes. It
 * hides itself with this exact inline style. Rather than allow every inline
 * style, the Content-Security-Policy allows only this one, by its hash.
 * (A test checks this still matches the installed SvelteKit.)
 */
export const ANNOUNCER_STYLE =
	'position: absolute; left: 0; top: 0; clip: rect(0 0 0 0); clip-path: inset(50%); overflow: hidden; white-space: nowrap; width: 1px; height: 1px';

/**
 * The CSP source for one exact inline style attribute: 'sha256-<base64>'.
 * @param {string} style
 * @returns {`sha256-${string}`}
 */
export function styleHash(style) {
	return `sha256-${createHash('sha256').update(style).digest('base64')}`;
}
