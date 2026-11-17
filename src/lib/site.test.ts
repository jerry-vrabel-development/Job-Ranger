import { describe, expect, it } from 'vitest';
import { pageTitle, SITE } from './site';

describe('pageTitle', () => {
	it('is the site name alone on the home page', () => {
		expect(pageTitle()).toBe('Job Ranger');
		expect(pageTitle('')).toBe('Job Ranger');
		expect(pageTitle('   ')).toBe('Job Ranger');
	});

	it('puts the page first, so tabs stay readable', () => {
		expect(pageTitle('Saved jobs')).toBe('Saved jobs · Job Ranger');
		expect(pageTitle('  Saved jobs  ')).toBe('Saved jobs · Job Ranger');
	});
});

describe('SITE', () => {
	it('points at the real repository and design note', () => {
		expect(SITE.repository).toBe('https://github.com/jerry-vrabel-development/Job-Ranger');
		expect(SITE.designNote.startsWith(SITE.repository)).toBe(true);
		expect(SITE.designNote).toMatch(/docs\/design\/0001-job-ranger\.md$/);
	});
});
