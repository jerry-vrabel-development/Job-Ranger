import { describe, expect, it } from 'vitest';
import { baselineScore } from './baseline.ts';
import type { Profile, ScoringJob } from './score.ts';

const skill = (id: number, text: string) =>
	({ id, kind: 'skill', experience: 'professional', organization: '', period: '', text }) as const;

const profile: Profile = {
	facts: [
		skill(1, 'TypeScript'),
		skill(2, 'Svelte'),
		skill(3, 'D3'),
		skill(4, 'C++'),
		skill(5, '  '),
		{
			id: 6,
			kind: 'role',
			experience: 'professional',
			organization: 'Acme',
			period: '',
			text: 'Svelte developer at Acme'
		}
	],
	interests: [
		{ id: 1, name: 'Drones', note: '', keywords: ['drone', 'drones'] },
		{ id: 2, name: 'Music', note: '', keywords: ['music', 'TypeScript'] }
	],
	preferences: {}
};

const job = (title: string, postingText: string, department: string | null = null): ScoringJob => ({
	title,
	company: 'Example',
	location: 'Remote',
	workplace: 'remote',
	department,
	postingText
});

describe('baselineScore', () => {
	it('counts skills and interest keywords as whole words, each once', () => {
		expect(
			baselineScore(job('Svelte Engineer', 'TypeScript, D3 and drones. TypeScript again.'), profile)
		).toEqual({
			score: 4,
			matched: ['typescript', 'svelte', 'd3', 'drones']
		});
	});

	it('treats a sentence-ending period as a break, but keeps .NET whole', () => {
		const withNet: Profile = { ...profile, facts: [skill(9, '.NET')] };
		expect(baselineScore(job('x', 'We use .NET.'), withNet).matched).toEqual(['.net']);
	});

	it('reads the team too, and keeps symbols like C++', () => {
		expect(baselineScore(job('Engineer', 'C++ work', 'Drone team'), profile).matched).toEqual([
			'c++',
			'drone'
		]);
	});

	it('doesn’t match part of a word, or a role fact', () => {
		expect(baselineScore(job('Musician', 'Svelteish D3x, Acme'), profile)).toEqual({
			score: 1,
			matched: []
		});
	});

	it('steps up with more matches', () => {
		const scores = [
			'nothing',
			'typescript',
			'typescript svelte',
			'typescript svelte d3 c++',
			'typescript svelte d3 c++ drone music'
		].map((text) => baselineScore(job('x', text), profile).score);
		expect(scores).toEqual([1, 2, 3, 4, 5]);
	});
});
