import { describe, expect, it } from 'vitest';
import { review, reviewed, type ReviewContext } from './review.ts';

const context: ReviewContext = {
	company: 'Zipline',
	title: 'Senior Engineer, Flight Software',
	otherCompanies: ['Zipline', 'Spotify', 'Nava PBC', ' '],
	otherTitles: ['Engineer', 'Staff Engineer, Payments', 'senior engineer, flight software'],
	facts: [
		'Led engineering for a platform with 1M+ monthly visitors across 128 domains. 2018–2020',
		'Cut page load time by 50%.'
	],
	maxWords: 20,
	maxChars: 200,
	needsCompany: false,
	elsewhere: []
};

describe('review', () => {
	it('finds nothing in text that fits this job and my facts', () => {
		expect(
			review('At HIMSS I led a platform across 128 domains, from 2018 to 2020.', context)
		).toEqual([]);
	});

	it('catches another company, quoting the line, once per company', () => {
		expect(review('I love Zipline. I want to join Spotify. Spotify is great.', context)).toEqual([
			{ label: 'Wrong company', detail: 'Names Spotify, not Zipline: “I want to join Spotify.”' }
		]);
		// Part of a word isn't the name.
		expect(review('Nava PBCs and Spotifyish things.', context)).toEqual([]);
	});

	it('quotes the whole text when a name with a period spans two sentences', () => {
		// "St. Jude Labs" splits after "St.", so no one sentence holds the name.
		const withPeriod = { ...context, otherCompanies: ['St. Jude Labs'] };
		expect(review('I admire St. Jude Labs. Their work matters.', withPeriod)).toEqual([
			{
				label: 'Wrong company',
				detail: 'Names St. Jude Labs, not Zipline: “I admire St. Jude Labs. Their work matters.”'
			}
		]);
	});

	it('asks for the company when the question is why them', () => {
		expect(review('I like drones.', { ...context, needsCompany: true })).toEqual([
			{ label: 'Missing company', detail: 'Never names Zipline, and the question asks why them.' }
		]);
		expect(review('I like Zipline’s drones.', { ...context, needsCompany: true })).toEqual([]);
	});

	it('catches another job’s title, but not one-word titles or this job’s own', () => {
		expect(
			review(
				'As a Staff Engineer, Payments I would… as an Engineer, Senior Engineer, Flight Software.',
				context
			)
		).toEqual([
			{
				label: 'Wrong role',
				detail:
					'Names “Staff Engineer, Payments”, another job’s title, not “Senior Engineer, Flight Software”.'
			}
		]);
	});

	it('says when it’s too long, by words first, then characters', () => {
		expect(review('word '.repeat(21), context)).toEqual([
			{ label: 'Too long', detail: '21 words; keep it to 20.' }
		]);
		expect(review('x'.repeat(201), context)).toEqual([
			{ label: 'Too long', detail: '201 characters; keep it under 200.' }
		]);
	});

	it('flags numbers that aren’t in any confirmed fact, once each', () => {
		expect(
			review('Cut load time by 50%. Grew it to 40 stores, then 40 more, 1,200 in all.', context)
		).toEqual([
			{
				label: 'Not in your facts',
				detail:
					'The number 40 isn’t in any confirmed fact: “Grew it to 40 stores, then 40 more, 1,200 in all.”'
			},
			{
				label: 'Not in your facts',
				detail:
					'The number 1,200 isn’t in any confirmed fact: “Grew it to 40 stores, then 40 more, 1,200 in all.”'
			}
		]);
		const long = `${'A very long sentence. '.repeat(1)}${'Then a 7 '.padEnd(130, 'x')}.`;
		expect(review(long, context)[0]?.detail).toMatch(/…”$/);
	});

	it('treats every number as unbacked when no fact has one', () => {
		expect(review('Ran 3 teams.', { ...context, facts: ['Led teams.'] })).toEqual([
			{
				label: 'Not in your facts',
				detail: 'The number 3 isn’t in any confirmed fact: “Ran 3 teams.”'
			}
		]);
	});

	it('says when another job got the same text, word for word', () => {
		const elsewhere = [
			{ where: 'Other job at Nava PBC', text: 'Something else.' },
			{ where: 'Staff Engineer at Acme', text: '  Builds   accessible apps. ' },
			{ where: 'Third at Acme', text: 'Builds accessible apps.' }
		];
		expect(review('Builds accessible apps.', { ...context, elsewhere })).toEqual([
			{
				label: 'Same as another application',
				detail: 'Word for word what Staff Engineer at Acme got. Tailor a line to Zipline.'
			}
		]);
		expect(review('', { ...context, elsewhere: [{ where: 'x', text: '' }] })).toEqual([]);
	});

	it('says how a review went, in words', () => {
		expect(reviewed([])).toMatch(/^Reviewed: nothing to fix/);
		expect(reviewed([{ label: 'Too long', detail: '' }])).toBe(
			'Reviewed: 1 thing to look at. Nothing was changed.'
		);
		expect(
			reviewed([
				{ label: 'Too long', detail: '' },
				{ label: 'Wrong role', detail: '' }
			])
		).toBe('Reviewed: 2 things to look at. Nothing was changed.');
	});
});
