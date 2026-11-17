/**
 * Security headers on every response, alongside the Content-Security-Policy
 * that SvelteKit writes (see `csp` in vite.config.ts). Pure, so it is
 * tested on its own.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
};

/** Sets the security headers on a response, replacing any earlier values. */
export function withSecurityHeaders(headers: Headers): Headers {
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
	return headers;
}
