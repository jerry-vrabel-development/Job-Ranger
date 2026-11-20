import { describe, expect, it } from 'vitest';
import {
	dateLabel,
	checkedLabel,
	countLabel,
	latest,
	postedLabel,
	toJobCard,
	workplaceLabel
} from './display.ts';
import type { StoredPosting } from './sync.ts';

const NOW = '2026-11-17T18:00:00.000Z';

const stored: StoredPosting = {
	source: 'ashby',
	board: 'example',
	id: 'a',
	company: 'Example Co',
	title: 'QA Engineer',
	location: 'Chicago, IL',
	workplace: 'hybrid',
	employmentType: 'Full time',
	department: 'Engineering',
	applyUrl: 'https://jobs.ashbyhq.com/example/a/application',
	jobUrl: 'https://jobs.ashbyhq.com/example/a',
	postedAt: '2026-11-12T15:00:00.000Z',
	pay: { summary: '$150K - $180K', min: 150000, max: 180000, currency: 'USD', interval: '1 YEAR' },
	firstSeenAt: NOW,
	lastSeenAt: NOW,
	closedAt: null,
	reopenCount: 0,
	seenAt: null
};

describe('workplaceLabel', () => {
	it('says each workplace in words', () => {
		expect(workplaceLabel('remote')).toBe('Remote');
		expect(workplaceLabel('hybrid')).toBe('Hybrid');
		expect(workplaceLabel('on-site')).toBe('On site');
		expect(workplaceLabel('unknown')).toBe('Workplace not stated');
	});
});

describe('postedLabel', () => {
	it('counts whole days', () => {
		expect(postedLabel('2026-11-17T01:00:00.000Z', NOW)).toBe('Posted today');
		expect(postedLabel('2026-11-16T23:00:00.000Z', NOW)).toBe('Posted yesterday');
		expect(postedLabel('2026-11-12T15:00:00.000Z', NOW)).toBe('Posted 5 days ago');
	});

	it('treats a date in the future as today, and says when there is none', () => {
		expect(postedLabel('2026-11-20T00:00:00.000Z', NOW)).toBe('Posted today');
		expect(postedLabel(null, NOW)).toBe('Posting date not given');
	});
});

describe('toJobCard', () => {
	it('carries only what a card shows, in words', () => {
		expect(toJobCard(stored, NOW)).toEqual({
			key: 'ashby:example:a',
			source: 'ashby',
			board: 'example',
			id: 'a',
			title: 'QA Engineer',
			company: 'Example Co',
			isNew: true,
			where: 'Chicago, IL · Hybrid',
			pay: '$150K - $180K',
			employmentType: 'Full time',
			department: 'Engineering',
			posted: 'Posted 5 days ago',
			postedAt: '2026-11-12T15:00:00.000Z',
			applyUrl: 'https://jobs.ashbyhq.com/example/a/application',
			jobUrl: 'https://jobs.ashbyhq.com/example/a'
		});
	});

	it('points to the posting for pay when the source does not list it', () => {
		const card = toJobCard({ ...stored, source: 'greenhouse', pay: null }, NOW);
		expect(card.pay).toBe('See the posting for pay');
	});

	it('says when pay is not posted, and when a job has been seen', () => {
		const card = toJobCard({ ...stored, pay: null, seenAt: NOW }, NOW);
		expect(card.pay).toBe('Pay not posted');
		expect(card.isNew).toBe(false);
	});
});

describe('countLabel', () => {
	it('uses the singular for one', () => {
		expect(countLabel(1, 'open job')).toBe('1 open job');
		expect(countLabel(0, 'open job')).toBe('0 open jobs');
		expect(countLabel(2, 'board')).toBe('2 boards');
	});
});

describe('checkedLabel', () => {
	it('says the date, or that no check has run', () => {
		expect(checkedLabel('2026-11-17T11:23:00.000Z')).toBe('Nov 17, 2026');
		expect(checkedLabel(null)).toBe('Not checked yet');
	});
});

describe('latest', () => {
	it('picks the most recent date, ignoring blanks', () => {
		expect(latest([null, '2026-11-16T00:00:00.000Z', '2026-11-17T00:00:00.000Z', null])).toBe(
			'2026-11-17T00:00:00.000Z'
		);
		expect(latest(['2026-11-17T00:00:00.000Z', '2026-11-16T00:00:00.000Z'])).toBe(
			'2026-11-17T00:00:00.000Z'
		);
		expect(latest([null])).toBeNull();
		expect(latest([])).toBeNull();
	});
});

describe('dateLabel', () => {
	it('shows a date in my time zone', () => {
		expect(dateLabel('2026-11-20T15:00:00.000Z')).toBe('Nov 20, 2026');
		// 2 a.m. UTC is still the evening before in Chicago.
		expect(dateLabel('2026-11-21T02:00:00.000Z')).toBe('Nov 20, 2026');
	});
});
