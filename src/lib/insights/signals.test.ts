import { describe, expect, it } from 'vitest';
import {
	listed,
	MAX_LISTED,
	signalBars,
	signalCounts,
	signalSummary,
	type CheckedJob,
	type FlaggedJob,
	type OpenJob
} from './signals.ts';

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
const checked = (id: string, labels: CheckedJob['flags'][number]['label'][]): CheckedJob => ({
	source: 'lever',
	board: 'flight',
	id,
	company: 'Flight Co',
	title: `Job ${id}`,
	flags: labels.map((label) => ({ label, why: '', quote: '' }))
});

describe('signals across open jobs', () => {
	const open = [
		job('fresh'),
		job('old', { firstSeenAt: '2026-08-01T00:00:00.000Z' }),
		job('older', { firstSeenAt: '2026-06-01T00:00:00.000Z', reopenCount: 2 }),
		job('reposted', { reopenCount: 3 }),
		job('chicago', { location: 'Chicago, IL' }),
		// Greenhouse lists never show pay, so they can't be judged from the list.
		job('gh', { source: 'greenhouse', location: 'Chicago, IL' }),
		job('paid', {
			location: 'Chicago, IL',
			pay: { summary: '$1', min: 1, max: 1, currency: 'USD', interval: 'year' }
		})
	];
	const counts = signalCounts(
		open,
		[
			checked('fresh', []),
			checked('chicago', ['Asks you to pay', 'Free email address', 'Asks you to pay'])
		],
		NOW
	);

	it('lists ghost warnings longest open first, with the facts in a few words', () => {
		expect(counts.ghost.map((j) => [j.id, j.why])).toEqual([
			['older', 'Open 177 days, reposted twice'],
			['old', 'Open 116 days'],
			['reposted', 'Open 5 days, reposted 3 times']
		]);
	});

	it('words the rare cases: reposted once, and flagged on the day it was first seen', () => {
		const rare = signalCounts(
			[
				job('once', { firstSeenAt: '2026-08-01T00:00:00.000Z', reopenCount: 1 }),
				job('today', { firstSeenAt: NOW, reopenCount: 2 })
			],
			[],
			NOW
		);
		expect(rare.ghost.map((j) => [j.id, j.why])).toEqual([
			['once', 'Open 116 days, reposted once'],
			['today', 'Reposted twice']
		]);
	});

	it('lists pay missing where a state law may require it, naming the state', () => {
		expect(counts.pay.map((j) => [j.id, j.why])).toEqual([['chicago', 'Illinois']]);
	});

	it('lists scam patterns from the postings checked, each label once', () => {
		expect(counts.scam.map((j) => [j.id, j.why])).toEqual([
			['chicago', 'Asks you to pay, Free email address']
		]);
		expect(counts).toMatchObject({ open: 7, checked: 2 });
	});

	it('makes one bar per signal, each against what it was checked against', () => {
		expect(signalBars(counts)).toEqual([
			{ label: 'Possible ghost job', count: 3, detail: '43% of open jobs' },
			{ label: 'Pay missing', count: 1, detail: '14% of open jobs' },
			{ label: 'Scam patterns', count: 1, detail: 'out of 2 postings checked' }
		]);
		const none = signalCounts([], [], NOW);
		expect(signalBars(none).map((b) => b.detail)).toEqual([null, null, 'none checked yet']);
		expect(signalBars(signalCounts([job('a')], [checked('a', [])], NOW))[2]?.detail).toBe(
			'out of 1 posting checked'
		);
	});

	it('sums up, counting a job with two warnings once', () => {
		expect(signalSummary(counts)).toBe('4 jobs have at least one warning, out of 7 open jobs.');
		expect(
			signalSummary(
				signalCounts([job('old', { firstSeenAt: '2026-08-01T00:00:00.000Z' })], [], NOW)
			)
		).toBe('1 job has at least one warning, out of 1 open job.');
		expect(signalSummary(signalCounts([job('a'), job('b')], [], NOW))).toBe(
			'No warnings on 2 open jobs.'
		);
		expect(signalSummary(signalCounts([], [], NOW))).toBe('No open jobs to check right now.');
	});

	it('breaks ties by company, then title, in natural order', () => {
		const tied = signalCounts(
			[
				job('b', { company: 'B Co', reopenCount: 2 }),
				job('a2', { company: 'A Co', title: 'Z', reopenCount: 2 }),
				job('a1', { company: 'A Co', title: 'A', reopenCount: 2 })
			],
			[],
			NOW
		);
		expect(tied.ghost.map((j) => j.id)).toEqual(['a1', 'a2', 'b']);
		const numbered = signalCounts(
			[
				job('12', { title: 'Engineer 12', reopenCount: 2 }),
				job('3', { title: 'Engineer 3', reopenCount: 2 })
			],
			[],
			NOW
		);
		// Numbers in titles sort as numbers.
		expect(numbered.ghost.map((j) => j.id)).toEqual(['3', '12']);
	});
});

describe('listing flagged jobs', () => {
	const many: FlaggedJob[] = Array.from({ length: MAX_LISTED + 2 }, (_, i) => ({
		source: 'lever',
		board: 'flight',
		id: String(i),
		company: 'Flight Co',
		title: 'Job',
		why: ''
	}));

	it('lists up to the limit, and counts the rest in words', () => {
		expect(listed(many).jobs).toHaveLength(MAX_LISTED);
		expect(listed(many).more).toBe('And 2 more jobs.');
		expect(listed(many.slice(0, MAX_LISTED + 1)).more).toBe('And 1 more job.');
		expect(listed(many.slice(0, 3))).toEqual({ jobs: many.slice(0, 3), more: null });
	});
});
