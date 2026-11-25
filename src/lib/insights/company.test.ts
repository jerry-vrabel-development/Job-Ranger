import { describe, expect, it } from 'vitest';
import { companySummary, history, openRows, type Applied, type Mark } from './company.ts';
import type { OpenJob } from './signals.ts';

const NOW = '2026-11-25T18:00:00.000Z';
const job = (id: string, extra: Partial<OpenJob> = {}): OpenJob => ({
	source: 'lever',
	board: 'flight',
	id,
	company: 'Flight Co',
	title: `Job ${id}`,
	location: 'Remote',
	pay: null,
	postedAt: null,
	firstSeenAt: '2026-11-20T11:23:00.000Z',
	reopenCount: 0,
	...extra
});

describe('open jobs on the company page', () => {
	it('keeps the stored order and gives each job its warnings in a few words', () => {
		expect(
			openRows(
				[
					job('plain'),
					job('both', {
						location: 'Chicago, IL',
						firstSeenAt: '2026-08-01T00:00:00.000Z'
					}),
					job('pay', { location: 'Denver, CO' })
				],
				NOW
			)
		).toEqual([
			{ id: 'plain', title: 'Job plain', warnings: [] },
			{
				id: 'both',
				title: 'Job both',
				warnings: ['Possible ghost job: open 116 days', 'Pay missing (Illinois)']
			},
			{ id: 'pay', title: 'Job pay', warnings: ['Pay missing (Colorado)'] }
		]);
	});
});

describe('my history with a company', () => {
	const marks: Mark[] = [
		{ id: 'a', title: 'Saved job', mark: 'saved', note: '', at: '2026-11-21T15:00:00.000Z' },
		{
			id: 'b',
			title: 'Passed job',
			mark: 'passed',
			note: 'Too far',
			at: '2026-11-22T15:00:00.000Z'
		},
		{ id: 'c', title: 'Passed quietly', mark: 'passed', note: '', at: '2026-11-20T15:00:00.000Z' },
		// Saved, then applied: the application is what shows.
		{ id: 'd', title: 'Applied job', mark: 'saved', note: '', at: '2026-11-19T15:00:00.000Z' }
	];
	const applied: Applied[] = [
		{
			id: 'd',
			title: 'Applied job',
			status: 'interviewing',
			appliedAt: '2026-11-23T15:00:00.000Z'
		},
		{ id: 'e', title: 'Just applied', status: 'applied', appliedAt: '2026-11-18T15:00:00.000Z' }
	];

	it('lists what I did, newest first, an application over a saved mark', () => {
		expect(history(marks, applied).map((row) => [row.id, row.what])).toEqual([
			['d', 'Applied Nov 23, 2026 · Interviewing'],
			['b', 'Passed Nov 22, 2026: Too far'],
			['a', 'Saved Nov 21, 2026'],
			['c', 'Passed Nov 20, 2026'],
			['e', 'Applied Nov 18, 2026']
		]);
	});

	it('breaks a tie in time by title, and is empty with nothing done', () => {
		const at = '2026-11-21T15:00:00.000Z';
		expect(
			history(
				[
					{ id: 'z', title: 'Zed', mark: 'saved', note: '', at },
					{ id: 'y', title: 'Alpha', mark: 'saved', note: '', at }
				],
				[]
			).map((row) => row.title)
		).toEqual(['Alpha', 'Zed']);
		expect(history([], [])).toEqual([]);
	});
});

describe('the company in one sentence', () => {
	it('says what’s open, closed, reopened and warned, and where I stand', () => {
		expect(companySummary({ open: 75, closed: 6, reposted: 2, applied: 2, warned: 3 })).toBe(
			'75 open jobs; 6 closed in the last 30 days; 2 open again after closing; 3 jobs with a warning. You’ve applied 2 times.'
		);
		expect(companySummary({ open: 1, closed: 0, reposted: 0, applied: 1, warned: 1 })).toBe(
			'1 open job; 0 closed in the last 30 days; 1 job with a warning. You’ve applied once.'
		);
		expect(companySummary({ open: 0, closed: 0, reposted: 0, applied: 0, warned: 0 })).toBe(
			'0 open jobs; 0 closed in the last 30 days. You haven’t applied here yet.'
		);
	});
});
