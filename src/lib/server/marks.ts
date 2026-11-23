/**
 * Saved and passed jobs (design note 0006, part 1): one mark per job, with
 * the date and, for a pass, an optional note saying why.
 */
import { text } from './db.ts';
import { getPosting, type JobKey, type Result } from './kits.ts';

export type Mark = 'saved' | 'passed';

/** Longest note kept with a mark. */
export const NOTE_MAX = 300;

export interface JobMark {
	readonly mark: Mark;
	readonly note: string;
	readonly at: string;
}

type Row = Record<string, unknown>;

/** Every mark, by job key ("ashby:example:abc"), for the Jobs page. */
export async function jobMarks(db: D1Database): Promise<Map<string, JobMark>> {
	const { results } = await db
		.prepare('SELECT source, board, posting_id, mark, note, marked_at FROM job_marks')
		.all<Row>();
	return new Map(
		results.map((row) => {
			// The table only allows these two (migration 0017).
			const mark: Mark = row['mark'] === 'passed' ? 'passed' : 'saved';
			return [
				`${text(row, 'source')}:${text(row, 'board')}:${text(row, 'posting_id')}`,
				{ mark, note: text(row, 'note'), at: text(row, 'marked_at') }
			];
		})
	);
}

/** Saves a job, or passes on it with an optional note. A new mark replaces the old one. */
export async function markJob(
	db: D1Database,
	key: JobKey,
	mark: Mark,
	note: string,
	now: string
): Promise<Result> {
	const posting = await getPosting(db, key);
	if (!posting) return { ok: false, message: 'That job is no longer in Job Ranger.' };
	const why = mark === 'passed' ? note.replace(/\s+/g, ' ').trim() : '';
	if (why.length > NOTE_MAX) {
		return {
			ok: false,
			message: `That note is ${String(why.length)} characters. Keep it under ${String(NOTE_MAX)}.`
		};
	}
	await db
		.prepare(
			`INSERT INTO job_marks (source, board, posting_id, mark, note, marked_at)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
			 ON CONFLICT (source, board, posting_id) DO UPDATE SET mark = excluded.mark,
			 note = excluded.note, marked_at = excluded.marked_at`
		)
		.bind(key.source, key.board, key.id, mark, why, now)
		.run();
	const job = `${posting.title} at ${posting.company}`;
	return {
		ok: true,
		message:
			mark === 'saved'
				? `Saved ${job}.`
				: `Passed on ${job}. It’s off the list; choose “Passed only” to see it again.`
	};
}

/** Takes the mark off a job: unsaved, or back on the list. */
export async function clearMark(db: D1Database, key: JobKey): Promise<Result> {
	const row = await db
		.prepare(
			`DELETE FROM job_marks WHERE source = ?1 AND board = ?2 AND posting_id = ?3 RETURNING mark`
		)
		.bind(key.source, key.board, key.id)
		.first<Row>();
	if (row === null) return { ok: true, message: 'That job had no mark.' };
	return {
		ok: true,
		message:
			row['mark'] === 'passed' ? 'That job is back on the list.' : 'That job is no longer saved.'
	};
}
