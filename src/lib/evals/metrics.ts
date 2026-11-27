/**
 * The numbers an eval run reports (design note 0008, section 7). Plain
 * functions over plain records, so the same code scores the model, the
 * keyword baseline, and any later model alike.
 *
 * Scores are 1–5, so many jobs tie. A ranking measure that broke ties by
 * some hidden order (key, insert order) would flatter or punish a scorer by
 * luck, so ranking is measured as the expected value over every order of
 * the tied jobs. That has an exact answer, worked out per tie group, and
 * gives the same number every run.
 *
 * Every number carries how many items it rests on: with few labels the
 * numbers are noisy, and the report must say so.
 */

/** A labelled job and what a scorer gave it. A null score is no usable answer: ranked last. */
export interface Ranked {
	readonly key: string;
	readonly wanted: boolean;
	readonly score: number | null;
}

/** One scoring call, as the eval sees it. */
export interface Trial {
	readonly key: string;
	/** Null when the answer couldn't be used. */
	readonly score: number | null;
	/** Reasons the model gave. */
	readonly reasons: number;
	/** Reasons with at least one citation code dropped. */
	readonly flagged: number;
	/** Reading grade of the summary and reasons; null when the answer couldn't be used. */
	readonly grade: number | null;
	readonly costMicros: number;
	readonly ms: number;
}

/** A share, and how many items it rests on. Null share when there were none. */
export interface Share {
	readonly share: number | null;
	readonly of: number;
}

/** 0008: summaries should read at grade 8 or under. */
export const GRADE_TARGET = 8;

/** The cutoffs recall is reported at: a screen of jobs, and a long read. */
export const RECALL_AT = [10, 25] as const;

/** Highest score first; no usable answer last. */
function groups(items: readonly Ranked[]): Ranked[][] {
	const value = (item: Ranked) => item.score ?? Number.NEGATIVE_INFINITY;
	const sorted = [...items].sort((a, b) => value(b) - value(a));
	const out: Ranked[][] = [];
	let group: Ranked[] = [];
	let previous = Number.NaN;
	for (const item of sorted) {
		// NaN equals nothing, so the first job always starts a group.
		if (value(item) !== previous) {
			group = [];
			out.push(group);
			previous = value(item);
		}
		group.push(item);
	}
	return out;
}

const wantedIn = (items: readonly Ranked[]) => items.filter((item) => item.wanted).length;

/**
 * Of the jobs I wanted, the share expected in the top k. A tie group cut by
 * k counts its wanted jobs in proportion to the places it gets above the cut.
 */
export function recallAt(items: readonly Ranked[], k: number): Share {
	const total = wantedIn(items);
	if (total === 0) return { share: null, of: 0 };
	let place = 0;
	let found = 0;
	for (const group of groups(items)) {
		const above = Math.max(0, Math.min(group.length, k - place));
		found += (wantedIn(group) * above) / group.length;
		place += group.length;
	}
	return { share: found / total, of: total };
}

const discount = (place: number) => 1 / Math.log2(place + 1);

/**
 * Normalized discounted cumulative gain: 1 when every wanted job is above
 * every other, lower as wanted jobs sink. A wanted job in a tie group gets
 * the average discount of the places that group spans.
 */
export function ndcg(items: readonly Ranked[]): Share {
	const total = wantedIn(items);
	if (total === 0) return { share: null, of: 0 };
	let place = 0;
	let gain = 0;
	for (const group of groups(items)) {
		let spread = 0;
		for (let i = 1; i <= group.length; i++) spread += discount(place + i);
		gain += (wantedIn(group) * spread) / group.length;
		place += group.length;
	}
	let ideal = 0;
	for (let i = 1; i <= total; i++) ideal += discount(i);
	return { share: gain / ideal, of: items.length };
}

export interface Mean {
	readonly mean: number | null;
	readonly of: number;
}

function mean(values: readonly number[]): Mean {
	if (values.length === 0) return { mean: null, of: 0 };
	return { mean: values.reduce((sum, value) => sum + value, 0) / values.length, of: values.length };
}

export interface Separation {
	readonly wanted: Mean;
	readonly notWanted: Mean;
	/** Wanted minus not wanted; null unless both sides have a score. */
	readonly gap: number | null;
}

/** Average score of the jobs I wanted against the ones I passed on; unusable answers left out. */
export function separation(items: readonly Ranked[]): Separation {
	const scored = (wanted: boolean) =>
		items.flatMap((item) => (item.wanted === wanted && item.score !== null ? [item.score] : []));
	const wanted = mean(scored(true));
	const notWanted = mean(scored(false));
	const gap = wanted.mean === null || notWanted.mean === null ? null : wanted.mean - notWanted.mean;
	return { wanted, notWanted, gap };
}

/** Share of the model's reasons with a citation code dropped. Target: near zero. */
export function faithfulness(trials: readonly Trial[]): Share {
	const reasons = trials.reduce((sum, trial) => sum + trial.reasons, 0);
	const flagged = trials.reduce((sum, trial) => sum + trial.flagged, 0);
	return { share: reasons === 0 ? null : flagged / reasons, of: reasons };
}

/** Share of usable answers that read above grade 8. */
export function hardToRead(trials: readonly Trial[]): Share {
	const grades = trials.flatMap((trial) => (trial.grade === null ? [] : [trial.grade]));
	const over = grades.filter((grade) => grade > GRADE_TARGET).length;
	return { share: grades.length === 0 ? null : over / grades.length, of: grades.length };
}

/** Share of answers that couldn't be used at all. */
export function unusable(trials: readonly Trial[]): Share {
	const failed = trials.filter((trial) => trial.score === null).length;
	return { share: trials.length === 0 ? null : failed / trials.length, of: trials.length };
}

/**
 * Of the jobs scored more than once, the share whose scores moved by more
 * than 1 (a 3 and a 5, say). Unusable answers don't count as a score.
 */
export function unstable(trials: readonly Trial[]): Share {
	const byJob = new Map<string, number[]>();
	for (const trial of trials) {
		if (trial.score === null) continue;
		const scores = byJob.get(trial.key) ?? [];
		scores.push(trial.score);
		byJob.set(trial.key, scores);
	}
	const repeated = [...byJob.values()].filter((scores) => scores.length > 1);
	const moved = repeated.filter((scores) => Math.max(...scores) - Math.min(...scores) > 1).length;
	return { share: repeated.length === 0 ? null : moved / repeated.length, of: repeated.length };
}

export interface Costs {
	readonly microsPerJob: Mean;
	readonly msPerJob: Mean;
}

export function costs(trials: readonly Trial[]): Costs {
	return {
		microsPerJob: mean(trials.map((trial) => trial.costMicros)),
		msPerJob: mean(trials.map((trial) => trial.ms))
	};
}

export interface Ranking {
	readonly recall: Readonly<Record<(typeof RECALL_AT)[number], Share>>;
	readonly ndcg: Share;
	readonly separation: Separation;
}

/** Everything about how a scorer ranks the labelled jobs. */
export function ranking(items: readonly Ranked[]): Ranking {
	return {
		recall: { 10: recallAt(items, 10), 25: recallAt(items, 25) },
		ndcg: ndcg(items),
		separation: separation(items)
	};
}
