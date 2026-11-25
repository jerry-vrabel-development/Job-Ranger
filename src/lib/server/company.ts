/**
 * Everything the company page shows about one board (design note 0007), read
 * in one batch when the page loads: how its last fetch went, its daily
 * counts, its open jobs, the jobs that closed lately, and what I marked.
 * Applications come from listApplications, which checks every row.
 * What it all means is in #lib/insights/company.ts.
 */
import type { Mark } from '#lib/insights/company.ts';
import type { DayCount } from '#lib/insights/trend.ts';
import type { Source } from '#lib/jobs/posting.ts';
import type { StoredPosting } from '#lib/jobs/sync.ts';
import { count, findBoard, rowsOf, text, toStoredPosting, type BoardStatus } from './db.ts';

export interface CompanyDetail {
	readonly board: BoardStatus;
	/** Daily open-job counts since the given day, oldest first. */
	readonly counts: readonly DayCount[];
	/** Open jobs, newest first. */
	readonly open: readonly StoredPosting[];
	/** Jobs that closed since the given day, most recent first. */
	readonly closed: readonly {
		readonly id: string;
		readonly title: string;
		readonly closedAt: string;
	}[];
	readonly marks: readonly Mark[];
}

/** One company's page, or null when the board isn't on my list. */
export async function companyDetail(
	db: D1Database,
	source: Source,
	token: string,
	since: string
): Promise<CompanyDetail | null> {
	const board = await findBoard(db, source, token);
	if (board === null) return null;
	const [counts, open, closed, marks] = await db.batch<Record<string, unknown>>([
		db
			.prepare(
				`SELECT day, open_jobs FROM board_counts
				 WHERE source = ?1 AND board = ?2 AND day >= ?3 ORDER BY day`
			)
			.bind(source, token, since),
		db
			.prepare(
				`SELECT * FROM postings WHERE source = ?1 AND board = ?2 AND closed_at IS NULL
				 ORDER BY COALESCE(posted_at, first_seen_at) DESC, title`
			)
			.bind(source, token),
		db
			.prepare(
				`SELECT id, title, closed_at FROM postings
				 WHERE source = ?1 AND board = ?2 AND closed_at >= ?3 ORDER BY closed_at DESC, title`
			)
			.bind(source, token, since),
		db
			.prepare(
				`SELECT m.posting_id, p.title, m.mark, m.note, m.marked_at FROM job_marks m
				 JOIN postings p ON p.source = m.source AND p.board = m.board AND p.id = m.posting_id
				 WHERE m.source = ?1 AND m.board = ?2`
			)
			.bind(source, token)
	]);
	return {
		board,
		counts: rowsOf(counts).map((row) => ({
			day: text(row, 'day'),
			openJobs: count(row, 'open_jobs')
		})),
		open: rowsOf(open).map(toStoredPosting),
		closed: rowsOf(closed).map((row) => ({
			id: text(row, 'id'),
			title: text(row, 'title'),
			closedAt: text(row, 'closed_at')
		})),
		marks: rowsOf(marks).map((row) => ({
			id: text(row, 'posting_id'),
			title: text(row, 'title'),
			// The table only allows these two (migration 0017).
			mark: row['mark'] === 'passed' ? 'passed' : 'saved',
			note: text(row, 'note'),
			at: text(row, 'marked_at')
		}))
	};
}
