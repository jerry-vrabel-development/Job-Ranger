import { describe, expect, it } from 'vitest';
import type { Asked } from '#lib/scoring/ask.ts';
import type { Checked, ScoringJob } from '#lib/scoring/score.ts';
import { FIXED_CASES, FIXED_PROFILE, type FixedCase } from './fixed-set.ts';
import type { LabelFile } from './labels.ts';
import {
	plannedCalls,
	published,
	RETRY_WAIT_MAX_MS,
	runEval,
	type Ask,
	type RunOptions
} from './run.ts';

const NOW = new Date('2026-11-27T18:00:00.000Z');

type Usable = Extract<Checked, { ok: true }>;

const ok = (score: Usable['score'], more: Partial<Usable> = {}): Checked => ({
	ok: true,
	score,
	word: 'word',
	summary: `Scored ${String(score)}.`,
	reasons: [],
	dropped: [],
	grade: 6,
	...more
});

const answer = (checked: Checked, given = 2, micros = 500): Asked => ({
	ok: true,
	checked,
	given,
	model: 'claude-haiku-5-5',
	usage: { inputTokens: 3000, outputTokens: 300, reasoningTokens: null },
	cost: { micros, priceTable: 'test' },
	latencyMs: 1000
});

const failure = (retryAfterMs: number | null = null, retry = true): Asked => ({
	ok: false,
	message: retry ? 'Rate limited.' : 'Key refused.',
	retry,
	retryAfterMs
});

/** Answers each job by its title, so the order of calls doesn't matter to the test. */
function askBy(scores: Record<string, Asked | Asked[]>): { ask: Ask; asked: string[] } {
	const asked: string[] = [];
	const queues = new Map(
		Object.entries(scores).map(([title, value]) => [
			title,
			Array.isArray(value) ? [...value] : value
		])
	);
	const ask: Ask = (job: ScoringJob) => {
		asked.push(job.title);
		const entry = queues.get(job.title);
		if (entry === undefined) throw new Error(`no answer for ${job.title}`);
		const next = Array.isArray(entry) ? entry.shift() : entry;
		if (next === undefined) throw new Error(`no more answers for ${job.title}`);
		return Promise.resolve(next);
	};
	return { ask, asked };
}

const posting = (title: string, words: string): ScoringJob => ({
	title,
	company: 'Example',
	location: 'Remote',
	workplace: 'remote',
	department: null,
	postingText: words
});

const CASES: readonly FixedCase[] = [
	{
		id: 'fit',
		kind: 'fit',
		name: 'a fit',
		expected: { min: 4, max: 5 },
		job: posting('Fit', 'TypeScript and Svelte.')
	},
	{
		id: 'miss',
		kind: 'miss',
		name: 'a miss',
		expected: { min: 1, max: 2 },
		job: posting('Miss', 'Embedded C.')
	}
];

const LABELS: LabelFile = {
	exportedAt: NOW.toISOString(),
	profile: FIXED_PROFILE,
	labels: [
		{ key: 'ashby:x:1', wanted: true, job: posting('Wanted', 'TypeScript, Svelte, WCAG.') },
		{ key: 'ashby:x:2', wanted: false, job: posting('Passed', 'Sales quota.') }
	],
	skipped: { noText: 1, unclear: 0 }
};

function options(ask: Ask, more: Partial<RunOptions> = {}): RunOptions & { waits: number[] } {
	const waits: number[] = [];
	return {
		model: 'claude-haiku-5-5',
		ask,
		fixed: CASES,
		fixedProfile: FIXED_PROFILE,
		labels: LABELS,
		repeat: 2,
		capMicros: 1_000_000,
		now: NOW,
		sleep: (ms) => {
			waits.push(ms);
			return Promise.resolve();
		},
		...more,
		waits
	};
}

describe('runEval', () => {
	it('scores the fixed set, then the labels, then the fixed set again, and measures both scorers', async () => {
		const { ask, asked } = askBy({
			Fit: [answer(ok(5)), answer(ok(3))],
			Miss: [answer(ok(1)), answer(ok(1))],
			Wanted: answer(ok(4)),
			Passed: answer(ok(2))
		});
		const progress: string[] = [];
		const run = await runEval(
			options(ask, {
				onCall: (made, planned) => progress.push(`${String(made)}/${String(planned)}`)
			})
		);

		expect(asked).toEqual(['Fit', 'Miss', 'Wanted', 'Passed', 'Fit', 'Miss']);
		expect(plannedCalls(2, 2, 2)).toBe(run.planned);
		expect(plannedCalls(13, 40, 0)).toBe(53);
		expect(progress.at(-1)).toBe('6/6');
		expect(run).toMatchObject({
			model: 'claude-haiku-5-5',
			at: NOW.toISOString(),
			planned: 6,
			made: 6,
			spentMicros: 3000,
			stopped: null
		});
		expect(run.fixed.model.map((r) => [r.id, r.score, r.pass])).toEqual([
			['fit', 5, true],
			['miss', 1, true]
		]);
		expect(run.fixed.baseline.map((r) => r.id)).toEqual(['fit', 'miss']);
		expect(run.labels).toMatchObject({
			scored: 2,
			wanted: 1,
			exported: 2,
			skipped: { noText: 1, unclear: 0 }
		});
		expect(run.labels?.model.recall[10]).toEqual({ share: 1, of: 1 });
		expect(run.labels?.model.separation.gap).toBe(2);
		expect(run.quality.unstable).toEqual({ share: 0.5, of: 2 });
		expect(run.quality.costs.microsPerJob).toEqual({ mean: 500, of: 6 });
		expect(run.calls[2]).toMatchObject({
			set: 'labels',
			key: 'ashby:x:1',
			pass: 1,
			summary: 'Scored 4.',
			notes: []
		});
	});

	it('records an answer it couldn’t use, with why, and counts each flagged reason once', async () => {
		const unusable: Checked = {
			ok: false,
			why: 'No reason was left.',
			dropped: [
				{ reason: 0, why: 'Quoted words not in the posting.' },
				{ reason: 0, why: 'Cited fact 99.' }
			]
		};
		const kept = ok(4, { dropped: [{ reason: 1, why: 'Cited interest 9.' }] });
		const { ask } = askBy({ Fit: answer(unusable, 1), Miss: answer(kept, 3) });
		const run = await runEval(options(ask, { labels: null, repeat: 1 }));

		expect(run.labels).toBeNull();
		expect(run.calls[0]).toMatchObject({
			summary: '',
			notes: ['No reason was left.', 'Quoted words not in the posting.', 'Cited fact 99.'],
			trial: { score: null, reasons: 1, flagged: 1, grade: null }
		});
		expect(run.calls[1]?.notes).toEqual(['Cited interest 9.']);
		expect(run.quality.faithfulness).toEqual({ share: 0.5, of: 4 });
		expect(run.quality.unusable).toEqual({ share: 0.5, of: 2 });
		expect(run.fixed.model[0]).toMatchObject({ score: null, pass: false });
	});

	it('retries a failed call once, waiting as asked but never long', async () => {
		const { ask } = askBy({
			Fit: [failure(5_000), answer(ok(5))],
			Miss: [failure(10 * 60_000), answer(ok(1))]
		});
		const opts = options(ask, { labels: null, repeat: 1 });
		const run = await runEval(opts);
		expect(opts.waits).toEqual([5_000, RETRY_WAIT_MAX_MS]);
		expect(run.stopped).toBeNull();
		expect(run.made).toBe(2);
	});

	it('waits two seconds when the API gives no Retry-After, and stops if it fails again', async () => {
		const { ask } = askBy({ Fit: answer(ok(5)), Miss: [failure(), failure()] });
		const opts = options(ask, { repeat: 1 });
		const run = await runEval(opts);
		expect(opts.waits).toEqual([2_000]);
		expect(run.stopped).toBe('A call failed twice, after 1 of 4 calls: Rate limited.');
		expect(run.made).toBe(1);
		expect(run.labels).toMatchObject({ scored: 0, exported: 2 });
		expect(run.fixed.model[1]).toMatchObject({ score: null, pass: false });
	});

	it('stops at once on a failure retrying won’t fix, like a refused key', async () => {
		const { ask, asked } = askBy({ Fit: failure(null, false) });
		const opts = options(ask, { labels: null });
		const run = await runEval(opts);
		expect(asked).toEqual(['Fit']);
		expect(opts.waits).toEqual([]);
		expect(run.stopped).toBe(
			'A call failed and isn’t worth retrying, after 0 of 4 calls: Key refused.'
		);
	});

	it('stops at the spending cap, before the call that would go over', async () => {
		const { ask, asked } = askBy({ Fit: answer(ok(5), 2, 600), Miss: answer(ok(1), 2, 600) });
		const run = await runEval(options(ask, { capMicros: 1_000, labels: null }));
		expect(asked).toEqual(['Fit', 'Miss']);
		expect(run.stopped).toBe('It reached the spending cap after 2 of 4 calls.');
		expect(run.spentMicros).toBe(1_200);
	});

	it('scores the fixed set at least once, whatever repeat says', async () => {
		const { asked, ask } = askBy({ Fit: answer(ok(5)), Miss: answer(ok(1)) });
		const run = await runEval(options(ask, { repeat: 0, labels: null }));
		expect(asked).toEqual(['Fit', 'Miss']);
		expect(run.quality.unstable).toEqual({ share: null, of: 0 });
	});

	it('runs the real fixed set against its own profile', async () => {
		const ask: Ask = () => Promise.resolve(answer(ok(3)));
		const run = await runEval(options(ask, { fixed: FIXED_CASES, labels: null, repeat: 1 }));
		expect(run.fixed.model).toHaveLength(FIXED_CASES.length);
		expect(run.fixed.baseline.filter((r) => r.pass)).toHaveLength(7);
	});
});

describe('published', () => {
	it('keeps the numbers and leaves out every call', async () => {
		const { ask } = askBy({
			Fit: answer(ok(5)),
			Miss: answer(ok(1)),
			Wanted: answer(ok(4)),
			Passed: answer(ok(2))
		});
		const run = await runEval(options(ask, { repeat: 1 }));
		const out = published(run);
		expect(out).not.toHaveProperty('calls');
		expect(JSON.stringify(out)).not.toContain('ashby:x:1');
		expect(Object.keys(out).sort()).toEqual(
			[
				'at',
				'fixed',
				'labels',
				'made',
				'model',
				'planned',
				'promptVersion',
				'quality',
				'spentMicros',
				'stopped'
			].sort()
		);
	});
});
