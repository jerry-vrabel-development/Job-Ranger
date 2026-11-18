import { describe, expect, it } from 'vitest';
import type { Board } from '#lib/jobs/posting.ts';
import shaped from './fixtures/breezy-board.json' with { type: 'json' };
import { breezy } from './breezy.ts';
import { SourceFormatError } from './source.ts';

const board: Board = { source: 'breezy', token: 'example', company: 'Example Org' };

function job(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return { id: 'x1', name: 'Advisor', url: 'https://example.breezy.hr/p/x1', ...overrides };
}

const first = (overrides: Record<string, unknown>) =>
	breezy.parse([job(overrides)], board).postings[0];

describe('breezy.boardUrl', () => {
	it('asks the company’s own breezy.hr address for its jobs', () => {
		expect(breezy.boardUrl('community-solutions')).toBe(
			'https://community-solutions.breezy.hr/json'
		);
	});

	it.each(['evil.com#', 'a/b', 'a.b', '-x', 'x-', 'Upper', '', 'a'.repeat(64)])(
		'refuses %s, so the request can only go to breezy.hr',
		(token) => {
			expect(() => breezy.boardUrl(token)).toThrow(SourceFormatError);
		}
	);
});

describe('breezy.parse on a board in the shape third-party readers describe', () => {
	const result = breezy.parse(shaped, board);

	it('keeps the jobs with an https link, and reads the company’s name', () => {
		expect(result.postings.map((p) => p.title)).toEqual([
			'Data Systems Advisor',
			'Community Organizer'
		]);
		expect(result.skipped['no-apply-link']).toBe(1);
		expect(result.companyName).toBe('Example Org');
	});

	it('maps every field of a full posting', () => {
		expect(result.postings[0]).toEqual({
			source: 'breezy',
			board: 'example',
			id: 'a1b2c3d4e5f6',
			company: 'Example Org',
			title: 'Data Systems Advisor',
			location: 'Remote - US',
			workplace: 'remote',
			employmentType: 'Full-Time',
			department: 'Built for Zero',
			applyUrl: 'https://example.breezy.hr/p/a1b2c3d4e5f6-data-systems-advisor',
			jobUrl: 'https://example.breezy.hr/p/a1b2c3d4e5f6-data-systems-advisor',
			postedAt: '2026-11-10T15:00:00.000Z',
			pay: { summary: '$76,000 - $97,000', min: null, max: null, currency: null, interval: null }
		});
	});

	it('builds a location from its parts, and reads text or named fields', () => {
		expect(result.postings[1]).toMatchObject({
			location: 'Chicago, Illinois, United States',
			workplace: 'unknown',
			employmentType: 'Part-Time',
			department: 'Field',
			postedAt: null,
			pay: null
		});
	});
});

describe('breezy.parse, field by field', () => {
	it('fails loudly when the response is not a list', () => {
		expect(() => breezy.parse({ positions: [] }, board)).toThrow(SourceFormatError);
	});

	it('reads an empty board as no jobs, with no company name', () => {
		expect(breezy.parse([], board)).toMatchObject({ postings: [], companyName: null });
	});

	it('falls back to friendly_id, and skips postings without an id or title', () => {
		expect(first({ id: undefined, friendly_id: 'f-1' })?.id).toBe('f-1');
		const result = breezy.parse([job({ id: '' }), 'odd', job({ name: ' ' })], board);
		expect(result.postings).toEqual([]);
		expect(result.skipped).toMatchObject({ 'missing-id': 2, 'missing-title': 1 });
	});

	it('reads remote, hybrid and unstated workplaces', () => {
		expect(first({ location: { name: 'Anywhere', is_remote: true } })?.workplace).toBe('remote');
		expect(first({ location: { name: 'Atlanta (Hybrid)' } })?.workplace).toBe('hybrid');
		expect(first({ location: 'Remote' })?.workplace).toBe('remote');
		expect(first({})?.workplace).toBe('unknown');
	});

	it('says so when no location is given', () => {
		expect(first({})?.location).toBe('Location not given');
		expect(first({ location: {} })?.location).toBe('Location not given');
	});

	it('leaves type, team and pay empty when Breezy gives none', () => {
		expect(first({ type: 7, department: { id: 3 }, salary: '  ' })).toMatchObject({
			employmentType: null,
			department: null,
			pay: null
		});
	});

	it('takes the company name from the first job that has one', () => {
		const result = breezy.parse([job(), job({ id: 'x2', company: 'Text Name' })], board);
		expect(result.companyName).toBe('Text Name');
	});
});
