/**
 * The counts behind the Insights page (design note 0007), read when the page
 * loads, so they can't go stale. What they mean is in #lib/insights/.
 */
import type { MarketCounts } from '#lib/insights/market.ts';
import type { SearchCounts } from '#lib/insights/search.ts';
import type { CheckedJob, OpenJob } from '#lib/insights/signals.ts';
import type { DayCount } from '#lib/insights/trend.ts';
import type { Source } from '#lib/jobs/posting.ts';
import { scamSignals } from '#lib/signals/scam.ts';
import { count, rowsOf, source as sourceOf, text, toStoredPosting, workplace } from './db.ts';

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

/** Open postings on boards I'm watching (paused boards aren't fetched, so they're left out). */
const WATCHED_OPEN = `FROM postings p JOIN boards b ON b.source = p.source AND b.token = p.board
	WHERE p.closed_at IS NULL AND b.paused = 0`;

/** The open jobs I'm watching, by company and by workplace, and how many post pay. */
export async function marketCounts(db: D1Database): Promise<MarketCounts> {
	const [companies, workplaces, pay] = await db.batch<Record<string, unknown>>([
		db.prepare(
			`SELECT b.company, COUNT(p.id) AS open
			 FROM boards b
			 LEFT JOIN postings p ON p.source = b.source AND p.board = b.token AND p.closed_at IS NULL
			 WHERE b.paused = 0
			 GROUP BY b.source, b.token`
		),
		db.prepare(`SELECT p.workplace, COUNT(*) AS open ${WATCHED_OPEN} GROUP BY p.workplace`),
		db.prepare(
			`SELECT
				COUNT(CASE WHEN p.source <> 'greenhouse' THEN 1 END) AS listed,
				COUNT(CASE WHEN p.source <> 'greenhouse' AND p.pay_summary IS NOT NULL THEN 1 END) AS posted,
				COUNT(CASE WHEN p.source = 'greenhouse' THEN 1 END) AS unlisted
			 ${WATCHED_OPEN}`
		)
	]);
	const payRow = rowsOf(pay)[0];
	return {
		byCompany: rowsOf(companies).map((row) => ({
			company: text(row, 'company'),
			open: count(row, 'open')
		})),
		byWorkplace: rowsOf(workplaces).map((row) => ({
			workplace: workplace(row),
			open: count(row, 'open')
		})),
		payListed: count(payRow, 'listed'),
		payPosted: count(payRow, 'posted'),
		payUnlisted: count(payRow, 'unlisted')
	};
}

/** Every open job on a board I watch, for the signal rules (they're code, not SQL). */
export async function openJobs(db: D1Database): Promise<OpenJob[]> {
	const { results } = await db
		.prepare(`SELECT p.* ${WATCHED_OPEN} ORDER BY p.company, p.title`)
		.all();
	return results.map(toStoredPosting);
}

/**
 * Open jobs on watched boards whose full text I've pasted or read into an apply
 * kit, with the scam patterns found in it. Only these can be checked.
 */
export async function checkedJobs(db: D1Database): Promise<CheckedJob[]> {
	const { results } = await db
		.prepare(
			`SELECT p.source, p.board, p.id, p.company, p.title, k.posting_text
			 FROM kits k
			 JOIN postings p ON p.source = k.source AND p.board = k.board AND p.id = k.posting_id
			 JOIN boards b ON b.source = p.source AND b.token = p.board
			 WHERE k.posting_text <> '' AND p.closed_at IS NULL AND b.paused = 0`
		)
		.all();
	return results.map((row) => ({
		source: sourceOf(row),
		board: text(row, 'board'),
		id: text(row, 'id'),
		company: text(row, 'company'),
		title: text(row, 'title'),
		flags: scamSignals(text(row, 'posting_text'))
	}));
}

/** Drafting spend today, this month (both UTC, like the daily cap) and in all, in millionths of a dollar. */
export async function spendingTotals(
	db: D1Database,
	today: string
): Promise<{ today: number; month: number; total: number }> {
	const row = await db
		.prepare(
			`SELECT
				COALESCE(SUM(CASE WHEN day = ?1 THEN cost_micros END), 0) AS today,
				COALESCE(SUM(CASE WHEN substr(day, 1, 7) = substr(?1, 1, 7) THEN cost_micros END), 0) AS month,
				COALESCE(SUM(cost_micros), 0) AS total
			 FROM model_usage`
		)
		.bind(today)
		.first();
	return { today: count(row, 'today'), month: count(row, 'month'), total: count(row, 'total') };
}
