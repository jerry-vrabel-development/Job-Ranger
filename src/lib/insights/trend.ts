/**
 * Trending companies (design note 0007): how each company's open jobs have
 * moved over the last 7 or 30 days, from the daily counts. Plain functions,
 * so every rule here is tested to the day.
 *
 * Honesty rules:
 * - A trend needs a count from the start of the window (or before it). Without
 *   one it's "Not enough data yet", never a guess.
 * - A change has to be real to count: at least 3 jobs and at least 10% of
 *   where it started. Anything smaller is "Steady".
 * - A day with no count (the fetch failed, or the company wasn't watched yet)
 *   is a gap in the line, never a zero.
 * - A fall in open jobs is called shrinking: it's not evidence of layoffs.
 */

export interface DayCount {
	/** A UTC date, YYYY-MM-DD, as the daily fetch records it. */
	readonly day: string;
	readonly openJobs: number;
}

export type Range = 7 | 30;
export const RANGES: readonly Range[] = [7, 30];

/** "30" gives 30; anything else gives 7, the default. */
export function parseRange(value: string | null): Range {
	return value === '30' ? 30 : 7;
}

/** At least this many jobs, and at least this share of the start, for a change to count. */
export const MIN_CHANGE = 3;
export const MIN_SHARE = 0.1;

const DAY_MS = 24 * 60 * 60 * 1000;
/** The UTC day n days from a day (negative for before). */
export const addDays = (day: string, n: number) =>
	new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** The days in the window, oldest first: the start day and every day to today. */
export function windowDays(today: string, range: Range): string[] {
	return Array.from({ length: range + 1 }, (_, i) => addDays(today, i - range));
}

export interface Point {
	readonly day: string;
	/** Null where there's no count that day: a gap, not a zero. */
	readonly count: number | null;
}

export function points(counts: readonly DayCount[], days: readonly string[]): Point[] {
	const byDay = new Map(counts.map((c) => [c.day, c.openJobs]));
	return days.map((day) => ({ day, count: byDay.get(day) ?? null }));
}

export type Direction = 'growing' | 'shrinking' | 'steady' | 'unknown';

export interface Trend {
	readonly direction: Direction;
	readonly change: number | null;
	/** Said in words, with a symbol, so it never depends on color. */
	readonly words: string;
}

const SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
/** "Nov 20", for a UTC day. */
export function dayLabel(day: string): string {
	return SHORT.format(new Date(`${day}T00:00:00Z`));
}

const signed = (n: number) => (n > 0 ? `+${String(n)}` : `−${String(Math.abs(n))}`);

/** How a company's open jobs moved over the window ending today. */
export function trend(counts: readonly DayCount[], today: string, range: Range): Trend {
	const sorted = counts.filter((c) => c.day <= today).sort((a, b) => a.day.localeCompare(b.day));
	const start = addDays(today, -range);
	const first = sorted[0];
	const latest = sorted.at(-1);
	if (first === undefined || latest === undefined) {
		return { direction: 'unknown', change: null, words: 'Not enough data yet: no counts so far.' };
	}
	if (latest.day < start) {
		return {
			direction: 'unknown',
			change: null,
			words: `Not enough data yet: no counts since ${dayLabel(latest.day)}.`
		};
	}
	const before = sorted.filter((c) => c.day <= start).at(-1);
	if (before === undefined) {
		return {
			direction: 'unknown',
			change: null,
			words: `Not enough data yet: counts start ${dayLabel(first.day)}.`
		};
	}
	const change = latest.openJobs - before.openJobs;
	const enough = Math.max(MIN_CHANGE, Math.ceil(before.openJobs * MIN_SHARE));
	const span = `${String(before.openJobs)} → ${String(latest.openJobs)} open`;
	const days = `in ${String(range)} days`;
	if (Math.abs(change) < enough) {
		return { direction: 'steady', change, words: `→ Steady: ${span} ${days}.` };
	}
	return change > 0
		? { direction: 'growing', change, words: `↑ Growing: ${span} (${signed(change)}) ${days}.` }
		: {
				direction: 'shrinking',
				change,
				words: `↓ Shrinking: ${span} (${signed(change)}) ${days}.`
			};
}

export interface CompanyTrend {
	readonly company: string;
	readonly trend: Trend;
}

/** Most growth first, most shrinkage last, then the ones without enough data, by name. */
export function byChange<T extends CompanyTrend>(list: readonly T[]): T[] {
	return [...list].sort((a, b) => {
		const ca = a.trend.change;
		const cb = b.trend.change;
		if (ca === null || cb === null) {
			if (ca !== cb) return ca === null ? 1 : -1;
			return a.company.localeCompare(b.company);
		}
		return cb - ca || a.company.localeCompare(b.company);
	});
}

/** "2 growing, 1 steady and 1 shrinking over 7 days; 1 without enough data yet." */
export function trendSummary(list: readonly CompanyTrend[], range: Range): string {
	const n = (d: Direction) => list.filter((c) => c.trend.direction === d).length;
	if (list.length === 0) return 'No companies on your list yet.';
	const known = `${String(n('growing'))} growing, ${String(n('steady'))} steady and ${String(n('shrinking'))} shrinking over ${String(range)} days`;
	const unknown = n('unknown');
	if (unknown === list.length)
		return 'Not enough data yet for any company. Trends need a count from the start of the window.';
	return unknown === 0 ? `${known}.` : `${known}; ${String(unknown)} without enough data yet.`;
}
