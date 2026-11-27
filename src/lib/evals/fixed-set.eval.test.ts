/**
 * The fixed set itself, and the keyword baseline run against it (design
 * note 0008). The baseline needs no key, so its results are pinned here:
 * they're what the model has to beat. A change to the baseline, the set or
 * the profile that moves them shows up as a failing test, said in the PR.
 */
import { describe, expect, it } from 'vitest';
import { baselineScore } from '#lib/scoring/baseline.ts';
import { checkAnswer, POSTING_MAX } from '#lib/scoring/score.ts';
import { checkFixedSet, FIXED_CASES, FIXED_PROFILE, inRange } from './fixed-set.ts';

describe('the fixed set', () => {
	it('has unique ids, every kind, and ranges inside 1–5', () => {
		expect(new Set(FIXED_CASES.map((c) => c.id)).size).toBe(FIXED_CASES.length);
		expect(new Set(FIXED_CASES.map((c) => c.kind))).toEqual(new Set(['fit', 'miss', 'trap']));
		for (const { expected } of FIXED_CASES) {
			expect(expected.min).toBeGreaterThanOrEqual(1);
			expect(expected.max).toBeLessThanOrEqual(5);
			expect(expected.min).toBeLessThanOrEqual(expected.max);
		}
	});

	it('fits whole in what the model sees', () => {
		for (const { job } of FIXED_CASES) expect(job.postingText.length).toBeLessThan(POSTING_MAX);
	});

	it('takes citations of its own facts, interests, preferences and words', () => {
		const forms = FIXED_CASES.find((c) => c.id === 'fit-civic-forms');
		if (forms === undefined) throw new Error('no forms case');
		const checked = checkAnswer(
			{
				score: 5,
				summary: 'A good fit.',
				reasons: [
					{ direction: 'for', text: 'Svelte.', cites: [{ fact: 3 }] },
					{ direction: 'for', text: 'Civic tech.', cites: [{ interest: 1 }] },
					{ direction: 'for', text: 'Remote.', cites: [{ preference: 'where' }] },
					{
						direction: 'for',
						text: 'Forms.',
						cites: [{ quote: 'build accessible forms in TypeScript' }]
					}
				]
			},
			forms.job,
			FIXED_PROFILE
		);
		expect(checked).toMatchObject({ ok: true, dropped: [] });
	});

	it('passes a scorer that gives each case what a careful reader would', () => {
		const careful = new Map(FIXED_CASES.map((c) => [c.id, c.expected.min]));
		expect(checkFixedSet(careful).every((result) => result.pass)).toBe(true);
	});

	it('fails a case with no usable answer, or none at all', () => {
		const results = checkFixedSet(new Map([['fit-civic-forms', null]]));
		expect(results[0]).toEqual({ id: 'fit-civic-forms', kind: 'fit', score: null, pass: false });
		expect(results.some((result) => result.pass)).toBe(false);
		expect(inRange(3, { min: 1, max: 3 })).toBe(true);
		expect(inRange(4, { min: 1, max: 3 })).toBe(false);
	});
});

describe('the keyword baseline on the fixed set', () => {
	const results = checkFixedSet(
		new Map(FIXED_CASES.map((c) => [c.id, baselineScore(c.job, FIXED_PROFILE).score]))
	);
	const scoreOf = Object.fromEntries(results.map((r) => [r.id, r.score]));

	it('passes 7 of 13: every miss, and the plainest fits', () => {
		expect(results.filter((r) => r.pass).map((r) => r.id)).toEqual([
			'fit-civic-forms',
			'fit-accessibility',
			'miss-firmware',
			'miss-sales',
			'miss-research',
			'trap-title',
			'trap-empty'
		]);
	});

	it('falls for the traps a reader wouldn’t: words matched, meaning missed', () => {
		expect(scoreOf).toMatchObject({
			// Grants work at a civic tech nonprofit: the interests match, the job doesn't.
			'trap-dream-employer': 4,
			// Every skill of mine, all under "Nice to have".
			'trap-nice-to-have': 5,
			// The right skills, on site with no remote.
			'trap-on-site': 4,
			// The right stack, managing 40 engineers.
			'trap-manager': 4,
			// The right work in other words: no keyword to match.
			'trap-plain-words': 1,
			// "SvelteKit" isn't the whole word "Svelte".
			'fit-edge-app': 3
		});
	});
});
