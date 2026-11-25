/**
 * Signals and costs, part one (design note 0007): how many open jobs carry
 * each honest signal from design note 0005, and which ones. The same rules the
 * Jobs list uses (ghost.ts, pay.ts, scam.ts), run over every open job I watch,
 * so a count here always matches the flags on the jobs themselves.
 *
 * Scam checks read a posting's full text, which Job Ranger only has for jobs
 * with an apply kit. So that count is out of the postings checked, and says so.
 * Both lists cover open jobs on boards I watch, nothing closed or paused.
 */
import type { Bar } from '#lib/charts/types.ts';
import type { Pay, Source } from '#lib/jobs/posting.ts';
import { ghostSignal } from '#lib/signals/ghost.ts';
import { paySignal } from '#lib/signals/pay.ts';
import type { ScamFlag } from '#lib/signals/scam.ts';

export interface OpenJob {
	readonly source: Source;
	readonly board: string;
	readonly id: string;
	readonly company: string;
	readonly title: string;
	readonly location: string;
	readonly pay: Pay | null;
	readonly postedAt: string | null;
	readonly firstSeenAt: string;
	readonly reopenCount: number;
}

export interface CheckedJob {
	readonly source: Source;
	readonly board: string;
	readonly id: string;
	readonly company: string;
	readonly title: string;
	readonly flags: readonly ScamFlag[];
}

/** A flagged job: where it is, and why it's flagged, in a few words. */
export interface FlaggedJob {
	readonly source: Source;
	readonly board: string;
	readonly id: string;
	readonly company: string;
	readonly title: string;
	readonly why: string;
}

export interface SignalCounts {
	readonly open: number;
	readonly ghost: readonly FlaggedJob[];
	readonly pay: readonly FlaggedJob[];
	readonly checked: number;
	readonly scam: readonly FlaggedJob[];
}

/** More flagged jobs than this are counted in words rather than listed. */
export const MAX_LISTED = 50;

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${String(n)} times`);
const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;
const where = (job: OpenJob | CheckedJob) => ({
	source: job.source,
	board: job.board,
	id: job.id,
	company: job.company,
	title: job.title
});
/** Natural order, so "Engineer 3" comes before "Engineer 12". */
const natural = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });
const byName = (a: FlaggedJob, b: FlaggedJob) =>
	natural(a.company, b.company) || natural(a.title, b.title);

export function signalCounts(
	open: readonly OpenJob[],
	checked: readonly CheckedJob[],
	now: string
): SignalCounts {
	const ghost = open
		.flatMap((job) => {
			const signal = ghostSignal(job, now);
			if (signal === null) return [];
			const why = [
				...(signal.days > 0 ? [`open ${plural(signal.days, 'day', 'days')}`] : []),
				...(signal.reposts > 0 ? [`reposted ${times(signal.reposts)}`] : [])
			].join(', ');
			const flagged: FlaggedJob = {
				...where(job),
				why: `${why.charAt(0).toUpperCase()}${why.slice(1)}`
			};
			return [{ flagged, days: signal.days }];
		})
		// Longest open first: the strongest warnings lead.
		.sort((a, b) => b.days - a.days || byName(a.flagged, b.flagged))
		.map((entry) => entry.flagged);
	const pay = open
		.flatMap((job) => {
			const laws = paySignal(job, now);
			return laws === null ? [] : [{ ...where(job), why: laws.map((law) => law.name).join(', ') }];
		})
		.sort(byName);
	const scam = checked
		.filter((job) => job.flags.length > 0)
		.map((job) => ({
			...where(job),
			why: [...new Set(job.flags.map((flag) => flag.label))].join(', ')
		}))
		.sort(byName);
	return { open: open.length, ghost, pay, checked: checked.length, scam };
}

const percent = (part: number, whole: number) => `${String(Math.round((part / whole) * 100))}%`;

/** One bar per signal, with its share of what it was checked against. */
export function signalBars(counts: SignalCounts): Bar[] {
	const ofOpen = (n: number) =>
		counts.open === 0 ? null : `${percent(n, counts.open)} of open jobs`;
	return [
		{
			label: 'Possible ghost job',
			count: counts.ghost.length,
			detail: ofOpen(counts.ghost.length)
		},
		{ label: 'Pay missing', count: counts.pay.length, detail: ofOpen(counts.pay.length) },
		{
			label: 'Scam patterns',
			count: counts.scam.length,
			detail:
				counts.checked === 0
					? 'none checked yet'
					: `out of ${plural(counts.checked, 'posting', 'postings')} checked`
		}
	];
}

export function signalSummary(counts: SignalCounts): string {
	if (counts.open === 0) return 'No open jobs to check right now.';
	const flagged = new Set(
		[...counts.ghost, ...counts.pay, ...counts.scam].map(
			(job) => `${job.source}:${job.board}:${job.id}`
		)
	).size;
	return flagged === 0
		? `No warnings on ${plural(counts.open, 'open job', 'open jobs')}.`
		: `${plural(flagged, 'job has', 'jobs have')} at least one warning, out of ${plural(counts.open, 'open job', 'open jobs')}.`;
}

/** The first jobs to list, and how many more there are, said in words. */
export function listed(jobs: readonly FlaggedJob[]): {
	jobs: readonly FlaggedJob[];
	more: string | null;
} {
	const more = jobs.length - MAX_LISTED;
	return {
		jobs: jobs.slice(0, MAX_LISTED),
		more: more > 0 ? `And ${plural(more, 'more job', 'more jobs')}.` : null
	};
}
