import { describe, expect, it } from 'vitest';
import type { Checked } from '#lib/scoring/score.ts';
import { FIXED_CASES, FIXED_PROFILE } from './fixed-set.ts';
import { reportMarkdown } from './report.ts';
import { published, runEval, type Ask } from './run.ts';

const NOW = new Date('2026-11-27T18:00:00.000Z');

const scored = (score: 1 | 2 | 3 | 4 | 5): Checked => ({
	ok: true,
	score,
	word: '',
	summary: '',
	reasons: [],
	dropped: [],
	grade: 6
});

function ask(score: 1 | 2 | 3 | 4 | 5): Ask {
	return () =>
		Promise.resolve({
			ok: true,
			checked: scored(score),
			given: 2,
			model: 'claude-haiku-5-5',
			usage: { inputTokens: 3000, outputTokens: 300, reasoningTokens: null },
			cost: { micros: 520, priceTable: 'test' },
			latencyMs: 1234
		});
}

const run = (score: 1 | 2 | 3 | 4 | 5, withLabels: boolean, capMicros = 1_000_000) =>
	runEval({
		model: 'claude-haiku-5-5',
		ask: ask(score),
		fixed: FIXED_CASES,
		fixedProfile: FIXED_PROFILE,
		labels: withLabels
			? {
					exportedAt: NOW.toISOString(),
					profile: FIXED_PROFILE,
					labels: FIXED_CASES.slice(0, 4).map((c) => ({
						key: c.id,
						wanted: c.kind === 'fit',
						job: c.job
					})),
					skipped: { noText: 2, unclear: 1 }
				}
			: null,
		repeat: 1,
		capMicros,
		now: NOW,
		sleep: () => Promise.resolve()
	});

describe('reportMarkdown', () => {
	it('compares the model with the baseline on the fixed set and the labels, in words and counts', async () => {
		const report = reportMarkdown(published(await run(3, true)), FIXED_CASES);
		expect(report).toContain('# Eval run: claude-haiku-5-5, prompt ');
		expect(report).toContain('2026-11-27. 17 of 17 calls made, $0.01 spent.');
		expect(report).toContain('| All cases | 5 of 13 | 7 of 13 |');
		expect(report).toContain(
			'| fit-civic-forms | civic forms in my stack | 4–5 | 3, miss | 5, pass |'
		);
		expect(report).toContain(
			'4 of 4 labelled jobs scored, 3 of them wanted. Left out at export: 2 with no posting text, 1 withdrawn applications.'
		);
		expect(report).toContain('| Wanted jobs in the top 10 | 100% (of 3) | 100% (of 3) |');
		expect(report).toContain('| Average score, not wanted | 3.0 (of 1) | 1.0 (of 1) |');
		expect(report).toContain('| Gap (wanted minus not) | 0.0 | 3.0 |');
		expect(report).toContain('| Reasons with a citation code dropped | 0% (of 34) | near 0 |');
		expect(report).toContain('| Cost per call | $0.0005 |  |');
		expect(report).toContain('| Time per call | 1.2 s |  |');
		expect(report).not.toContain('Stopped early');
	});

	it('says when there were no labels, nothing to measure, or the run stopped', async () => {
		const stopped = published(await run(4, false, 0));
		const report = reportMarkdown(stopped, FIXED_CASES);
		expect(report).toContain('**Stopped early.** It reached the spending cap after 0 of 13 calls.');
		expect(report).toContain('Not run: no labels were exported.');
		expect(report).toContain(
			'| fit-civic-forms | civic forms in my stack | 4–5 | no answer, miss | 5, pass |'
		);
		expect(report).toContain('| Reasons with a citation code dropped | — (none) | near 0 |');
		expect(report).toContain('| Cost per call | — |  |');
		expect(report).toContain('| Time per call | — |  |');
	});

	it('shows a gap or NDCG it can’t work out as a dash, and a case missing from the run as no answer', async () => {
		const result = published(await run(5, true));
		const noWanted = {
			...result,
			labels: result.labels && {
				...result.labels,
				model: {
					...result.labels.model,
					ndcg: { share: null, of: 0 },
					separation: { ...result.labels.model.separation, gap: null }
				},
				baseline: {
					...result.labels.baseline,
					separation: {
						...result.labels.baseline.separation,
						notWanted: { mean: null, of: 0 },
						gap: null
					}
				}
			}
		};
		const [first] = FIXED_CASES;
		if (first === undefined) throw new Error('no cases');
		const extra = { ...first, id: 'not-in-the-run' };
		const report = reportMarkdown(noWanted, [...FIXED_CASES, extra]);
		expect(report).toContain('| NDCG (1 is perfect order) | — (none) |');
		expect(report).toContain('| Gap (wanted minus not) | — | — |');
		expect(report).toMatch(/\| Average score, not wanted \| [^|]+ \| — \(none\) \|/);
		expect(report).toContain(
			'| not-in-the-run | civic forms in my stack | 4–5 | no answer, miss | no answer, miss |'
		);
	});
});
