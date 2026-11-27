/**
 * Reading the labelled jobs for an eval run (design note 0008, step 7b):
 * every job I saved, passed or applied to, with the posting text kept when
 * it was fetched, so the evals don't depend on a job still being open.
 * `npm run eval:labels` runs this against a copy of the database on my
 * machine; the result never leaves it.
 */
import {
	markOf,
	statusOf,
	wantedFrom,
	type Labelled,
	type LabelledJob
} from '#lib/evals/labels.ts';
import { text } from './db.ts';

type Row = Record<string, unknown>;

const optional = (row: Row, column: string): string | null =>
	typeof row[column] === 'string' ? row[column] : null;

export async function labelledJobs(db: D1Database): Promise<Labelled> {
	const { results } = await db
		.prepare(
			`SELECT p.source, p.board, p.id, p.title, p.company, p.location, p.workplace, p.department,
			 t.text, m.mark, a.status
			 FROM postings p
			 LEFT JOIN job_marks m ON m.source = p.source AND m.board = p.board AND m.posting_id = p.id
			 LEFT JOIN applications a ON a.source = p.source AND a.board = p.board AND a.posting_id = p.id
			 LEFT JOIN posting_texts t ON t.source = p.source AND t.board = p.board AND t.id = p.id
			 WHERE m.mark IS NOT NULL OR a.status IS NOT NULL
			 ORDER BY p.source, p.board, p.id`
		)
		.all<Row>();
	const labels: LabelledJob[] = [];
	let noText = 0;
	let unclear = 0;
	for (const row of results) {
		const wanted = wantedFrom(markOf(row['mark']), statusOf(row['status']));
		const postingText = optional(row, 'text');
		if (wanted === null) unclear++;
		else if (postingText === null) noText++;
		else {
			labels.push({
				key: `${text(row, 'source')}:${text(row, 'board')}:${text(row, 'id')}`,
				wanted,
				job: {
					title: text(row, 'title'),
					company: text(row, 'company'),
					location: text(row, 'location'),
					workplace: text(row, 'workplace'),
					department: optional(row, 'department'),
					postingText
				}
			});
		}
	}
	return { labels, skipped: { noText, unclear } };
}
