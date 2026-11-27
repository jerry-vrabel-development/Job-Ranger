// `npm run eval:score` (design note 0008, step 7b): scores the fixed set and
// my labelled jobs with a model and with the keyword baseline, and writes:
//   evals/results/<date>-<model>-<prompt>.json and .md: numbers and the
//     made-up cases only. Commit these to publish a run. A run that stopped
//     early (cap, error) goes to evals/private/stopped/ instead.
//   evals/private/runs/<same>.json: every call, with the model's words about
//     real jobs. Ignored by git.
//
// The key comes from the shell, never a file or a chat. To set it for this
// terminal only, without it showing on screen or in history:
//   read -rs ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY
//
// Options: --model <id> (default claude-haiku-5-5), --repeat <n> (fixed set
// passes, default 3), --max-usd <n> (default 1), --fixed-only, --yes (don't
// ask before starting).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { FIXED_CASES, FIXED_PROFILE } from '#lib/evals/fixed-set.ts';
import type { LabelFile } from '#lib/evals/labels.ts';
import { reportMarkdown } from '#lib/evals/report.ts';
import { plannedCalls, published, runEval, TYPICAL_CALL } from '#lib/evals/run.ts';
import { anthropic } from '#lib/models/anthropic.ts';
import { priceCall, priceOf, PRICES } from '#lib/models/prices.ts';
import { askModel } from '#lib/scoring/ask.ts';
import { PROMPT_VERSION } from '#lib/scoring/score.ts';

const LABELS = 'evals/private/labels.json';

const money = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`;

export async function main(args: string[]): Promise<number> {
	const { values } = parseArgs({
		args,
		options: {
			model: { type: 'string', default: 'claude-haiku-5-5' },
			repeat: { type: 'string', default: '3' },
			'max-usd': { type: 'string', default: '1' },
			'fixed-only': { type: 'boolean', default: false },
			yes: { type: 'boolean', default: false }
		}
	});
	const apiKey = process.env['ANTHROPIC_API_KEY'] ?? '';
	if (apiKey === '') {
		console.error(
			'ANTHROPIC_API_KEY isn’t set in this terminal. Set it without it showing on screen:\n  read -rs ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY'
		);
		return 1;
	}
	const model = values.model;
	const price = priceOf(PRICES, model);
	if (price === null) {
		console.error(
			`“${model}” isn’t in the price table (src/lib/models/prices.json), so it can’t be called.`
		);
		return 1;
	}
	const repeat = Number(values.repeat);
	const maxUsd = Number(values['max-usd']);
	if (!Number.isInteger(repeat) || repeat < 1 || !(maxUsd > 0)) {
		console.error('--repeat must be a whole number from 1, and --max-usd a number above 0.');
		return 1;
	}

	let labels: LabelFile | null = null;
	if (!values['fixed-only']) {
		if (existsSync(LABELS)) labels = JSON.parse(readFileSync(LABELS, 'utf8')) as LabelFile;
		else
			console.log(`No ${LABELS} yet (run npm run eval:labels first). Scoring the fixed set only.`);
	}
	const calls = plannedCalls(FIXED_CASES.length, labels?.labels.length ?? 0, repeat);
	const estimate = priceCall(price, PRICES.version, TYPICAL_CALL).micros * calls;
	console.log(
		[
			`Model ${model}, prompt ${PROMPT_VERSION}.`,
			`${String(calls)} calls: the fixed set ${repeat === 1 ? 'once' : `${String(repeat)} times`}${labels === null ? '' : ` and ${String(labels.labels.length)} labelled jobs`}.`,
			`Estimated cost about ${money(estimate)}; it stops before going over ${money(maxUsd * 1_000_000)}.`
		].join('\n')
	);
	if (!values.yes) {
		const prompt = createInterface({ input: process.stdin, output: process.stdout });
		await prompt.question('Press Enter to start, or Ctrl+C to stop. ');
		prompt.close();
	}

	const adapter = anthropic(fetch);
	const run = await runEval({
		model,
		ask: (job, profile) => askModel({ adapter, model, apiKey }, job, profile),
		fixed: FIXED_CASES,
		fixedProfile: FIXED_PROFILE,
		labels,
		repeat,
		capMicros: Math.round(maxUsd * 1_000_000),
		now: new Date(),
		sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
		onCall: (made, planned) =>
			process.stdout.write(`\rCalls: ${String(made)} of ${String(planned)}`)
	});
	process.stdout.write('\n');

	// Only a finished run goes to evals/results/, so a stopped one can't be committed by accident.
	const name = `${run.at.slice(0, 10)}-${model}-${PROMPT_VERSION}`;
	const result = published(run);
	const where = run.stopped === null ? 'evals/results' : 'evals/private/stopped';
	mkdirSync(where, { recursive: true });
	mkdirSync('evals/private/runs', { recursive: true });
	writeFileSync(`${where}/${name}.json`, `${JSON.stringify(result, null, '\t')}\n`);
	writeFileSync(`${where}/${name}.md`, reportMarkdown(result, FIXED_CASES));
	writeFileSync(`evals/private/runs/${name}.json`, `${JSON.stringify(run, null, '\t')}\n`);

	const passes = (results: readonly { pass: boolean }[]) =>
		`${String(results.filter((r) => r.pass).length)} of ${String(results.length)}`;
	console.log(
		[
			run.stopped === null ? 'Finished.' : `Stopped early. ${run.stopped}`,
			`Fixed set: model ${passes(run.fixed.model)}, keyword baseline ${passes(run.fixed.baseline)}.`,
			`Spent ${money(run.spentMicros)}.`,
			run.stopped === null
				? `Report: ${where}/${name}.md (commit it and the .json to publish this run).`
				: `Report: ${where}/${name}.md (not in evals/results, because the run didn’t finish).`,
			`Every call, privately: evals/private/runs/${name}.json`
		].join('\n')
	);
	return run.stopped === null ? 0 : 1;
}
