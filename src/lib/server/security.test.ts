import { describe, expect, it } from 'vitest';
import { SECURITY_HEADERS, withSecurityHeaders } from './security';

describe('withSecurityHeaders', () => {
	it('sets every security header', () => {
		const headers = withSecurityHeaders(new Headers());
		for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
			expect(headers.get(name), name).toBe(value);
		}
	});

	it('replaces a weaker value set earlier, and keeps unrelated headers', () => {
		const headers = withSecurityHeaders(
			new Headers({ 'Referrer-Policy': 'unsafe-url', 'Content-Type': 'text/html' })
		);
		expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
		expect(headers.get('Content-Type')).toBe('text/html');
	});

	it('turns off powerful browser features the app never needs', () => {
		const policy = SECURITY_HEADERS['Permissions-Policy'] ?? '';
		for (const feature of ['camera', 'microphone', 'geolocation', 'payment']) {
			expect(policy).toContain(`${feature}=()`);
		}
	});
});
