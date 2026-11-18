import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Board } from '#lib/jobs/posting.ts';
import shaped from './fixtures/lever-board.json' with { type: 'json' };
import { fromMillis, lever, parseSalary } from './lever.ts';
import { SourceFormatError } from './source.ts';

const board: Board = { source: 'lever', token: 'example', company: 'Example Co' };

function job(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: 'abc',
		text: 'Engineer',
		categories: { location: 'Remote' },
		hostedUrl: 'https://jobs.lever.co/example/abc',
		applyUrl: 'https://jobs.lever.co/example/abc/apply',
		...overrides
	};
}

const one = (overrides: Record<string, unknown>) => lever.parse([job(overrides)], board);
const first = (overrides: Record<string, unknown>) => one(overrides).postings[0];

describe('lever.boardUrl', () => {
	it('asks the public postings API for the board as JSON', () => {
		expect(lever.boardUrl('example')).toBe('https://api.lever.co/v0/postings/example?mode=json');
	});

	it('keeps an odd board name inside the path', () => {
		expect(lever.boardUrl('a/b?c')).toBe('https://api.lever.co/v0/postings/a%2Fb%3Fc?mode=json');
	});
});

describe('lever.parse on a board in the documented shape', () => {
	const result = lever.parse(shaped, board);

	it('keeps the jobs with an https link, in board order', () => {
		expect(result.postings.map((p) => p.title)).toEqual([
			'Senior Firmware Engineer, Flight Controls',
			'Robotics Technician'
		]);
		expect(result.skipped['no-apply-link']).toBe(1);
		expect(result.companyName).toBeUndefined();
	});

	it('maps every field of a full posting', () => {
		expect(result.postings[0]).toEqual({
			source: 'lever',
			board: 'example',
			id: '6e5c2b1a-0f3d-4f1e-9a51-1c2d3e4f5a6b',
			company: 'Example Co',
			title: 'Senior Firmware Engineer, Flight Controls',
			location: 'Remote - US; Austin, TX',
			workplace: 'remote',
			employmentType: 'Full-time',
			department: 'Engineering · Avionics',
			applyUrl: 'https://jobs.lever.co/example/6e5c2b1a-0f3d-4f1e-9a51-1c2d3e4f5a6b/apply',
			jobUrl: 'https://jobs.lever.co/example/6e5c2b1a-0f3d-4f1e-9a51-1c2d3e4f5a6b',
			postedAt: '2025-11-13T16:00:00.000Z',
			pay: {
				summary: '$150,000 – $190,000 per year',
				min: 150000,
				max: 190000,
				currency: 'USD',
				interval: 'per-year-salary'
			}
		});
	});

	it('applies on the posting page when there is no separate apply link', () => {
		expect(result.postings[1]).toMatchObject({
			location: 'Chicago, IL',
			workplace: 'on-site',
			employmentType: 'Part-time',
			department: 'Field Ops',
			applyUrl: 'https://jobs.lever.co/example/a1b2c3d4-0000-4000-8000-000000000002',
			jobUrl: 'https://jobs.lever.co/example/a1b2c3d4-0000-4000-8000-000000000002',
			pay: null
		});
	});
});

describe('lever.parse, field by field', () => {
	it('fails loudly when the response is not a list', () => {
		expect(() => lever.parse({ jobs: [] }, board)).toThrow(SourceFormatError);
		expect(() => lever.parse(null, board)).toThrow(SourceFormatError);
	});

	it('reads an empty board as no jobs', () => {
		expect(lever.parse([], board).postings).toEqual([]);
	});

	it('skips and counts postings without an id or a title', () => {
		const result = lever.parse(
			[job({ id: '' }), 'not a job', job({ text: '  ' }), job({ id: 7 })],
			board
		);
		expect(result.postings).toEqual([]);
		expect(result.skipped).toMatchObject({ 'missing-id': 3, 'missing-title': 1 });
	});

	it('skips a posting with no https link at all', () => {
		const result = one({ hostedUrl: 'javascript:alert(1)', applyUrl: undefined });
		expect(result.postings).toEqual([]);
		expect(result.skipped['no-apply-link']).toBe(1);
	});

	it.each([
		['remote', 'remote'],
		['Hybrid', 'hybrid'],
		['onsite', 'on-site'],
		['on-site', 'on-site'],
		['unspecified', 'unknown'],
		[undefined, 'unknown'],
		['constructor', 'unknown'],
		['__proto__', 'unknown'],
		[3, 'unknown']
	])('reads workplace %s as %s', (workplaceType, workplace) => {
		expect(first({ workplaceType })?.workplace).toBe(workplace);
	});

	it('says so when no location is given', () => {
		expect(first({ categories: {} })?.location).toBe('Location not given');
		expect(first({ categories: 'odd' })?.location).toBe('Location not given');
		expect(first({ categories: { allLocations: [7, ''], location: 'Denver, CO' } })?.location).toBe(
			'Denver, CO'
		);
	});

	it('keeps department and team once when they match', () => {
		expect(first({ categories: { department: 'Ops', team: 'Ops' } })?.department).toBe('Ops');
		expect(first({ categories: { department: 'Ops' } })?.department).toBe('Ops');
		expect(first({ categories: {} })?.department).toBeNull();
	});
});

describe('fromMillis', () => {
	it('reads Lever’s milliseconds, and nothing else', () => {
		expect(fromMillis(1763049600000)).toBe('2025-11-13T16:00:00.000Z');
		expect(fromMillis('1763049600000')).toBeNull();
		expect(fromMillis(0)).toBeNull();
		expect(fromMillis(-5)).toBeNull();
		expect(fromMillis(Number.NaN)).toBeNull();
		expect(fromMillis(1e20)).toBeNull();
	});
});

describe('parseSalary', () => {
	it.each([
		[
			{ min: 150000, max: 190000, currency: 'USD', interval: 'per-year-salary' },
			'$150,000 – $190,000 per year'
		],
		[{ min: 40, max: 40, currency: 'USD', interval: 'per-hour-wage' }, '$40 per hour'],
		[{ min: 90000, currency: 'CAD' }, 'CA$90,000'],
		[{ max: 120000, currency: 'EUR', interval: 'per_month' }, '€120,000 per month'],
		[{ min: 1000, max: 2000, currency: 'NOTACODE' }, 'NOTACODE 1,000 – NOTACODE 2,000'],
		[{ min: 5000, max: 6000 }, '5,000 – 6,000'],
		[{ min: 5000, interval: 'salary' }, '5,000']
	])('writes %o as %s', (value, summary) => {
		expect(parseSalary(value)?.summary).toBe(summary);
	});

	it('is null when there is no amount', () => {
		expect(parseSalary(null)).toBeNull();
		expect(parseSalary({ currency: 'USD' })).toBeNull();
		expect(parseSalary({ min: 'lots' })).toBeNull();
	});

	it('never throws, whatever the board sends', () => {
		fc.assert(
			fc.property(fc.anything(), (value) => {
				const pay = parseSalary(value);
				expect(pay === null || typeof pay.summary === 'string').toBe(true);
			})
		);
	});
});
