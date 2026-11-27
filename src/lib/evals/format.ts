/**
 * How eval numbers are written, shared by the Markdown report and the eval
 * page so they always read the same. A number with nothing under it is a
 * dash, never a zero, and every number says how many items it rests on.
 */
import type { CaseKind, CaseResult } from './fixed-set.ts';
import type { Mean, Share } from './metrics.ts';

export const percent = ({ share, of }: Share): string =>
	share === null ? '— (none)' : `${String(Math.round(share * 100))}% (of ${String(of)})`;

export const decimal = ({ share, of }: Share): string =>
	share === null ? '— (none)' : `${share.toFixed(2)} (of ${String(of)})`;

export const average = ({ mean, of }: Mean): string =>
	mean === null ? '— (none)' : `${mean.toFixed(1)} (of ${String(of)})`;

export const gap = (value: number | null): string => (value === null ? '—' : value.toFixed(1));

/** Per-call costs are fractions of a cent, so four places. */
export const perCall = ({ mean }: Mean): string =>
	mean === null ? '—' : `$${(mean / 1_000_000).toFixed(4)}`;

export const seconds = ({ mean }: Mean): string =>
	mean === null ? '—' : `${(mean / 1000).toFixed(1)} s`;

/** "11 of 13", for all cases or one kind. */
export function passed(results: readonly CaseResult[], kind?: CaseKind): string {
	const some = kind === undefined ? results : results.filter((r) => r.kind === kind);
	return `${String(some.filter((r) => r.pass).length)} of ${String(some.length)}`;
}

/** "4, pass", in words, so the result never rests on color. */
export function outcome(result: CaseResult | undefined): string {
	if (result === undefined || result.score === null) return 'no answer, miss';
	return `${String(result.score)}, ${result.pass ? 'pass' : 'miss'}`;
}
