/**
 * My search, on the Insights page (design note 0007): the funnel from saved
 * to offer, and where my applications are waiting. Plain functions over
 * counts the server reads, so every number and sentence here is tested.
 *
 * Each step counts what reached at least that far, so a step is never more
 * than the one before it:
 * - saved: jobs I saved or applied to (applying means I was interested)
 * - replied: interviewing, offer or rejected. Withdrawn isn't counted: the
 *   record doesn't say whether they had answered first.
 * - interviewing: interviewing or offer
 */
import { standing, type Tracked } from '#lib/tracking/standing.ts';
import type { Bar } from '#lib/charts/types.ts';

export interface SearchCounts {
	/** Every job Job Ranger has seen, open or closed. */
	readonly found: number;
	readonly open: number;
	readonly saved: number;
	readonly applied: number;
	readonly replied: number;
	readonly interviewing: number;
	readonly offers: number;
}

/**
 * A funnel step is a bar: its detail is the share of the step before ("40% of
 * applied"), or null when the step before is too small to say.
 */
export type FunnelStep = Bar;

/** Below this many, a share would be more noise than news ("100% of 1"), so none is shown. */
export const MIN_FOR_SHARE = 5;

export function funnelSteps(counts: SearchCounts): FunnelStep[] {
	const steps: readonly (readonly [string, number])[] = [
		['Saved', counts.saved],
		['Applied', counts.applied],
		['Replied', counts.replied],
		['Interviewing', counts.interviewing],
		['Offer', counts.offers]
	];
	return steps.map(([label, count], i) => {
		const before = steps[i - 1];
		const detail =
			before === undefined || before[1] < MIN_FOR_SHARE
				? null
				: `${String(Math.round((count / before[1]) * 100))}% of ${before[0].toLowerCase()}`;
		return { label, count, detail };
	});
}

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/** The funnel in one sentence, for its caption and for screen readers. */
export function funnelSummary(counts: SearchCounts): string {
	if (counts.saved === 0) return 'Nothing saved or applied to yet. As you do, this fills in.';
	const heard =
		counts.applied === 0
			? 'and haven’t applied yet'
			: `applied to ${String(counts.applied)}, and heard back from ${String(counts.replied)}`;
	// Every offer also counts as an interview, so an offer never comes without one.
	const offers =
		counts.offers === 0
			? ''
			: `, and ${String(counts.offers)} ${counts.offers === 1 ? 'became an offer' : 'became offers'}`;
	const tail =
		counts.interviewing === 0
			? ''
			: `; ${String(counts.interviewing)} reached an interview${offers}`;
	return `You saved ${plural(counts.saved, 'job', 'jobs')}, ${heard}${tail}.`;
}

/** "640 jobs found, 612 open now." */
export function foundLine(counts: SearchCounts): string {
	return `${plural(counts.found, 'job', 'jobs')} found, ${String(counts.open)} open now.`;
}

export interface Waiting {
	readonly followUp: number;
	readonly waiting: number;
	readonly noReply: number;
}

/** How many applications need a follow-up, are waiting, or have had no reply (0006's rules). */
export function waitingCounts(apps: readonly Tracked[], now: string): Waiting {
	const tally = { followUp: 0, waiting: 0, noReply: 0 };
	for (const app of apps) {
		const { group } = standing(app, now);
		if (group === 'follow-up') tally.followUp += 1;
		else if (group === 'waiting') tally.waiting += 1;
		else if (group === 'no-reply') tally.noReply += 1;
	}
	return tally;
}
