/**
 * The short Markdown report committed next to each published run's JSON
 * (design note 0008). It reads from the published run only, so it can't
 * show a job key, a title or the model's words about a real job.
 */
import { dollars } from '#lib/money.ts';
import type { CaseResult, FixedCase } from './fixed-set.ts';
import { average, decimal, gap, outcome, passed, percent, perCall, seconds } from './format.ts';
import type { Ranking } from './metrics.ts';
import type { PublishedRun } from './run.ts';

const row = (cells: readonly string[]) => `| ${cells.join(' | ')} |`;

function rankingRows(model: Ranking, baseline: Ranking): string[] {
	return [
		row(['', 'Model', 'Keyword baseline']),
		row(['---', '---', '---']),
		row(['Wanted jobs in the top 10', percent(model.recall[10]), percent(baseline.recall[10])]),
		row(['Wanted jobs in the top 25', percent(model.recall[25]), percent(baseline.recall[25])]),
		row(['NDCG (1 is perfect order)', decimal(model.ndcg), decimal(baseline.ndcg)]),
		row([
			'Average score, wanted',
			average(model.separation.wanted),
			average(baseline.separation.wanted)
		]),
		row([
			'Average score, not wanted',
			average(model.separation.notWanted),
			average(baseline.separation.notWanted)
		]),
		row(['Gap (wanted minus not)', gap(model.separation.gap), gap(baseline.separation.gap)])
	];
}

export function reportMarkdown(run: PublishedRun, cases: readonly FixedCase[]): string {
	const { fixed, labels, quality } = run;
	const byId = (results: readonly CaseResult[]) => new Map(results.map((r) => [r.id, r]));
	const model = byId(fixed.model);
	const baseline = byId(fixed.baseline);
	const lines = [
		`# Eval run: ${run.model}, prompt ${run.promptVersion}`,
		'',
		`${run.at.slice(0, 10)}. ${String(run.made)} of ${String(run.planned)} calls made, ${dollars(run.spentMicros)} spent.`,
		...(run.stopped === null ? [] : ['', `**Stopped early.** ${run.stopped}`]),
		'',
		'Every number says how many items it rests on. With few labels the numbers are noisy.',
		'',
		`## Fixed set (${String(cases.length)} made-up postings)`,
		'',
		row(['', 'Model', 'Keyword baseline']),
		row(['---', '---', '---']),
		row(['All cases', passed(fixed.model), passed(fixed.baseline)]),
		row(['Fits', passed(fixed.model, 'fit'), passed(fixed.baseline, 'fit')]),
		row(['Misses', passed(fixed.model, 'miss'), passed(fixed.baseline, 'miss')]),
		row(['Traps', passed(fixed.model, 'trap'), passed(fixed.baseline, 'trap')]),
		'',
		row(['Case', 'What it tests', 'Expected', 'Model', 'Keyword baseline']),
		row(['---', '---', '---', '---', '---']),
		...cases.map((c) =>
			row([
				c.id,
				c.name,
				`${String(c.expected.min)}–${String(c.expected.max)}`,
				outcome(model.get(c.id)),
				outcome(baseline.get(c.id))
			])
		),
		'',
		'## My labelled jobs',
		''
	];
	if (labels === null) {
		lines.push('Not run: no labels were exported.');
	} else {
		const { noText, unclear } = labels.skipped;
		lines.push(
			`${String(labels.scored)} of ${String(labels.exported)} labelled jobs scored, ${String(labels.wanted)} of them wanted. Left out at export: ${String(noText)} with no posting text, ${String(unclear)} withdrawn applications.`,
			'',
			...rankingRows(labels.model, labels.baseline)
		);
	}
	lines.push(
		'',
		'## The model’s answers',
		'',
		row(['', 'Result', 'Aim']),
		row(['---', '---', '---']),
		row(['Reasons with a citation code dropped', percent(quality.faithfulness), 'near 0']),
		row(['Answers that read above grade 8', percent(quality.hardToRead), 'low']),
		row(['Answers that couldn’t be used', percent(quality.unusable), 'near 0']),
		row(['Fixed-set jobs whose score moved by more than 1', percent(quality.unstable), 'near 0']),
		row(['Cost per call', perCall(quality.costs.microsPerJob), '']),
		row(['Time per call', seconds(quality.costs.msPerJob), '']),
		''
	);
	return lines.join('\n');
}
