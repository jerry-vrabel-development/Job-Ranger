/**
 * Applications after I apply (design note 0006, part 2): their status, the
 * note with it, and follow-ups. Where each stands ("No reply", follow up now)
 * is worked out in #lib/tracking/standing.ts from these dates.
 */
import { isSource, type Source } from '#lib/jobs/posting.ts';
import { isStatus, STATUS_WORDS, type Status, type Tracked } from '#lib/tracking/standing.ts';
import { StoredDataError, text } from './db.ts';
import type { JobKey, Result } from './kits.ts';

/** Longest note kept with a status. */
export const STATUS_NOTE_MAX = 300;

export interface TrackedApplication extends Tracked {
	readonly source: Source;
	readonly board: string;
	readonly id: string;
	readonly company: string;
	readonly title: string;
	readonly note: string;
}

type Row = Record<string, unknown>;

const orNull = (row: Row, key: string) => {
	const value = row[key];
	return typeof value === 'string' ? value : null;
};

function toTracked(row: Row): TrackedApplication {
	const source = row['source'];
	const status = row['status'];
	if (!isSource(source) || !isStatus(status)) {
		throw new StoredDataError('an application has an unknown source or status');
	}
	return {
		source,
		board: text(row, 'board'),
		id: text(row, 'posting_id'),
		company: text(row, 'company'),
		title: text(row, 'title'),
		status,
		appliedAt: text(row, 'applied_at'),
		statusAt: orNull(row, 'status_at'),
		followedUpAt: orNull(row, 'followed_up_at'),
		note: text(row, 'status_note')
	};
}

const COLUMNS = `source, board, posting_id, company, title, status, applied_at, status_at,
	followed_up_at, status_note`;
const WHERE = 'source = ?1 AND board = ?2 AND posting_id = ?3';

/** Every application, most recent first. */
export async function listApplications(db: D1Database): Promise<TrackedApplication[]> {
	const { results } = await db
		.prepare(`SELECT ${COLUMNS} FROM applications ORDER BY applied_at DESC, title`)
		.all<Row>();
	return results.map(toTracked);
}

export async function getTracked(db: D1Database, key: JobKey): Promise<TrackedApplication | null> {
	const row = await db
		.prepare(`SELECT ${COLUMNS} FROM applications WHERE ${WHERE}`)
		.bind(key.source, key.board, key.id)
		.first<Row>();
	return row === null ? null : toTracked(row);
}

const NONE: Result = { ok: false, message: 'There’s no application recorded for this job.' };

/** Moves an application on (or back), with an optional note. The date is today. */
export async function setStatus(
	db: D1Database,
	key: JobKey,
	status: Status,
	note: string,
	now: string
): Promise<Result> {
	const why = note.replace(/\s+/g, ' ').trim();
	if (why.length > STATUS_NOTE_MAX) {
		return {
			ok: false,
			message: `That note is ${String(why.length)} characters. Keep it under ${String(STATUS_NOTE_MAX)}.`
		};
	}
	const row = await db
		.prepare(
			`UPDATE applications SET status = ?4, status_note = ?5, status_at = ?6 WHERE ${WHERE}
			 RETURNING title, company`
		)
		.bind(key.source, key.board, key.id, status, why, now)
		.first<Row>();
	if (row === null) return NONE;
	return {
		ok: true,
		message: `${text(row, 'title')} at ${text(row, 'company')}: ${STATUS_WORDS[status]}.`
	};
}

/** Records that I followed up today. */
export async function followedUp(db: D1Database, key: JobKey, now: string): Promise<Result> {
	const row = await db
		.prepare(`UPDATE applications SET followed_up_at = ?4 WHERE ${WHERE} RETURNING title`)
		.bind(key.source, key.board, key.id, now)
		.first<Row>();
	if (row === null) return NONE;
	return { ok: true, message: `Recorded your follow-up on ${text(row, 'title')}.` };
}
