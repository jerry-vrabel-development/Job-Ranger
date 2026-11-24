/**
 * The market I watch (design note 0007): the open jobs on the boards I watch,
 * by company and by workplace, and how many post pay. Plain functions over
 * counts the server reads, so every row and sentence here is tested.
 */
import type { Bar } from '#lib/charts/types.ts';
import type { Workplace } from '#lib/jobs/posting.ts';

export interface MarketCounts {
	readonly byCompany: readonly { readonly company: string; readonly open: number }[];
	readonly byWorkplace: readonly { readonly workplace: Workplace; readonly open: number }[];
	/** Open jobs on boards whose list includes pay (Ashby, Lever, Breezy), and how many post it. */
	readonly payListed: number;
	readonly payPosted: number;
	/** Open jobs on Greenhouse, whose list never includes pay. */
	readonly payUnlisted: number;
}

/** More companies than this fold into one line, said in words, so the chart stays readable. */
export const MAX_COMPANIES = 15;

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;
const percent = (part: number, whole: number) => `${String(Math.round((part / whole) * 100))}%`;

export function totalOpen(counts: MarketCounts): number {
	return counts.byCompany.reduce((sum, c) => sum + c.open, 0);
}

/** Every company, most open jobs first, ties by name: the table shows all of them. */
export function companyRows(counts: MarketCounts): Bar[] {
	const total = totalOpen(counts);
	return [...counts.byCompany]
		.sort((a, b) => b.open - a.open || a.company.localeCompare(b.company))
		.map((c) => ({
			label: c.company,
			count: c.open,
			detail: total === 0 ? null : percent(c.open, total)
		}));
}

/** The chart's bars: the first companies, with the rest said in words. */
export function companyBars(counts: MarketCounts): { bars: Bar[]; more: string | null } {
	const rows = companyRows(counts);
	const rest = rows.slice(MAX_COMPANIES);
	const more =
		rest.length === 0
			? null
			: `And ${plural(rest.length, 'more company', 'more companies')} with ${plural(
					rest.reduce((sum, c) => sum + c.count, 0),
					'open job',
					'open jobs'
				)}, in the table.`;
	return { bars: rows.slice(0, MAX_COMPANIES), more };
}

const WORKPLACES: readonly (readonly [Workplace, string])[] = [
	['remote', 'Remote'],
	['hybrid', 'Hybrid'],
	['on-site', 'On site'],
	['unknown', 'Not stated']
];

/** Always the same four rows in the same order, so they're easy to compare day to day. */
export function workplaceBars(counts: MarketCounts): Bar[] {
	const total = totalOpen(counts);
	return WORKPLACES.map(([workplace, label]) => {
		const count = counts.byWorkplace.find((w) => w.workplace === workplace)?.open ?? 0;
		return { label, count, detail: total === 0 ? null : percent(count, total) };
	});
}

export function marketSummary(counts: MarketCounts): string {
	const total = totalOpen(counts);
	if (total === 0) return 'No open jobs on your list right now.';
	const companies = counts.byCompany.filter((c) => c.open > 0).length;
	const remote = counts.byWorkplace.find((w) => w.workplace === 'remote')?.open ?? 0;
	return `${plural(total, 'open job', 'open jobs')} at ${plural(companies, 'company', 'companies')}; ${percent(remote, total)} remote.`;
}

/**
 * How many post pay, counting only boards whose list can show it. Greenhouse's
 * list never includes pay, so its jobs are left out and said so, not counted as
 * "no pay" (design note 0005).
 */
export function payLine(counts: MarketCounts): string {
	const unlisted =
		counts.payUnlisted === 0
			? ''
			: ` Greenhouse’s list doesn’t include pay, so its ${plural(counts.payUnlisted, 'job isn’t', 'jobs aren’t')} counted here.`;
	if (counts.payListed === 0) {
		return counts.payUnlisted === 0
			? 'No open jobs to check for pay.'
			: `No open jobs on boards whose list includes pay.${unlisted}`;
	}
	return `${String(counts.payPosted)} of ${plural(counts.payListed, 'open job', 'open jobs')} post pay (${percent(counts.payPosted, counts.payListed)}), on Ashby, Lever and Breezy boards.${unlisted}`;
}
