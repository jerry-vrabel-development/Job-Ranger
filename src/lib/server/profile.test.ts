import { describe, expect, it } from 'vitest';
import { checkProfile } from './profile.ts';

const good = {
	name: '  Jane   Doe ',
	headline: 'Full-stack developer',
	email: 'jane@example.com',
	phone: '555-0100',
	location: 'Chicago, IL'
};

describe('checkProfile', () => {
	it('tidies spaces and accepts empty fields', () => {
		expect(checkProfile(good)).toEqual({ ok: true, profile: { ...good, name: 'Jane Doe' } });
		expect(checkProfile({ name: '', headline: '', email: '', phone: '', location: '' }).ok).toBe(
			true
		);
	});

	it.each([
		['name', 'x'.repeat(101), /your name under 100/],
		['headline', 'x'.repeat(151), /the headline under 150/],
		['email', `${'x'.repeat(200)}@a.co`, /the email under 200/],
		['email', 'jane@example', /doesn’t look complete/],
		['phone', '5'.repeat(41), /the phone number under 40/],
		['location', 'x'.repeat(101), /the location under 100/]
	])('points at %s when it is wrong', (field, value, message) => {
		const checked = checkProfile({ ...good, [field]: value });
		expect(checked).toMatchObject({ ok: false, field });
		expect(!checked.ok && checked.message).toMatch(message);
	});
});
