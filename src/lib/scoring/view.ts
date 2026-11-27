/**
 * What a job's fit line says (design note 0008): its score with the reasons
 * and their sources, or plainly why it has none. Plain functions over the
 * latest scoring answer for the job, so every sentence is tested.
 */
import { SCORE_WORDS, type CheckedReason, type Score } from './score.ts';

/** The latest scoring answer recorded for a job (one row of job_scores). */
export interface LatestScore {
	readonly ok: boolean;
	readonly score: Score | null;
	readonly summary: string;
	readonly reasons: readonly CheckedReason[];
	readonly why: string;
	readonly promptVersion: string;
	readonly profileVersion: string;
}

export interface ReasonView {
	/** "For" or "Against", in words: never color alone. */
	readonly direction: 'For' | 'Against';
	readonly text: string;
	readonly sources: readonly string[];
}

export type FitView =
	| {
			readonly kind: 'scored';
			/** "4 · Good fit" */
			readonly label: string;
			readonly score: Score;
			readonly summary: string;
			readonly reasons: readonly ReasonView[];
			/** Scored with an older prompt or profile; it will be scored again. */
			readonly stale: boolean;
	  }
	| { readonly kind: 'unscored'; readonly why: string; readonly canScore: boolean };

export interface FitContext {
	readonly promptVersion: string;
	readonly profileVersion: string;
	/** The job has posting text to score. */
	readonly hasText: boolean;
	/** Why scoring is off, or null when it's on. */
	readonly scoringOff: string | null;
}

export const STALE_NOTE =
	'Scored before your facts, interests or preferences last changed; it will be scored again.';

export function fitView(latest: LatestScore | undefined, context: FitContext): FitView {
	const current =
		latest?.promptVersion === context.promptVersion &&
		latest.profileVersion === context.profileVersion;
	if (latest?.ok === true && latest.score !== null) {
		return {
			kind: 'scored',
			label: `${String(latest.score)} · ${SCORE_WORDS[latest.score]}`,
			score: latest.score,
			summary: latest.summary,
			reasons: latest.reasons.map((reason) => ({
				direction: reason.direction === 'for' ? 'For' : 'Against',
				text: reason.text,
				sources: reason.sources
			})),
			stale: !current
		};
	}
	const canScore = context.hasText && context.scoringOff === null;
	if (!context.hasText) {
		return {
			kind: 'unscored',
			why: 'Not scored: the board sent no posting text to read.',
			canScore
		};
	}
	if (latest !== undefined && current) {
		return { kind: 'unscored', why: `Not scored: ${latest.why}`, canScore };
	}
	if (context.scoringOff !== null) {
		return { kind: 'unscored', why: `Not scored yet. ${context.scoringOff}`, canScore };
	}
	return {
		kind: 'unscored',
		why: 'Not scored yet: it’s waiting for the next daily run.',
		canScore
	};
}
