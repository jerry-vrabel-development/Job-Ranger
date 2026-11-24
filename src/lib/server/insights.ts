/**
 * The counts behind the Insights page (design note 0007), read when the page
 * loads, so they can't go stale. What they mean is in #lib/insights/.
 */
import type { SearchCounts } from '#lib/insights/search.ts';
import type { DayCount } from '#lib/insights/trend.ts';
import type { Source } from '#lib/jobs/posting.ts';
import { count, source as sourceOf, text } from './db.ts';

export async function searchCounts(db: D1Database): Promise<SearchCounts> {
	const row = await db
		.prepare(
			`SELECT
				(SELECT COUNT(*) FROM postings) AS found,
				(SELECT COUNT(*) FROM postings WHERE closed_at IS NULL) AS open,
				(SELECT COUNT(*) FROM (
					SELECT source, board, posting_id FROM job_marks WHERE mark = 'saved'
					UNION SELECT source, board, posting_id FROM applications
				)) AS saved,
				(SELECT COUNT(*) FROM applications) AS applied,
				(SELECT COUNT(*) FROM applications
					WHERE status IN ('interviewing', 'offer', 'rejected')) AS replied,
				(SELECT COUNT(*) FROM applications
					WHERE status IN ('interviewing', 'offer')) AS interviewing,
				(SELECT COUNT(*) FROM applications WHERE status = 'offer') AS offers`
		)
		.first();
	return {
		found: count(row, 'found'),
		open: count(row, 'open'),
		saved: count(row, 'saved'),
		applied: count(row, 'applied'),
		replied: count(row, 'replied'),
		interviewing: count(row, 'interviewing'),
		offers: count(row, 'offers')
	};
}

export interface CompanyCounts {
	readonly source: Source;
	readonly board: string;
	readonly company: string;
	/** Daily open-job counts since the given day, oldest first. Empty if there are none yet. */
	readonly counts: DayCount[];
}

/**
 * Every company I'm watching (paused ones aren't fetched, so they're left
 * out), with its daily counts since a day. One query, grouped here.
 */
export async function companyCounts(db: D1Database, since: string): Promise<CompanyCounts[]> {
	const { results } = await db
		.prepare(
			`SELECT b.source, b.token, b.company, c.day, c.open_jobs
			 FROM boards b
			 LEFT JOIN board_counts c ON c.source = b.source AND c.board = b.token AND c.day >= ?1
			 WHERE b.paused = 0
			 ORDER BY b.company, b.source, b.token, c.day`
		)
		.bind(since)
		.all();
	const companies = new Map<string, CompanyCounts>();
	for (const row of results) {
		const source = sourceOf(row);
		const board = text(row, 'token');
		const key = `${source}:${board}`;
		let entry = companies.get(key);
		if (entry === undefined) {
			entry = { source, board, company: text(row, 'company'), counts: [] };
			companies.set(key, entry);
		}
		if (row['day'] !== null) {
			entry.counts.push({ day: text(row, 'day'), openJobs: count(row, 'open_jobs') });
		}
	}
	return [...companies.values()];
}
