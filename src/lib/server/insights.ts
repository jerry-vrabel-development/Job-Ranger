/**
 * The counts behind the Insights page (design note 0007), read in one query
 * when the page loads, so they can't go stale. What each step means is in
 * #lib/insights/search.ts.
 */
import type { SearchCounts } from '#lib/insights/search.ts';
import { count } from './db.ts';

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
