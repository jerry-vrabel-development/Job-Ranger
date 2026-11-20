import { describe, expect, it } from 'vitest';
import {
	checkLetter,
	letterText,
	LIMITS,
	parseLetter,
	systemPrompt,
	userPrompt,
	type LetterFact,
	type LetterJob
} from './letter.ts';

const facts: LetterFact[] = [
	{
		id: 1,
		kind: 'accomplishment',
		experience: 'professional',
		organization: 'HIMSS',
		period: '2018–2020',
		text: 'Led engineering for a platform with 1M+ monthly visitors across 128 domains.'
	},
	{
		id: 2,
		kind: 'project',
		experience: 'side',
		organization: 'Quest Log',
		period: '',
		text: 'Quest Log, an ADHD-friendly task app.'
	},
	{ id: 3, kind: 'skill', experience: 'learning', organization: '', period: '', text: 'Kubernetes' }
];
const job: LetterJob = {
	title: 'Engineer',
	company: 'Zipline',
	department: null,
	postingText: 'x'.repeat(9000)
};
const s = (text: string, ids: number[] = []) => ({ text, facts: ids });

describe('prompts', () => {
	it('asks for cited facts, honest labels and the right length, and leaves greeting and name to code', () => {
		const full = systemPrompt('letter_full');
		expect(full).toMatch(/Every sentence must list, in `facts`, the ids/);
		expect(full).toMatch(/"side" are side projects or hobbies/);
		expect(full).toMatch(/Do not write a greeting or a signature/);
		expect(full).toMatch(/250 to 400 words/);
		expect(systemPrompt('letter_short')).toMatch(/under 150 words/);
	});

	it('sends the job and the facts, trimmed, and nothing about me', () => {
		const sent = JSON.parse(userPrompt(job, facts)) as {
			job: { posting: string; company: string };
			facts: { id: number; where: string; experience: string }[];
		};
		expect(sent.job.company).toBe('Zipline');
		expect(sent.job.posting).toHaveLength(8000);
		expect(sent.facts[1]).toMatchObject({ id: 2, where: 'Quest Log', experience: 'side' });
		expect(Object.keys(sent)).toEqual(['job', 'facts']);
	});
});

describe('parseLetter', () => {
	it('reads paragraphs of sentences, tidying spaces and repeated ids', () => {
		expect(
			parseLetter({ paragraphs: [[{ text: '  Hello   there. ', facts: [1, 1, 2] }]] })
		).toEqual([[{ text: 'Hello there.', facts: [1, 2] }]]);
	});

	it.each([
		null,
		'letter',
		{},
		{ paragraphs: [] },
		{ paragraphs: [[]] },
		{ paragraphs: ['text'] },
		{ paragraphs: [[null]] },
		{ paragraphs: [[{ text: ' ', facts: [] }]] },
		{ paragraphs: [[{ text: 'Hi.', facts: 'one' }]] },
		{ paragraphs: [[{ text: 'Hi.', facts: [1.5] }]] }
	])('says null for a shape it did not ask for: %j', (input) => {
		expect(parseLetter(input)).toBeNull();
	});
});

describe('checkLetter', () => {
	it('passes a letter whose every claim is backed', () => {
		const letter = [
			[s('I’m applying for the engineering role at Zipline.')],
			[
				s(
					'At HIMSS I led engineering for a platform with 1M+ monthly visitors across 128 domains.',
					[1]
				)
			],
			[
				s('In my own time I built Quest Log, an ADHD-friendly task app.', [2]),
				s('Thank you for reading.')
			]
		];
		expect(checkLetter('letter_full', letter, facts, job, ['Zipline', 'Spotify'])).toEqual([]);
	});

	it('flags each kind of problem, in words, by paragraph and sentence', () => {
		const letter = [
			[
				s('I want to join Zipline.'),
				s('I have 20 years of experience.'),
				s('I cut costs by 40% at HIMSS.', [1]),
				s('I ran 9 teams.', [99])
			],
			[
				s('I have professional experience with Kubernetes.', [3]),
				s('Spotify would be lucky to have me.', [1]),
				s('Framing two.'),
				s('Framing three.'),
				s('Framing four makes a claim.')
			]
		];
		expect(checkLetter('letter_full', letter, facts, job, ['Spotify', 'Zipline', ' '])).toEqual([
			{ paragraph: 0, sentence: 1, problem: 'Has a number but cites no fact.' },
			{ paragraph: 0, sentence: 2, problem: 'The number 40% isn’t in the facts it cites.' },
			{
				paragraph: 0,
				sentence: 3,
				problem: 'Cites a fact that isn’t one of your confirmed facts.'
			},
			{ paragraph: 0, sentence: 3, problem: 'The number 9 isn’t in the facts it cites.' },
			{
				paragraph: 1,
				sentence: 0,
				problem: 'Words a side project or something you’re learning as professional work.'
			},
			{
				paragraph: 1,
				sentence: 1,
				problem: 'Names Spotify, another company on your list, not Zipline.'
			},
			// "20 years" cited no fact either, so it counts toward the three framing sentences.
			{ paragraph: 1, sentence: 3, problem: 'Makes a claim without citing a fact.' },
			{ paragraph: 1, sentence: 4, problem: 'Makes a claim without citing a fact.' }
		]);
	});

	it('allows another company when a cited fact is about it', () => {
		const himss = [[s('At HIMSS I led engineering.', [1]), s('Now I want to help Zipline.')]];
		expect(checkLetter('letter_full', himss, facts, job, ['HIMSS'])).toEqual([]);
	});

	it('flags a letter that never names the company, or runs long', () => {
		const long = [[s(`${'word '.repeat(LIMITS.letter_short.words)}done.`, [1])]];
		expect(checkLetter('letter_short', long, facts, job, [])).toEqual([
			{ paragraph: -1, sentence: -1, problem: 'Never names Zipline.' },
			{ paragraph: -1, sentence: -1, problem: '171 words, over the 170 this length allows.' }
		]);
	});
});

describe('letterText', () => {
	it('adds the greeting and my name in code', () => {
		const letter = [[s('One.'), s('Two.')], [s('Three.')]];
		expect(letterText(letter, 'Jane Doe')).toBe(
			'Dear hiring team,\n\nOne. Two.\n\nThree.\n\nSincerely,\nJane Doe'
		);
		expect(letterText(letter, '')).toMatch(/\[Your name\]$/);
	});
});
