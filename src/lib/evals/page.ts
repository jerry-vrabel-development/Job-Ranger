/**
 * The eval page (design note 0008, step 7c): each published run side by
 * side, beside keyword matching on the made-up postings, worked out live so
 * the page has real numbers before any model run is published. Everything
 * here is words and counts; the page only lays them out.
 */
import { baselineScore } from '#lib/scoring/baseline.ts';
import {
	checkFixedSet,
	FIXED_CASES,
	FIXED_PROFILE,
	type CaseResult,
	type FixedCase
} from './fixed-set.ts';
import { average, decimal, gap, passed, percent, perCall, seconds } from './format.ts';
import type { Ranking } from './metrics.ts';
import type { Runs } from './published.ts';
import type { PublishedRun } from './run.ts';

/** Columns get narrow on a phone; older runs stay in evals/results/. */
export const RUNS_SHOWN = 3;

export interface Column {
	readonly title: string;
	/** When, which prompt, what it cost: in words. */
	readonly detail: string;
}

export interface Row {
	readonly label: string;
	readonly cells: readonly string[];
}

export interface CaseRow {
	readonly id: string;
	readonly name: string;
	readonly expected: string;
	readonly cells: readonly string[];
}

/** One measure on my labels: per run, the model and keyword matching on the same jobs. */
export interface PairRow {
	readonly label: string;
	readonly cells: readonly { readonly model: string; readonly keywords: string }[];
}

export interface EvalPage {
	readonly status: string;
	readonly fixedColumns: readonly Column[];
	readonly fixedRows: readonly Row[];
	readonly caseRows: readonly CaseRow[];
	readonly runColumns: readonly Column[];
	/** Per run: how many labelled jobs it scored, or that it had none. */
	readonly labelNotes: readonly string[];
	/** Null when no shown run had labels. */
	readonly labelRows: readonly PairRow[] | null;
	readonly answerRows: readonly Row[];
}

const day = (at: string) =>
	new Date(at).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC'
	});

const runColumn = (run: PublishedRun): Column => ({
	title: run.model,
	detail: `${day(run.at)} · prompt ${run.promptVersion} · ${String(run.made)} calls`
});

/** A run's result for a case; a case added after the run says so, not "miss". */
function cell(result: CaseResult | undefined): string {
	if (result === undefined) return 'not in this run';
	if (result.score === null) return 'no answer, miss';
	return `${String(result.score)}, ${result.pass ? 'pass' : 'miss'}`;
}

function status(shown: number, total: number, skipped: number): string {
	const runs =
		total === 0
			? 'No model run is published yet. Keyword matching’s results are below; each published run gets a column beside it.'
			: total > shown
				? `${String(total)} published runs. The newest ${String(shown)} are shown.`
				: `${String(total)} published ${total === 1 ? 'run' : 'runs'}.`;
	return skipped === 0
		? runs
		: `${runs} ${String(skipped)} ${skipped === 1 ? 'file' : 'files'} in evals/results couldn’t be read and ${skipped === 1 ? 'is' : 'are'} left out.`;
}

const RANKING_ROWS: readonly [string, (ranking: Ranking) => string][] = [
	['Wanted jobs in the top 10', (r) => percent(r.recall[10])],
	['Wanted jobs in the top 25', (r) => percent(r.recall[25])],
	['Order (NDCG, 1 is perfect)', (r) => decimal(r.ndcg)],
	['Average score, wanted', (r) => average(r.separation.wanted)],
	['Average score, not wanted', (r) => average(r.separation.notWanted)],
	['Gap (wanted minus not)', (r) => gap(r.separation.gap)]
];

export function evalPage(
	{ runs, skipped }: Runs,
	cases: readonly FixedCase[] = FIXED_CASES
): EvalPage {
	const shown = runs.slice(0, RUNS_SHOWN);
	const keywords = checkFixedSet(
		new Map(cases.map((c) => [c.id, baselineScore(c.job, FIXED_PROFILE).score])),
		cases
	);
	const results = [keywords, ...shown.map((run) => run.fixed.model)];
	const byId = results.map((list) => new Map(list.map((r) => [r.id, r])));
	const withLabels = shown.some((run) => run.labels !== null);

	return {
		status: status(shown.length, runs.length, skipped),
		fixedColumns: [
			{ title: 'Keyword matching', detail: 'Worked out now, free' },
			...shown.map(runColumn)
		],
		fixedRows: [
			{ label: 'All cases', cells: results.map((list) => passed(list)) },
			{ label: 'Fits', cells: results.map((list) => passed(list, 'fit')) },
			{ label: 'Misses', cells: results.map((list) => passed(list, 'miss')) },
			{ label: 'Traps', cells: results.map((list) => passed(list, 'trap')) }
		],
		caseRows: cases.map((c) => ({
			id: c.id,
			name: c.name,
			expected: `${String(c.expected.min)}–${String(c.expected.max)}`,
			cells: byId.map((map) => cell(map.get(c.id)))
		})),
		runColumns: shown.map(runColumn),
		labelNotes: shown.map((run) =>
			run.labels === null
				? 'No labelled jobs in this run.'
				: `${String(run.labels.scored)} labelled jobs, ${String(run.labels.wanted)} wanted.`
		),
		labelRows: withLabels
			? RANKING_ROWS.map(([label, show]) => ({
					label,
					cells: shown.map((run) =>
						run.labels === null
							? { model: '—', keywords: '—' }
							: { model: show(run.labels.model), keywords: show(run.labels.baseline) }
					)
				}))
			: null,
		answerRows: [
			{
				label: 'Reasons with a citation code dropped',
				cells: shown.map((r) => percent(r.quality.faithfulness))
			},
			{
				label: 'Answers above grade 8 reading level',
				cells: shown.map((r) => percent(r.quality.hardToRead))
			},
			{
				label: 'Answers that couldn’t be used',
				cells: shown.map((r) => percent(r.quality.unusable))
			},
			{
				label: 'Scores that moved by more than 1',
				cells: shown.map((r) => percent(r.quality.unstable))
			},
			{ label: 'Cost per call', cells: shown.map((r) => perCall(r.quality.costs.microsPerJob)) },
			{ label: 'Time per call', cells: shown.map((r) => seconds(r.quality.costs.msPerJob)) }
		]
	};
}
