import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Board } from '#lib/jobs/posting.ts';
import { ashby, parseCompensation } from './ashby.ts';
import recorded from './fixtures/ashby-board.json' with { type: 'json' };
import { SourceFormatError } from './source.ts';

const board: Board = { source: 'ashby', token: 'example', company: 'Example Co' };

/** A minimal listed job, so each test changes only what it is about. */
function job(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: 'job-1',
		title: 'Engineer',
		isListed: true,
		applyUrl: 'https://jobs.ashbyhq.com/example/job-1/application',
		...overrides
	};
}

describe('ashby.boardUrl', () => {
	it('asks the public posting API for the board, with pay included', () => {
		expect(ashby.boardUrl('example')).toBe(
			'https://api.ashbyhq.com/posting-api/job-board/example?includeCompensation=true'
		);
	});

	it('keeps an odd board name inside the path', () => {
		expect(ashby.boardUrl('a/b?c')).toBe(
			'https://api.ashbyhq.com/posting-api/job-board/a%2Fb%3Fc?includeCompensation=true'
		);
	});
});

describe('ashby.parse on a recorded-shape board', () => {
	const result = ashby.parse(recorded, board);

	it('keeps the listed jobs that have an apply link, in board order', () => {
		expect(result.postings.map((p) => p.title)).toEqual([
			'Senior Software Engineer, Accessibility',
			'QA Engineer'
		]);
	});

	it('counts what it left out, and why', () => {
		expect(result.skipped).toEqual({
			'no-apply-link': 1,
			'missing-id': 0,
			'missing-title': 0,
			unlisted: 1
		});
	});

	it('maps every field of a full posting', () => {
		expect(result.postings[0]).toEqual({
			source: 'ashby',
			board: 'example',
			id: '4f1c2d3e-0a1b-4c5d-8e9f-000000000001',
			company: 'Example Co',
			title: 'Senior Software Engineer, Accessibility',
			location: 'Chicago, IL; Remote (US)',
			workplace: 'hybrid',
			employmentType: 'Full time',
			department: 'Engineering · Platform',
			applyUrl: 'https://jobs.ashbyhq.com/example/4f1c2d3e-0a1b-4c5d-8e9f-000000000001/application',
			jobUrl: 'https://jobs.ashbyhq.com/example/4f1c2d3e-0a1b-4c5d-8e9f-000000000001',
			postedAt: '2026-11-12T15:04:05.000Z',
			pay: {
				summary: '$150K - $180K',
				min: 150000,
				max: 180000,
				currency: 'USD',
				interval: '1 YEAR'
			}
		});
	});

	it('leaves pay empty when none is posted, rather than guessing', () => {
		expect(result.postings[1]?.pay).toBeNull();
		expect(result.postings[1]?.workplace).toBe('remote');
		expect(result.postings[1]?.department).toBe('Engineering');
		expect(result.postings[1]?.employmentType).toBe('Contract');
	});
});

describe('ashby.parse when the format changes', () => {
	it.each([
		['no body', null],
		['a list instead of an object', []],
		['no jobs list', { apiVersion: '1' }],
		['jobs that are not a list', { jobs: {} }]
	])('fails loudly on %s', (_name, body) => {
		expect(() => ashby.parse(body, board)).toThrow(SourceFormatError);
	});

	it('fails loudly on an API version it does not know', () => {
		expect(() => ashby.parse({ apiVersion: '2', jobs: [] }, board)).toThrow(/version "2"/);
	});

	it('accepts a response with no version, and an empty board', () => {
		expect(ashby.parse({ jobs: [] }, board).postings).toEqual([]);
	});
});

describe('ashby.parse, one posting at a time', () => {
	const one = (overrides: Record<string, unknown>) =>
		ashby.parse({ jobs: [job(overrides)] }, board);

	it('drops a posting with no usable apply link: no link, no listing', () => {
		for (const applyUrl of [
			undefined,
			'',
			'not a url',
			'http://jobs.example/apply',
			'javascript:alert(1)'
		]) {
			expect(one({ applyUrl }).skipped['no-apply-link']).toBe(1);
		}
	});

	it('drops a posting with no id or title, and anything that is not a posting', () => {
		expect(one({ id: '  ' }).skipped['missing-id']).toBe(1);
		expect(one({ title: null }).skipped['missing-title']).toBe(1);
		expect(ashby.parse({ jobs: ['text', 3, null] }, board).skipped['missing-id']).toBe(3);
	});

	it('says "unknown" when the workplace is missing or new to us', () => {
		expect(one({}).postings[0]?.workplace).toBe('unknown');
		expect(one({ workplaceType: 'Moon' }).postings[0]?.workplace).toBe('unknown');
		expect(one({ workplaceType: 'OnSite' }).postings[0]?.workplace).toBe('on-site');
	});

	it('says when no location is given', () => {
		expect(one({}).postings[0]?.location).toBe('Location not given');
		expect(
			one({ secondaryLocations: [{ location: 'Denver' }, 'junk'] }).postings[0]?.location
		).toBe('Denver');
	});

	it('keeps an employment type it does not know, as written', () => {
		expect(one({ employmentType: 'Seasonal' }).postings[0]?.employmentType).toBe('Seasonal');
		expect(one({ employmentType: 7 }).postings[0]?.employmentType).toBeNull();
	});

	it('keeps a bad date or job link out, but keeps the posting', () => {
		const posting = one({ publishedAt: 'soon', jobUrl: 'ftp://x' }).postings[0];
		expect(posting?.postedAt).toBeNull();
		expect(posting?.jobUrl).toBeNull();
	});

	it('uses the team when there is no department', () => {
		expect(one({ team: 'Growth' }).postings[0]?.department).toBe('Growth');
	});

	it('never crashes on hostile or odd job fields, and keeps text plain', () => {
		fc.assert(
			fc.property(
				fc.dictionary(
					fc.constantFrom('id', 'title', 'location', 'department', 'team', 'employmentType'),
					fc.oneof(fc.string(), fc.constant('<script>x</script>\n\t\u0000'), fc.anything())
				),
				(fields) => {
					const result = one(fields);
					for (const posting of result.postings) {
						// eslint-disable-next-line no-control-regex -- checking control characters are gone
						expect(posting.title).not.toMatch(/[\n\t\u0000]/);
						expect(posting.applyUrl.startsWith('https://')).toBe(true);
					}
				}
			)
		);
	});
});

describe('parseCompensation', () => {
	it('is null when nothing is posted', () => {
		expect(parseCompensation(undefined)).toBeNull();
		expect(parseCompensation({})).toBeNull();
		expect(parseCompensation({ summaryComponents: 'no' })).toBeNull();
	});

	it('falls back to the tier summary', () => {
		expect(parseCompensation({ compensationTierSummary: '$90K' })?.summary).toBe('$90K');
	});

	it('writes a summary from the numbers when there is no text', () => {
		const salary = (minValue: unknown, maxValue: unknown) =>
			parseCompensation({
				summaryComponents: [{ compensationType: 'Salary', minValue, maxValue, currencyCode: 'USD' }]
			});
		expect(salary(90000, 110000)?.summary).toBe('USD 90000 – 110000');
		expect(salary(90000, 90000)?.summary).toBe('USD 90000');
		expect(salary(null, 110000)?.summary).toBe('USD 110000');
		expect(salary('lots', Infinity)).toBeNull();
		expect(
			parseCompensation({ summaryComponents: [{ compensationType: 'Salary', minValue: 5 }] })
				?.summary
		).toBe('5');
	});
});
