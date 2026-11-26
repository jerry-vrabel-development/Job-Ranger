import { describe, expect, it } from 'vitest';
import {
	checkAnswer,
	comparable,
	parseAnswer,
	POSTING_MAX,
	PROMPT_VERSION,
	SCORE_TOOL,
	systemPrompt,
	TOOL_NAME,
	userPrompt,
	type Profile,
	type ScoringJob
} from './score.ts';

const job: ScoringJob = {
	title: 'Senior Frontend Engineer',
	company: 'Example Co',
	location: 'Chicago, IL',
	workplace: 'hybrid',
	department: 'Platform',
	postingText:
		'We build accessible tools for drone pilots. You will own our Svelte front end. Required: 5+ years of TypeScript. Nice to have: experience with “real-time” maps — and D3.'
};

const profile: Profile = {
	facts: [
		{
			id: 1,
			kind: 'skill',
			experience: 'professional',
			organization: 'Acme',
			period: '2018–2024',
			text: 'TypeScript'
		},
		{
			id: 2,
			kind: 'project',
			experience: 'side',
			organization: '',
			period: '2026',
			text: 'Job Ranger, a SvelteKit app with D3 charts'
		}
	],
	interests: [{ id: 7, name: 'Drones', note: '', keywords: ['drone', 'drones'] }],
	preferences: { where: 'Remote, or hybrid in the Chicago area' }
};

// Hand-written in the model's shape (no API key yet); real recorded answers replace these in 0008 step 7.
const goodAnswer = {
	score: 4,
	summary: 'A front-end role at a drone company that uses your TypeScript and Svelte work.',
	reasons: [
		{
			direction: 'for',
			text: 'It asks for TypeScript, which you used for years.',
			cites: [{ fact: 1 }, { quote: '5+ years of TypeScript' }]
		},
		{ direction: 'for', text: 'It is a drone company.', cites: [{ interest: 7 }] },
		{ direction: 'for', text: 'It is hybrid in Chicago.', cites: [{ preference: 'where' }] },
		{ direction: 'against', text: 'Your Svelte work is a side project.', cites: [{ fact: 2 }] }
	]
};

describe('the prompt', () => {
	it('has a version, a tool and rules about citing and side work', () => {
		expect(PROMPT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
		expect(SCORE_TOOL.name).toBe(TOOL_NAME);
		const system = systemPrompt();
		expect(system).toContain('Every reason must cite');
		expect(system).toContain('"side"');
		expect(system).toContain(TOOL_NAME);
	});

	it('sends the job and confirmed profile, and nothing else', () => {
		const sent = JSON.parse(userPrompt(job, profile)) as Record<string, unknown>;
		expect(Object.keys(sent)).toEqual(['job', 'facts', 'interests', 'preferences']);
		expect(sent['job']).toMatchObject({
			title: job.title,
			team: 'Platform',
			posting: job.postingText
		});
		expect(sent['job']).not.toHaveProperty('note');
		expect(sent['facts']).toEqual([
			{
				id: 1,
				kind: 'skill',
				experience: 'professional',
				where: 'Acme',
				when: '2018–2024',
				text: 'TypeScript'
			},
			{
				id: 2,
				kind: 'project',
				experience: 'side',
				where: '',
				when: '2026',
				text: 'Job Ranger, a SvelteKit app with D3 charts'
			}
		]);
		expect(sent['preferences']).toEqual({ where: 'Remote, or hybrid in the Chicago area' });
	});

	it('cuts a long posting and says so', () => {
		const long = { ...job, postingText: 'x'.repeat(POSTING_MAX + 10) };
		const sent = JSON.parse(userPrompt(long, profile)) as {
			job: { posting: string; note: string };
		};
		expect(sent.job.posting).toHaveLength(POSTING_MAX);
		expect(sent.job.note).toBe(`The posting was cut at ${String(POSTING_MAX)} characters.`);
	});
});

describe('parseAnswer', () => {
	it('reads the shape asked for, tidying spaces', () => {
		const parsed = parseAnswer({ ...goodAnswer, summary: '  Fits   well. ' });
		expect(parsed?.summary).toBe('Fits well.');
		expect(parsed?.reasons[0]?.cites).toEqual([{ fact: 1 }, { quote: '5+ years of TypeScript' }]);
	});

	it.each([
		['not an object', 'nope'],
		['null', null],
		['a score out of range', { ...goodAnswer, score: 6 }],
		['a score that isn’t whole', { ...goodAnswer, score: 3.5 }],
		['an empty summary', { ...goodAnswer, summary: ' ' }],
		['reasons that aren’t a list', { ...goodAnswer, reasons: {} }],
		['a reason that isn’t an object', { ...goodAnswer, reasons: [null] }],
		[
			'an unknown direction',
			{ ...goodAnswer, reasons: [{ direction: 'up', text: 'x', cites: [] }] }
		],
		['an empty reason', { ...goodAnswer, reasons: [{ direction: 'for', text: '', cites: [] }] }],
		[
			'cites that aren’t a list',
			{ ...goodAnswer, reasons: [{ direction: 'for', text: 'x', cites: 'f1' }] }
		]
	])('rejects %s', (_, input) => {
		expect(parseAnswer(input)).toBeNull();
	});

	it('keeps a citation it can’t read as null, so the check can say so', () => {
		const parsed = parseAnswer({
			...goodAnswer,
			reasons: [
				{
					direction: 'for',
					text: 'x',
					cites: [
						null,
						{ fact: 1, interest: 7 },
						{ fact: 'one' },
						{ preference: 'salary' },
						{ quote: '  ' },
						{ other: 1 },
						{ fact: 1, quote: null }
					]
				}
			]
		});
		expect(parsed?.reasons[0]?.cites).toEqual([null, null, null, null, null, null, { fact: 1 }]);
	});
});

describe('comparable', () => {
	it('ignores case, spacing, curly quotes and dashes', () => {
		expect(comparable('  “Real-time”\n MAPS — ‘D3’ ')).toBe('"real-time" maps - \'d3\'');
	});
});

describe('checkAnswer', () => {
	it('keeps traced reasons, with their sources in words, and grades the reading level', () => {
		const checked = checkAnswer(goodAnswer, job, profile);
		expect(checked.ok).toBe(true);
		if (!checked.ok) return;
		expect(checked).toMatchObject({ score: 4, word: 'Good fit', dropped: [] });
		expect(checked.reasons.map((r) => r.sources)).toEqual([
			['Fact: TypeScript', 'Posting: “5+ years of TypeScript”'],
			['Interest: Drones'],
			['Preference: Remote, or hybrid in the Chicago area'],
			['Fact: Job Ranger, a SvelteKit app with D3 charts']
		]);
		expect(checked.grade).toBeGreaterThan(0);
		expect(checked.grade).toBeLessThan(12);
	});

	it('matches a quote despite curly quotes, dashes and case', () => {
		const answer = {
			...goodAnswer,
			reasons: [
				{
					direction: 'against',
					text: 'Maps are only nice to have.',
					cites: [{ quote: '"REAL-TIME" maps - and D3' }]
				}
			]
		};
		const checked = checkAnswer(answer, job, profile);
		expect(checked.ok && checked.reasons[0]?.sources).toEqual([
			'Posting: “"REAL-TIME" maps - and D3”'
		]);
	});

	it('drops citations it can’t trace, and a reason with none left', () => {
		const answer = {
			...goodAnswer,
			reasons: [
				{
					direction: 'for',
					text: 'Mixed.',
					cites: [{ fact: 1 }, { fact: 99 }, { interest: 8 }, { preference: 'pay' }, { other: 1 }]
				},
				{ direction: 'for', text: 'Made up.', cites: [{ quote: 'ten years of Rust' }] },
				{ direction: 'for', text: 'Too short.', cites: [{ quote: 'TypeScript' }] },
				{ direction: 'for', text: 'Nothing cited.', cites: [] }
			]
		};
		const checked = checkAnswer(answer, job, profile);
		expect(checked.ok).toBe(true);
		expect(checked.ok && checked.reasons.map((r) => r.text)).toEqual(['Mixed.']);
		expect(checked.dropped).toEqual([
			{ reason: 0, why: 'Cited fact 99, which isn’t a confirmed fact.' },
			{ reason: 0, why: 'Cited interest 8, which doesn’t exist.' },
			{ reason: 0, why: 'Cited the preference “pay”, which isn’t set.' },
			{ reason: 0, why: 'A citation wasn’t a fact, an interest, a preference or a quote.' },
			{ reason: 1, why: 'Quoted “ten years of Rust”, which isn’t in the posting.' },
			{ reason: 1, why: 'No citation could be checked, so the reason was dropped.' },
			{ reason: 2, why: 'Quoted “TypeScript”, which is under two words.' },
			{ reason: 2, why: 'No citation could be checked, so the reason was dropped.' },
			{ reason: 3, why: 'No citation could be checked, so the reason was dropped.' }
		]);
	});

	it('only accepts quotes from the part of the posting the model saw', () => {
		const long = { ...job, postingText: `${'x '.repeat(POSTING_MAX / 2)}late words here` };
		const answer = {
			...goodAnswer,
			reasons: [{ direction: 'for', text: 'x', cites: [{ quote: 'late words here' }] }]
		};
		expect(checkAnswer(answer, long, profile)).toMatchObject({ ok: false });
	});

	it('shortens a long quote in its message', () => {
		const quote = `${'word '.repeat(30)}end`;
		const answer = {
			...goodAnswer,
			reasons: [{ direction: 'for', text: 'x', cites: [{ quote }] }]
		};
		const checked = checkAnswer(answer, job, profile);
		expect(checked.dropped[0]?.why).toMatch(
			/^Quoted “(word ){15}wo…”, which isn’t in the posting\.$/
		);
	});

	it('leaves a job unscored when no reason can be traced, or the shape is wrong', () => {
		const untraced = {
			...goodAnswer,
			reasons: [{ direction: 'for', text: 'x', cites: [{ fact: 99 }] }]
		};
		expect(checkAnswer(untraced, job, profile)).toEqual({
			ok: false,
			why: 'None of the model’s reasons could be traced, so it isn’t scored.',
			dropped: [
				{ reason: 0, why: 'Cited fact 99, which isn’t a confirmed fact.' },
				{ reason: 0, why: 'No citation could be checked, so the reason was dropped.' }
			]
		});
		expect(checkAnswer({ score: 9 }, job, profile)).toEqual({
			ok: false,
			why: 'The model’s answer wasn’t in the shape asked for.',
			dropped: []
		});
	});

	it('gives every score its word', () => {
		const words = [1, 2, 3, 4, 5].map((score) => {
			const checked = checkAnswer({ ...goodAnswer, score }, job, profile);
			return checked.ok ? checked.word : '';
		});
		expect(words).toEqual(['Not a fit', 'Weak fit', 'Maybe', 'Good fit', 'Strong fit']);
	});
});
