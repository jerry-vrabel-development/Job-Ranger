import { describe, expect, it } from 'vitest';
import { FIXED_CASES } from './fixed-set.ts';
import { evalPage, RUNS_SHOWN } from './page.ts';
import { sampleRun } from './testing.ts';

describe('evalPage', () => {
	it('shows keyword matching on its own before any run is published', () => {
		const page = evalPage({ runs: [], skipped: 0 });
		expect(page.status).toBe(
			'No model run is published yet. Keyword matching’s results are below; each published run gets a column beside it.'
		);
		expect(page.fixedColumns).toEqual([
			{ title: 'Keyword matching', detail: 'Worked out now, free' }
		]);
		expect(page.fixedRows).toEqual([
			{ label: 'All cases', cells: ['7 of 13'] },
			{ label: 'Fits', cells: ['2 of 3'] },
			{ label: 'Misses', cells: ['3 of 3'] },
			{ label: 'Traps', cells: ['2 of 7'] }
		]);
		expect(page.caseRows[0]).toEqual({
			id: 'fit-civic-forms',
			name: 'civic forms in my stack',
			expected: '4–5',
			cells: ['5, pass']
		});
		expect(page.runColumns).toEqual([]);
		expect(page.labelRows).toBeNull();
		expect(page.answerRows[0]).toEqual({
			label: 'Reasons with a citation code dropped',
			cells: []
		});
	});

	it('puts each run beside keyword matching, newest first, with labels where a run has them', async () => {
		const withLabels = await sampleRun(4, { withLabels: true, model: 'claude-sonnet-5-5' });
		const fixedOnly = await sampleRun(3, { at: '2026-11-20T12:00:00.000Z' });
		const page = evalPage({ runs: [withLabels, fixedOnly], skipped: 0 });

		expect(page.status).toBe('2 published runs.');
		expect(page.runColumns).toEqual([
			{
				title: 'claude-sonnet-5-5',
				detail: `Nov 27, 2026 · prompt ${withLabels.promptVersion} · 17 calls`
			},
			{
				title: 'claude-haiku-5-5',
				detail: `Nov 20, 2026 · prompt ${fixedOnly.promptVersion} · 13 calls`
			}
		]);
		expect(page.fixedColumns).toHaveLength(3);
		expect(page.fixedRows[0]).toEqual({
			label: 'All cases',
			cells: ['7 of 13', '4 of 13', '5 of 13']
		});
		expect(page.caseRows[0]?.cells).toEqual(['5, pass', '4, pass', '3, miss']);
		expect(page.labelNotes).toEqual([
			'4 labelled jobs, 3 wanted.',
			'No labelled jobs in this run.'
		]);
		expect(page.labelRows?.[0]).toEqual({
			label: 'Wanted jobs in the top 10',
			cells: [
				{ model: '100% (of 3)', keywords: '100% (of 3)' },
				{ model: '—', keywords: '—' }
			]
		});
		expect(page.labelRows?.map((row) => row.label)).toEqual([
			'Wanted jobs in the top 10',
			'Wanted jobs in the top 25',
			'Order (NDCG, 1 is perfect)',
			'Average score, wanted',
			'Average score, not wanted',
			'Gap (wanted minus not)'
		]);
		expect(page.answerRows.map((row) => row.cells[0])).toEqual([
			'0% (of 34)',
			'0% (of 17)',
			'0% (of 17)',
			'— (none)',
			'$0.0005',
			'1.2 s'
		]);
	});

	it('shows only the newest runs, and says when files were left out', async () => {
		const runs = await Promise.all(
			[4, 3, 2, 1].map((n) => sampleRun(3, { at: `2026-11-2${String(n)}T12:00:00.000Z` }))
		);
		const page = evalPage({ runs, skipped: 1 });
		expect(page.runColumns).toHaveLength(RUNS_SHOWN);
		expect(page.status).toBe(
			'4 published runs. The newest 3 are shown. 1 file in evals/results couldn’t be read and is left out.'
		);
		const one = evalPage({ runs: runs.slice(0, 1), skipped: 2 });
		expect(one.status).toBe(
			'1 published run. 2 files in evals/results couldn’t be read and are left out.'
		);
	});

	it('says when a run has no answer for a case, or ran before the case existed', async () => {
		const run = await sampleRun(4);
		const noAnswer = {
			...run,
			fixed: {
				...run.fixed,
				model: run.fixed.model.map((r) => ({ ...r, score: null, pass: false }))
			}
		};
		const [first] = FIXED_CASES;
		if (first === undefined) throw new Error('no cases');
		const page = evalPage({ runs: [noAnswer], skipped: 0 }, [
			...FIXED_CASES,
			{ ...first, id: 'new-case' }
		]);
		expect(page.caseRows[0]?.cells[1]).toBe('no answer, miss');
		expect(page.caseRows.at(-1)?.cells).toEqual(['5, pass', 'not in this run']);
	});
});
