/**
 * The company page (design note 0007): one company's open jobs with their
 * warnings, the jobs that closed lately, and my history with it, in words.
 * Plain functions over what the server reads, so every line is tested. The
 * warnings come from signalCounts, so they match the Jobs list and Insights.
 */
import { dateLabel } from '#lib/jobs/display.ts';
import { STATUS_WORDS, type Status } from '#lib/tracking/standing.ts';
import { signalCounts, type OpenJob } from './signals.ts';

export interface OpenRow {
	readonly id: string;
	readonly title: string;
	/** The job's warnings in a few words each, or none. */
	readonly warnings: readonly string[];
}

/** Open jobs, newest first as stored, each with its warnings. */
export function openRows(open: readonly OpenJob[], now: string): OpenRow[] {
	const { ghost, pay } = signalCounts(open, [], now);
	const words = new Map<string, string[]>();
	for (const job of ghost) words.set(job.id, [`Possible ghost job: ${job.why.toLowerCase()}`]);
	for (const job of pay) {
		words.set(job.id, [...(words.get(job.id) ?? []), `Pay missing (${job.why})`]);
	}
	return open.map((job) => ({ id: job.id, title: job.title, warnings: words.get(job.id) ?? [] }));
}

export interface Mark {
	readonly id: string;
	readonly title: string;
	readonly mark: 'saved' | 'passed';
	readonly note: string;
	readonly at: string;
}

export interface Applied {
	readonly id: string;
	readonly title: string;
	readonly status: Status;
	readonly appliedAt: string;
}

export interface HistoryRow {
	readonly id: string;
	readonly title: string;
	readonly what: string;
	readonly at: string;
}

/**
 * What I've done with this company's jobs, newest first. An application says
 * more than a "saved" mark, so a job I applied to shows the application.
 */
export function history(marks: readonly Mark[], applied: readonly Applied[]): HistoryRow[] {
	const appliedIds = new Set(applied.map((a) => a.id));
	const rows: HistoryRow[] = [
		...applied.map((a) => ({
			id: a.id,
			title: a.title,
			what:
				a.status === 'applied'
					? `Applied ${dateLabel(a.appliedAt)}`
					: `Applied ${dateLabel(a.appliedAt)} · ${STATUS_WORDS[a.status]}`,
			at: a.appliedAt
		})),
		...marks
			.filter((m) => !appliedIds.has(m.id))
			.map((m) => ({
				id: m.id,
				title: m.title,
				what:
					m.mark === 'saved'
						? `Saved ${dateLabel(m.at)}`
						: `Passed ${dateLabel(m.at)}${m.note === '' ? '' : `: ${m.note}`}`,
				at: m.at
			}))
	];
	return rows.sort((a, b) => b.at.localeCompare(a.at) || a.title.localeCompare(b.title));
}

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

export interface CompanyFacts {
	readonly open: number;
	readonly closed: number;
	readonly reposted: number;
	readonly applied: number;
	readonly warned: number;
}

/** The company at a glance, in one sentence. */
export function companySummary(facts: CompanyFacts): string {
	const parts = [
		plural(facts.open, 'open job', 'open jobs'),
		`${String(facts.closed)} closed in the last 30 days`,
		...(facts.reposted > 0 ? [`${String(facts.reposted)} open again after closing`] : []),
		...(facts.warned > 0 ? [`${plural(facts.warned, 'job', 'jobs')} with a warning`] : [])
	];
	const mine =
		facts.applied === 0
			? 'You haven’t applied here yet.'
			: `You’ve applied ${facts.applied === 1 ? 'once' : `${String(facts.applied)} times`}.`;
	return `${parts.join('; ')}. ${mine}`;
}
