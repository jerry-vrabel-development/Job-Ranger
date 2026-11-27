/**
 * A real eval run for tests: the runner with a stand-in model that answers
 * every job with one score. Only imported by tests.
 */
import type { Score } from '#lib/scoring/score.ts';
import { FIXED_CASES, FIXED_PROFILE } from './fixed-set.ts';
import { published, runEval, type PublishedRun } from './run.ts';

export async function sampleRun(
	score: Score,
	options: { at?: string; withLabels?: boolean; model?: string } = {}
): Promise<PublishedRun> {
	const now = new Date(options.at ?? '2026-11-27T18:00:00.000Z');
	const run = await runEval({
		model: options.model ?? 'claude-haiku-5-5',
		ask: () =>
			Promise.resolve({
				ok: true,
				checked: { ok: true, score, word: '', summary: '', reasons: [], dropped: [], grade: 6 },
				given: 2,
				model: options.model ?? 'claude-haiku-5-5',
				usage: { inputTokens: 3000, outputTokens: 300, reasoningTokens: null },
				cost: { micros: 520, priceTable: 'test' },
				latencyMs: 1234
			}),
		fixed: FIXED_CASES,
		fixedProfile: FIXED_PROFILE,
		labels:
			options.withLabels === true
				? {
						exportedAt: now.toISOString(),
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
		capMicros: 1_000_000,
		now,
		sleep: () => Promise.resolve()
	});
	return published(run);
}
