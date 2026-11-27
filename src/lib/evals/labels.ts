/**
 * Labels from use (design note 0008, section 7): what I did with a job says
 * whether I wanted it. Saved, or applied at all (even if they said no
 * later), is wanted; passed is not wanted. An application I withdrew is
 * left out: I wanted it once and then didn't, so it says neither.
 */
import type { Profile, ScoringJob } from '#lib/scoring/score.ts';

export type Mark = 'saved' | 'passed';
export const STATUSES = ['applied', 'interviewing', 'offer', 'rejected', 'withdrawn'] as const;
export type Status = (typeof STATUSES)[number];

/** A stored mark or status, or null for none (or anything the database shouldn't hold). */
export const markOf = (value: unknown): Mark | null =>
	value === 'saved' || value === 'passed' ? value : null;
export const statusOf = (value: unknown): Status | null =>
	STATUSES.find((status) => status === value) ?? null;

/** True for wanted, false for not wanted, null when it says neither. Applying outranks a mark. */
export function wantedFrom(mark: Mark | null, status: Status | null): boolean | null {
	if (status === 'withdrawn') return null;
	if (status !== null) return true;
	if (mark === null) return null;
	return mark === 'saved';
}

export interface LabelledJob {
	/** "source:board:id", like everywhere else. */
	readonly key: string;
	readonly wanted: boolean;
	readonly job: ScoringJob;
}

/** The labelled jobs read from the database, and the marked ones left out. */
export interface Labelled {
	readonly labels: readonly LabelledJob[];
	/** Marked jobs left out, and why. */
	readonly skipped: { readonly noText: number; readonly unclear: number };
}

/** What `npm run eval:labels` writes to evals/private/labels.json (never committed). */
export interface LabelFile extends Labelled {
	readonly exportedAt: string;
	/** My profile as the model is told it, at export time. */
	readonly profile: Profile;
}
