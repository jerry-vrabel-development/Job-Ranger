/**
 * An eval run (design note 0008, step 7b): the model and the keyword
 * baseline on the fixed set and on my labelled jobs, through the same call
 * the app makes (#lib/scoring/ask.ts), under a spending cap.
 *
 * Order matters when the cap or an error stops a run early: the fixed set
 * once, then the labels, then the fixed set again for stability. So the
 * numbers that matter most exist first. A run that stops says so, and
 * every number still says how many items it rests on.
 */
import type { TokenUsage } from '#lib/models/types.ts';
import { baselineScore } from '#lib/scoring/baseline.ts';
import type { Asked } from '#lib/scoring/ask.ts';
import { PROMPT_VERSION, type Profile, type ScoringJob } from '#lib/scoring/score.ts';
import { checkFixedSet, type CaseResult, type FixedCase } from './fixed-set.ts';
import type { LabelFile, LabelledJob } from './labels.ts';
import {
	costs,
	faithfulness,
	hardToRead,
	ranking,
	unstable,
	unusable,
	type Costs,
	type Ranked,
	type Ranking,
	type Share,
	type Trial
} from './metrics.ts';

export type Ask = (job: ScoringJob, profile: Profile) => Promise<Asked>;

export interface RunOptions {
	readonly model: string;
	readonly ask: Ask;
	readonly fixed: readonly FixedCase[];
	readonly fixedProfile: Profile;
	/** My labelled jobs, or null to run the fixed set only. */
	readonly labels: LabelFile | null;
	/** Times the fixed set is scored, for stability; at least 1. */
	readonly repeat: number;
	/** Stop before a call once this much is spent, in millionths of a dollar. */
	readonly capMicros: number;
	readonly now: Date;
	/** Waits before the one retry of a failed call. */
	readonly sleep: (ms: number) => Promise<void>;
	readonly onCall?: (made: number, planned: number) => void;
}

/** One model call, for the private record: which job, which pass, what came back. */
export interface Call {
	readonly set: 'fixed' | 'labels';
	readonly key: string;
	readonly pass: number;
	readonly trial: Trial;
	readonly summary: string;
	/** Why the answer couldn't be used, or what code dropped. */
	readonly notes: readonly string[];
}

export interface LabelResults {
	/** Labelled jobs the run reached; both scorers are measured on the same ones. */
	readonly scored: number;
	readonly wanted: number;
	readonly exported: number;
	readonly skipped: LabelFile['skipped'];
	readonly model: Ranking;
	readonly baseline: Ranking;
}

export interface Quality {
	readonly faithfulness: Share;
	readonly hardToRead: Share;
	readonly unusable: Share;
	readonly unstable: Share;
	readonly costs: Costs;
}

export interface EvalRun {
	readonly promptVersion: string;
	readonly model: string;
	readonly at: string;
	readonly planned: number;
	readonly made: number;
	readonly spentMicros: number;
	/** Why the run stopped early, or null when it finished. */
	readonly stopped: string | null;
	readonly fixed: { readonly model: CaseResult[]; readonly baseline: CaseResult[] };
	readonly labels: LabelResults | null;
	readonly quality: Quality;
	/** Every call, with job keys and the model's words: private, never committed. */
	readonly calls: readonly Call[];
}

/** Calls a run will make: the fixed set `repeat` times (at least once), and each label once. */
export function plannedCalls(fixed: number, labels: number, repeat: number): number {
	return fixed * Math.max(1, Math.floor(repeat)) + labels;
}

/** A generous guess at one scoring call's size (0008: about 3,000–4,000 tokens in, 300 out), for the estimate shown before a run. */
export const TYPICAL_CALL: TokenUsage = {
	inputTokens: 4_000,
	outputTokens: 400,
	reasoningTokens: null
};

/** Retry waits are capped, so a long Retry-After can't hang a run. */
export const RETRY_WAIT_MAX_MS = 60_000;
const RETRY_WAIT_DEFAULT_MS = 2_000;

function trialOf(key: string, asked: Extract<Asked, { ok: true }>): Trial {
	const { checked } = asked;
	return {
		key,
		score: checked.ok ? checked.score : null,
		reasons: asked.given,
		flagged: new Set(checked.dropped.map((drop) => drop.reason)).size,
		grade: checked.ok ? checked.grade : null,
		costMicros: asked.cost.micros,
		ms: asked.latencyMs
	};
}

function notesOf(asked: Extract<Asked, { ok: true }>): string[] {
	const dropped = asked.checked.dropped.map((drop) => drop.why);
	return asked.checked.ok ? dropped : [asked.checked.why, ...dropped];
}

interface Job {
	readonly set: Call['set'];
	readonly key: string;
	readonly pass: number;
	readonly job: ScoringJob;
	readonly profile: Profile;
	/** The label, for a labelled job. */
	readonly label: LabelledJob | null;
}

export async function runEval(options: RunOptions): Promise<EvalRun> {
	const { fixed, fixedProfile, labels } = options;
	const repeat = Math.max(1, Math.floor(options.repeat));
	const fixedPass = (pass: number): Job[] =>
		fixed.map((c) => ({
			set: 'fixed',
			key: c.id,
			pass,
			job: c.job,
			profile: fixedProfile,
			label: null
		}));
	const labelJobs: Job[] =
		labels === null
			? []
			: labels.labels.map((label) => ({
					set: 'labels',
					key: label.key,
					pass: 1,
					job: label.job,
					profile: labels.profile,
					label
				}));
	const plan: Job[] = [
		...fixedPass(1),
		...labelJobs,
		...Array.from({ length: repeat - 1 }, (_, i) => fixedPass(i + 2)).flat()
	];

	const calls: Call[] = [];
	/** Labelled jobs the run reached, with the model's score. */
	const reached: { readonly label: LabelledJob; readonly score: number | null }[] = [];
	let spent = 0;
	let stopped: string | null = null;
	for (const next of plan) {
		if (spent >= options.capMicros) {
			stopped = `It reached the spending cap after ${String(calls.length)} of ${String(plan.length)} calls.`;
			break;
		}
		let asked = await options.ask(next.job, next.profile);
		if (!asked.ok && asked.retry) {
			await options.sleep(Math.min(asked.retryAfterMs ?? RETRY_WAIT_DEFAULT_MS, RETRY_WAIT_MAX_MS));
			asked = await options.ask(next.job, next.profile);
		}
		if (!asked.ok) {
			const tries = asked.retry ? 'twice' : 'and isn’t worth retrying';
			stopped = `A call failed ${tries}, after ${String(calls.length)} of ${String(plan.length)} calls: ${asked.message}`;
			break;
		}
		spent += asked.cost.micros;
		const trial = trialOf(next.key, asked);
		if (next.label !== null) reached.push({ label: next.label, score: trial.score });
		calls.push({
			set: next.set,
			key: next.key,
			pass: next.pass,
			trial,
			summary: asked.checked.ok ? asked.checked.summary : '',
			notes: notesOf(asked)
		});
		options.onCall?.(calls.length, plan.length);
	}

	const fixedScores = new Map(
		calls
			.filter((call) => call.set === 'fixed' && call.pass === 1)
			.map((call) => [call.key, call.trial.score])
	);
	const baselineFixed = new Map(fixed.map((c) => [c.id, baselineScore(c.job, fixedProfile).score]));

	let labelResults: LabelResults | null = null;
	if (labels !== null) {
		const rank = (score: (each: (typeof reached)[number]) => number | null): Ranked[] =>
			reached.map((each) => ({
				key: each.label.key,
				wanted: each.label.wanted,
				score: score(each)
			}));
		labelResults = {
			scored: reached.length,
			wanted: reached.filter((each) => each.label.wanted).length,
			exported: labels.labels.length,
			skipped: labels.skipped,
			model: ranking(rank((each) => each.score)),
			baseline: ranking(rank((each) => baselineScore(each.label.job, labels.profile).score))
		};
	}

	const trials = calls.map((call) => call.trial);
	return {
		promptVersion: PROMPT_VERSION,
		model: options.model,
		at: options.now.toISOString(),
		planned: plan.length,
		made: calls.length,
		spentMicros: spent,
		stopped,
		fixed: {
			model: checkFixedSet(fixedScores, fixed),
			baseline: checkFixedSet(baselineFixed, fixed)
		},
		labels: labelResults,
		quality: {
			faithfulness: faithfulness(trials),
			hardToRead: hardToRead(trials),
			unusable: unusable(trials),
			unstable: unstable(calls.filter((call) => call.set === 'fixed').map((call) => call.trial)),
			costs: costs(trials)
		},
		calls
	};
}

/** What's committed to evals/results/: numbers and the made-up cases only. No job keys, titles or model words. */
export type PublishedRun = Omit<EvalRun, 'calls'>;

export function published(run: EvalRun): PublishedRun {
	// Listed one by one, not copied and trimmed, so a field added later stays private until it's added here.
	return {
		promptVersion: run.promptVersion,
		model: run.model,
		at: run.at,
		planned: run.planned,
		made: run.made,
		spentMicros: run.spentMicros,
		stopped: run.stopped,
		fixed: run.fixed,
		labels: run.labels,
		quality: run.quality
	};
}
