// `npm run eval:labels` (design note 0008, step 7b): exports the production
// database to a file on this machine, reads my profile and every job I saved,
// passed or applied to with the app's own code, writes
// evals/private/labels.json, and deletes the export. evals/private/ is
// ignored by git: my facts and job history never go in the repo.
//
// Needs wrangler to be logged in (the same as `npm run deploy`). With
// `-- --local` it reads the local dev database instead (seeded by
// `npm run e2e:seed`), to try the export without touching production.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { LabelFile } from '#lib/evals/labels.ts';
import { sqliteD1 } from '#lib/evals/sqlite-d1.ts';
import { labelledJobs } from '#lib/server/evals.ts';
import { scoringProfile } from '#lib/server/scoring.ts';

const DIR = 'evals/private';
const EXPORT = `${DIR}/job-ranger-export.sql`;
export const LABELS = `${DIR}/labels.json`;

export async function main(args: string[]): Promise<number> {
	const local = args.includes('--local');
	mkdirSync(DIR, { recursive: true });
	try {
		console.log(
			local
				? 'Exporting the local dev database…'
				: 'Exporting the production database to this machine (read only)…'
		);
		execFileSync(
			'wrangler',
			['d1', 'export', 'job-ranger', local ? '--local' : '--remote', `--output=${EXPORT}`],
			{ stdio: 'inherit' }
		);
		// An export lists tables and rows in its own order, so foreign keys are checked by the app, not here.
		const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
		database.exec(readFileSync(EXPORT, 'utf8'));
		const db = sqliteD1(database);
		const [profile, labelled] = await Promise.all([scoringProfile(db), labelledJobs(db)]);
		database.close();
		const file: LabelFile = { exportedAt: new Date().toISOString(), profile, ...labelled };
		writeFileSync(LABELS, `${JSON.stringify(file, null, '\t')}\n`);
		const wanted = file.labels.filter((label) => label.wanted).length;
		console.log(
			[
				`Wrote ${LABELS}: ${String(file.labels.length)} labelled jobs (${String(wanted)} wanted, ${String(file.labels.length - wanted)} not).`,
				`Left out: ${String(file.skipped.noText)} with no posting text, ${String(file.skipped.unclear)} withdrawn applications.`,
				`Profile: ${String(profile.facts.length)} confirmed facts, ${String(profile.interests.length)} interests, ${String(Object.keys(profile.preferences).length)} preferences.`,
				file.labels.length < 40
					? 'Fewer than 40 labels: the ranking numbers will be noisy. Saving or passing more jobs helps.'
					: ''
			]
				.filter((line) => line !== '')
				.join('\n')
		);
		return 0;
	} finally {
		rmSync(EXPORT, { force: true });
	}
}
