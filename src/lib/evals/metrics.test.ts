import { describe, expect, it } from 'vitest';
import {
	costs,
	faithfulness,
	hardToRead,
	ndcg,
	ranking,
	recallAt,
	separation,
	unstable,
	unusable,
	type Ranked,
	type Trial
} from './metrics.ts';

const job = (key: string, wanted: boolean, score: number | null): Ranked => ({
	key,
	wanted,
	score
});

const trial = (key: string, score: number | null, more: Partial<Trial> = {}): Trial => ({
	key,
	score,
	reasons: 0,
	flagged: 0,
	grade: null,
	costMicros: 0,
	ms: 0,
	...more
});

const log2of3 = Math.log2(3);

describe('recallAt', () => {
	const distinct = [
		job('a', true, 5),
		job('b', false, 4),
		job('c', true, 3),
		job('d', false, null)
	];

	it('counts the wanted jobs above the cut', () => {
		expect(recallAt(distinct, 1)).toEqual({ share: 0.5, of: 2 });
		expect(recallAt(distinct, 2)).toEqual({ share: 0.5, of: 2 });
		expect(recallAt(distinct, 3)).toEqual({ share: 1, of: 2 });
		expect(recallAt(distinct, 25)).toEqual({ share: 1, of: 2 });
	});

	it('counts a tie group cut by k in proportion, whatever order the jobs came in', () => {
		const tied = [job('a', true, 4), job('b', false, 4), job('c', false, 4), job('d', true, 1)];
		expect(recallAt(tied, 1).share).toBeCloseTo(1 / 6);
		expect(recallAt([...tied].reverse(), 1).share).toBeCloseTo(1 / 6);
		expect(recallAt(tied, 3)).toEqual({ share: 0.5, of: 2 });
	});

	it('puts no usable answer below every score, even a wanted one', () => {
		expect(recallAt([job('a', true, null), job('b', false, 1)], 1)).toEqual({ share: 0, of: 1 });
	});

	it('has nothing to say without a wanted job', () => {
		expect(recallAt([job('a', false, 5)], 10)).toEqual({ share: null, of: 0 });
	});
});

describe('ndcg', () => {
	it('is 1 when every wanted job is on top', () => {
		expect(ndcg([job('b', false, 2), job('a', true, 5), job('c', true, 4)])).toEqual({
			share: 1,
			of: 3
		});
	});

	it('drops as a wanted job sinks', () => {
		expect(ndcg([job('a', false, 5), job('b', true, 4)]).share).toBeCloseTo(1 / log2of3);
	});

	it('gives a tied wanted job the average of the places its group spans', () => {
		expect(ndcg([job('a', true, 3), job('b', false, 3)]).share).toBeCloseTo((1 + 1 / log2of3) / 2);
	});

	it('has nothing to say without a wanted job', () => {
		expect(ndcg([job('a', false, 5)])).toEqual({ share: null, of: 0 });
	});
});

describe('separation', () => {
	it('compares average scores, leaving out unusable answers', () => {
		const items = [job('a', true, 5), job('b', true, 3), job('c', false, 2), job('d', false, null)];
		expect(separation(items)).toEqual({
			wanted: { mean: 4, of: 2 },
			notWanted: { mean: 2, of: 1 },
			gap: 2
		});
	});

	it('has no gap unless both sides have a score', () => {
		expect(separation([job('a', true, 5), job('b', false, null)])).toEqual({
			wanted: { mean: 5, of: 1 },
			notWanted: { mean: null, of: 0 },
			gap: null
		});
		expect(separation([job('a', false, 5)]).gap).toBeNull();
	});
});

describe('ranking', () => {
	it('reports recall at 10 and 25, NDCG and separation together', () => {
		const items = [job('a', true, 5), job('b', false, 1)];
		expect(ranking(items)).toEqual({
			recall: { 10: { share: 1, of: 1 }, 25: { share: 1, of: 1 } },
			ndcg: { share: 1, of: 2 },
			separation: separation(items)
		});
	});
});

describe('trial measures', () => {
	it('faithfulness: the share of reasons with a dropped citation', () => {
		const trials = [trial('a', 4, { reasons: 4, flagged: 1 }), trial('b', 2, { reasons: 2 })];
		expect(faithfulness(trials).share).toBeCloseTo(1 / 6);
		expect(faithfulness(trials).of).toBe(6);
		expect(faithfulness([trial('a', null)])).toEqual({ share: null, of: 0 });
	});

	it('hard to read: the share of usable answers above grade 8', () => {
		const trials = [
			trial('a', 4, { grade: 6 }),
			trial('b', 3, { grade: 8 }),
			trial('c', 3, { grade: 9.5 }),
			trial('d', null)
		];
		expect(hardToRead(trials).share).toBeCloseTo(1 / 3);
		expect(hardToRead(trials).of).toBe(3);
		expect(hardToRead([])).toEqual({ share: null, of: 0 });
	});

	it('unusable: the share of answers that couldn’t be used', () => {
		expect(unusable([trial('a', null), trial('b', 3)])).toEqual({ share: 0.5, of: 2 });
		expect(unusable([])).toEqual({ share: null, of: 0 });
	});

	it('unstable: of jobs scored more than once, the share that moved by more than 1', () => {
		const trials = [
			trial('a', 3),
			trial('a', 5),
			trial('b', 4),
			trial('b', 4),
			trial('b', 3),
			trial('c', 2),
			trial('d', 2),
			trial('d', null)
		];
		expect(unstable(trials)).toEqual({ share: 0.5, of: 2 });
		expect(unstable([trial('a', 3)])).toEqual({ share: null, of: 0 });
	});

	it('costs: the average cost and time per call', () => {
		expect(
			costs([
				trial('a', 3, { costMicros: 400, ms: 900 }),
				trial('b', 3, { costMicros: 600, ms: 1100 })
			])
		).toEqual({ microsPerJob: { mean: 500, of: 2 }, msPerJob: { mean: 1000, of: 2 } });
		expect(costs([])).toEqual({
			microsPerJob: { mean: null, of: 0 },
			msPerJob: { mean: null, of: 0 }
		});
	});
});
