/**
 * Signals and costs, part two (design note 0007): what drafting has cost,
 * today, this month, in all and per application, and whether it's on at all;
 * and the same for scoring jobs (0008), which has its own cap.
 * Plain functions over amounts the server reads, in millionths of a dollar,
 * so every sentence here is tested. When drafting is off, the page says so,
 * and why, rather than showing a quiet $0.00.
 */
import { dollars } from '#lib/money.ts';

export interface Spending {
	/** Whether drafting is set up: its label, or the reason it isn't. */
	readonly setup:
		| { readonly ready: true; readonly label: string }
		| { readonly ready: false; readonly reason: string };
	readonly capMicros: number;
	readonly todayMicros: number;
	readonly monthMicros: number;
	readonly totalMicros: number;
	/** Every application, and the drafting cost recorded on them. */
	readonly applications: number;
	readonly appliedMicros: number;
}

export interface Tile {
	readonly label: string;
	readonly value: string;
}

export function draftingStatus(spending: Spending): string {
	return spending.setup.ready
		? `Drafting is on (${spending.setup.label}), with a daily cap of ${dollars(spending.capMicros)}.`
		: `${spending.setup.reason} Nothing is spent until it is.`;
}

export function costTiles(
	spending: Pick<Spending, 'capMicros' | 'todayMicros' | 'monthMicros' | 'totalMicros'>
): Tile[] {
	return [
		{
			label: `Today, of a ${dollars(spending.capMicros)} cap`,
			value: dollars(spending.todayMicros)
		},
		{ label: 'This month', value: dollars(spending.monthMicros) },
		{ label: 'In all', value: dollars(spending.totalMicros) }
	];
}

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/** What drafting has cost per application, or why there's nothing to say yet. */
export function perApplication(spending: Spending): string {
	if (spending.applications === 0) return 'No applications yet.';
	if (spending.appliedMicros === 0) {
		return spending.applications === 1
			? 'Your one application didn’t use drafting.'
			: `None of your ${String(spending.applications)} applications used drafting.`;
	}
	const average = Math.round(spending.appliedMicros / spending.applications);
	return `${dollars(spending.appliedMicros)} across ${plural(spending.applications, 'application', 'applications')}, ${dollars(average)} each on average.`;
}

/** What scoring jobs has cost (design note 0008), kept apart from drafting, with its own cap. */
export interface ScoringSpending {
	readonly setup: Spending['setup'];
	readonly capMicros: number;
	readonly todayMicros: number;
	readonly monthMicros: number;
	readonly totalMicros: number;
	/** Answers the checks passed, and answers they couldn't use. */
	readonly scored: number;
	readonly unscored: number;
}

export function scoringStatus(spending: ScoringSpending): string {
	return spending.setup.ready
		? `Scoring is on (${spending.setup.label}), with a daily cap of ${dollars(spending.capMicros)}.`
		: `${spending.setup.reason} Nothing is spent until it is.`;
}

/** How many scores so far, and how many answers couldn't be used, in one sentence. */
export function scoringCount(spending: ScoringSpending): string {
	const scores = plural(spending.scored, 'score', 'scores');
	if (spending.unscored === 0) return `${scores} so far.`;
	return `${scores} so far; ${plural(spending.unscored, 'answer', 'answers')} couldn’t be used, so those jobs stay unscored.`;
}
