import { describe, expect, it } from 'vitest';
import { readRun, readRuns } from './published.ts';
import { sampleRun } from './testing.ts';

type Data = Record<string, unknown>;

/** A deep copy with one change, so each test breaks exactly one thing. */
async function broken(change: (data: Data) => void, withLabels = true): Promise<unknown> {
	const data = JSON.parse(JSON.stringify(await sampleRun(4, { withLabels }))) as Data;
	change(data);
	return data;
}

const at = (data: Data, path: string): Data =>
	path.split('.').reduce<Data>((value, key) => value[key] as Data, data);

describe('readRun', () => {
	it('reads a finished run, with labels or without', async () => {
		const run = await sampleRun(4, { withLabels: true });
		expect(readRun(JSON.parse(JSON.stringify(run)))).toEqual(run);
		const fixedOnly = await sampleRun(4);
		expect(readRun(JSON.parse(JSON.stringify(fixedOnly)))).toEqual(fixedOnly);
	});

	it('skips anything that isn’t a finished run in the right shape', async () => {
		const cases: [string, (data: Data) => void][] = [
			['stopped early', (d) => (d['stopped'] = 'It reached the cap.')],
			['no model', (d) => delete d['model']],
			['a date that isn’t one', (d) => (d['at'] = 'yesterday')],
			['a negative count', (d) => (d['made'] = -1)],
			['a fraction of a call', (d) => (d['planned'] = 1.5)],
			['no fixed results', (d) => (d['fixed'] = [])],
			['a case of an unknown kind', (d) => (at(d, 'fixed.model.0')['kind'] = 'maybe')],
			['a case with a word for a score', (d) => (at(d, 'fixed.baseline.0')['score'] = 'four')],
			['a case with no pass', (d) => delete at(d, 'fixed.model.1')['pass']],
			['labels as a list', (d) => (d['labels'] = [])],
			['labels with no skipped counts', (d) => delete at(d, 'labels')['skipped']],
			['labels with a missing count', (d) => delete at(d, 'labels.skipped')['unclear']],
			['a ranking with no recall', (d) => delete at(d, 'labels.model')['recall']],
			['a ranking with no separation', (d) => delete at(d, 'labels.baseline')['separation']],
			['a ranking that’s a word', (d) => (at(d, 'labels')['model'] = 'good')],
			['a share that’s infinite', (d) => (at(d, 'labels.model.ndcg')['share'] = Infinity)],
			['a mean with no count', (d) => delete at(d, 'labels.model.separation.wanted')['of']],
			['no quality', (d) => delete d['quality']],
			['quality with no costs', (d) => delete at(d, 'quality')['costs']],
			['a cost with no count', (d) => delete at(d, 'quality.costs.msPerJob')['of']]
		];
		for (const [what, change] of cases) {
			expect(readRun(await broken(change)), what).toBeNull();
		}
		expect(readRun(null)).toBeNull();
		expect(readRun([])).toBeNull();
	});
});

describe('readRuns', () => {
	it('lists the readable runs newest first and counts the rest', async () => {
		const older = await sampleRun(3, { at: '2026-11-20T12:00:00.000Z' });
		const newer = await sampleRun(5, {
			at: '2026-11-27T12:00:00.000Z',
			model: 'claude-sonnet-5-5'
		});
		const files = {
			'/evals/results/a.json': JSON.parse(JSON.stringify(older)) as unknown,
			'/evals/results/b.json': JSON.parse(JSON.stringify(newer)) as unknown,
			'/evals/results/c.json': { not: 'a run' }
		};
		const { runs, skipped } = readRuns(files);
		expect(runs.map((run) => run.model)).toEqual(['claude-sonnet-5-5', 'claude-haiku-5-5']);
		expect(skipped).toBe(1);
		expect(readRuns({})).toEqual({ runs: [], skipped: 0 });
	});
});
