import { describe, expect, it } from 'vitest';
import { fitView, STALE_NOTE, type FitContext, type LatestScore } from './view.ts';

const context: FitContext = {
	promptVersion: 'v1',
	profileVersion: 'p1',
	hasText: true,
	scoringOff: null
};

const scored: LatestScore = {
	ok: true,
	score: 4,
	summary: 'It fits your TypeScript work.',
	reasons: [
		{
			direction: 'for',
			text: 'It asks for TypeScript.',
			cites: [{ fact: 1 }],
			sources: ['Fact: TypeScript']
		},
		{
			direction: 'against',
			text: 'It is on site.',
			cites: [{ preference: 'where' }],
			sources: ['Preference: Remote']
		}
	],
	why: '',
	promptVersion: 'v1',
	profileVersion: 'p1'
};

describe('fitView', () => {
	it('shows a score as a number and word, with its reasons for and against in words', () => {
		expect(fitView(scored, context)).toEqual({
			kind: 'scored',
			label: '4 · Good fit',
			score: 4,
			summary: 'It fits your TypeScript work.',
			reasons: [
				{ direction: 'For', text: 'It asks for TypeScript.', sources: ['Fact: TypeScript'] },
				{ direction: 'Against', text: 'It is on site.', sources: ['Preference: Remote'] }
			],
			stale: false
		});
	});

	it('marks a score from an older prompt or profile, and still shows it', () => {
		expect(fitView({ ...scored, profileVersion: 'p0' }, context)).toMatchObject({
			kind: 'scored',
			stale: true
		});
		expect(fitView({ ...scored, promptVersion: 'v0' }, context)).toMatchObject({ stale: true });
		expect(STALE_NOTE).toContain('scored again');
	});

	it('says why a job has no score', () => {
		const unused: LatestScore = {
			...scored,
			ok: false,
			score: null,
			why: 'The model declined to score this job.'
		};
		expect(fitView(unused, context)).toEqual({
			kind: 'unscored',
			why: 'Not scored: The model declined to score this job.',
			canScore: true
		});
		expect(fitView(undefined, { ...context, hasText: false })).toEqual({
			kind: 'unscored',
			why: 'Not scored: the board sent no posting text to read.',
			canScore: false
		});
		expect(
			fitView(undefined, {
				...context,
				scoringOff: 'Scoring isn’t set up yet: the Worker has no API key.'
			})
		).toEqual({
			kind: 'unscored',
			why: 'Not scored yet. Scoring isn’t set up yet: the Worker has no API key.',
			canScore: false
		});
		expect(fitView(undefined, context)).toEqual({
			kind: 'unscored',
			why: 'Not scored yet: it’s waiting for the next daily run.',
			canScore: true
		});
		// An unusable answer from an older profile waits to be tried again.
		expect(fitView({ ...unused, profileVersion: 'p0' }, context)).toMatchObject({
			why: 'Not scored yet: it’s waiting for the next daily run.'
		});
	});
});
