import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Board } from '#lib/jobs/posting.ts';
import recorded from './fixtures/greenhouse-board.json' with { type: 'json' };
import { greenhouse, workplaceFrom } from './greenhouse.ts';
import { SourceFormatError } from './source.ts';

const board: Board = { source: 'greenhouse', token: 'example', company: 'Example Co' };

function job(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: 101,
		title: 'Engineer',
		absolute_url: 'https://job-boards.greenhouse.io/example/jobs/101',
		location: { name: 'Remote' },
		...overrides
	};
}

const one = (overrides: Record<string, unknown>) =>
	greenhouse.parse({ jobs: [job(overrides)] }, board);

describe('greenhouse.boardUrl', () => {
	it('asks the public job board API for the board, with departments', () => {
		expect(greenhouse.boardUrl('example')).toBe(
			'https://boards-api.greenhouse.io/v1/boards/example/jobs?content=true'
		);
	});

	it('keeps an odd board name inside the path', () => {
		expect(greenhouse.boardUrl('a/b?c')).toBe(
			'https://boards-api.greenhouse.io/v1/boards/a%2Fb%3Fc/jobs?content=true'
		);
	});
});

describe('greenhouse.parse on a recorded-shape board', () => {
	const result = greenhouse.parse(recorded, board);

	it('keeps the jobs with an https link, in board order', () => {
		expect(result.postings.map((p) => p.title)).toEqual([
			'Senior Software Engineer',
			'Product Designer'
		]);
		expect(result.skipped['no-apply-link']).toBe(1);
	});

	it('maps every field of a full posting', () => {
		expect(result.postings[0]).toEqual({
			source: 'greenhouse',
			board: 'example',
			id: '4206440009',
			company: 'Example Co',
			title: 'Senior Software Engineer',
			location: 'Remote',
			workplace: 'remote',
			employmentType: null,
			department: 'Engineering',
			applyUrl: 'https://job-boards.greenhouse.io/example/jobs/4206440009',
			jobUrl: 'https://job-boards.greenhouse.io/example/jobs/4206440009',
			postedAt: '2026-11-10T14:00:00.000Z',
			pay: null
		});
	});

	it('never passes off an update date as a posting date', () => {
		const designer = result.postings[1];
		expect(designer?.postedAt).toBeNull();
		expect(designer?.workplace).toBe('hybrid');
		expect(designer?.department).toBeNull();
		expect(designer?.applyUrl).toBe('https://www.example.com/careers?gh_jid=4206440010');
	});
});

describe('greenhouse.parse when the format changes', () => {
	it.each([
		['no body', null],
		['a list instead of an object', []],
		['no jobs list', { meta: {} }],
		['jobs that are not a list', { jobs: {} }]
	])('fails loudly on %s', (_name, body) => {
		expect(() => greenhouse.parse(body, board)).toThrow(SourceFormatError);
	});

	it('accepts an empty board', () => {
		expect(greenhouse.parse({ jobs: [] }, board).postings).toEqual([]);
	});
});

describe('greenhouse.parse, one posting at a time', () => {
	it('accepts a numeric or text id, and refuses a bad one', () => {
		expect(one({ id: '202' }).postings[0]?.id).toBe('202');
		for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 2, ' ', null]) {
			expect(one({ id }).skipped['missing-id']).toBe(1);
		}
		expect(greenhouse.parse({ jobs: ['text', 3] }, board).skipped['missing-id']).toBe(2);
	});

	it('drops a posting with no title or no https link', () => {
		expect(one({ title: '' }).skipped['missing-title']).toBe(1);
		for (const absolute_url of [undefined, 'javascript:alert(1)', 'http://example.com/job']) {
			expect(one({ absolute_url }).skipped['no-apply-link']).toBe(1);
		}
	});

	it('says when no location is given', () => {
		expect(one({ location: null }).postings[0]?.location).toBe('Location not given');
		expect(one({ location: { name: '  ' } }).postings[0]?.workplace).toBe('unknown');
	});

	it('takes the first named department', () => {
		expect(
			one({ departments: [{ name: '' }, 'junk', { name: 'Platform' }] }).postings[0]?.department
		).toBe('Platform');
		expect(one({ departments: 'Engineering' }).postings[0]?.department).toBeNull();
	});

	it('never crashes on odd fields, and always keeps an https link', () => {
		fc.assert(
			fc.property(
				fc.dictionary(
					fc.constantFrom('id', 'title', 'location', 'departments', 'first_published'),
					fc.anything()
				),
				(fields) => {
					for (const posting of one(fields).postings) {
						expect(posting.applyUrl.startsWith('https://')).toBe(true);
						expect(posting.pay).toBeNull();
					}
				}
			)
		);
	});
});

describe('workplaceFrom', () => {
	it('reads the workplace from the words in the location', () => {
		expect(workplaceFrom('Remote - US')).toBe('remote');
		expect(workplaceFrom('Chicago, IL (Hybrid)')).toBe('hybrid');
		expect(workplaceFrom('Remote or hybrid, Denver')).toBe('hybrid');
		expect(workplaceFrom('Austin, TX - On-site')).toBe('on-site');
		expect(workplaceFrom('New York, in office')).toBe('on-site');
		expect(workplaceFrom('Remoteville, ND')).toBe('unknown');
		expect(workplaceFrom('Boston')).toBe('unknown');
	});
});
