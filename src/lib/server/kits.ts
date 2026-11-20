/**
 * The apply kit (design note 0004, step 3, without a model): the form's
 * questions, the AI-rule check, and the record of what I applied to.
 */
import { SOURCE_NAMES, isSource, type Source } from '#lib/jobs/posting.ts';
import { findAiRule } from '#lib/kit/match.ts';
import {
	fetchGreenhouseJob,
	QUESTIONS_MAX,
	type FormQuestion
} from '#lib/sources/greenhouse-job.ts';
import { SourceFormatError, SourceHttpError } from '#lib/sources/source.ts';
import type { StoredPosting } from '#lib/jobs/sync.ts';
import { count, StoredDataError, text, toStoredPosting } from './db.ts';

export interface JobKey {
	readonly source: Source;
	readonly board: string;
	readonly id: string;
}

/** A job key from the address, or null if it can't be one. */
export function parseJobKey(source: string, board: string, id: string): JobKey | null {
	if (!isSource(source) || board === '' || board.length > 100 || id === '' || id.length > 200) {
		return null;
	}
	return { source, board, id };
}

export type AiRule = 'unknown' | 'none' | 'forbids';

export interface Kit {
	readonly questions: readonly FormQuestion[];
	readonly pasted: readonly string[];
	readonly readNote: string;
	readonly aiRule: AiRule;
	readonly aiSentence: string;
	readonly aiDecidedBy: 'check' | 'me' | null;
}

export interface Result {
	readonly ok: boolean;
	readonly message: string;
}

type Row = Record<string, unknown>;

const WHERE = 'source = ?1 AND board = ?2 AND posting_id = ?3';

/** The posting, open or closed, or null if it's gone. */
export async function getPosting(db: D1Database, key: JobKey): Promise<StoredPosting | null> {
	const row = await db
		.prepare('SELECT * FROM postings WHERE source = ?1 AND board = ?2 AND id = ?3')
		.bind(key.source, key.board, key.id)
		.first<Row>();
	return row === null ? null : toStoredPosting(row);
}

function isFormQuestion(item: unknown): item is FormQuestion {
	if (typeof item !== 'object' || item === null) return false;
	const question = item as Partial<Record<keyof FormQuestion, unknown>>;
	return (
		typeof question.label === 'string' &&
		typeof question.required === 'boolean' &&
		typeof question.basic === 'boolean'
	);
}

function questionsOf(value: string): FormQuestion[] {
	const parsed: unknown = JSON.parse(value);
	if (!Array.isArray(parsed) || !parsed.every(isFormQuestion)) {
		throw new StoredDataError('kit questions are not the shape we store');
	}
	return parsed.map(({ label, required, basic }) => ({ label, required, basic }));
}

function aiRuleOf(value: string): AiRule {
	if (value === 'unknown' || value === 'none' || value === 'forbids') return value;
	throw new StoredDataError('kit ai_rule is not one we know');
}

export async function getKit(db: D1Database, key: JobKey): Promise<Kit | null> {
	const row = await db
		.prepare(`SELECT * FROM kits WHERE ${WHERE}`)
		.bind(key.source, key.board, key.id)
		.first<Row>();
	if (row === null) return null;
	const pasted = text(row, 'pasted');
	const decidedBy = row['ai_decided_by'];
	return {
		questions: questionsOf(text(row, 'questions')),
		pasted: pasted === '' ? [] : pasted.split('\n'),
		readNote: text(row, 'read_note'),
		aiRule: aiRuleOf(text(row, 'ai_rule')),
		aiSentence: text(row, 'ai_sentence'),
		aiDecidedBy: decidedBy === 'check' || decidedBy === 'me' ? decidedBy : null
	};
}

interface Read {
	readonly questions: readonly FormQuestion[];
	readonly note: string;
	/** The check's finding, or null when the posting's text couldn't be read. */
	readonly rule: { readonly rule: 'none' | 'forbids'; readonly sentence: string } | null;
}

async function readForm(fetcher: typeof fetch, key: JobKey): Promise<Read> {
	if (key.source !== 'greenhouse') {
		return {
			questions: [],
			note: `${SOURCE_NAMES[key.source]} doesn't share a form's questions. Paste them in from the form.`,
			rule: null
		};
	}
	try {
		const job = await fetchGreenhouseJob(fetcher, key.board, key.id);
		const sentence = findAiRule(job.text);
		const asked = job.questions.filter((question) => !question.basic).length;
		return {
			questions: job.questions,
			note: `Read the form from Greenhouse: ${String(asked)} ${asked === 1 ? 'question' : 'questions'} beyond name, contact and files.`,
			rule: sentence === null ? { rule: 'none', sentence: '' } : { rule: 'forbids', sentence }
		};
	} catch (error) {
		const why =
			error instanceof SourceHttpError
				? error.message
				: error instanceof SourceFormatError
					? 'its answer was not in the shape we know'
					: 'it did not answer';
		return {
			questions: [],
			note: `Couldn't read the form from Greenhouse (${why}). Paste the questions in from the form.`,
			rule: null
		};
	}
}

/**
 * Makes or refreshes a job's kit: reads the form where the board shares it,
 * and runs the AI-rule check. A decision I made about the AI rule is kept.
 */
export async function prepareKit(
	db: D1Database,
	fetcher: typeof fetch,
	key: JobKey
): Promise<Result> {
	const read = await readForm(fetcher, key);
	const rule = read.rule?.rule ?? 'unknown';
	const sentence = read.rule?.sentence ?? '';
	const decidedBy = read.rule === null ? null : 'check';
	await db
		.prepare(
			`INSERT INTO kits (source, board, posting_id, questions, read_note, ai_rule, ai_sentence, ai_decided_by)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
			 ON CONFLICT (source, board, posting_id) DO UPDATE SET
				questions = excluded.questions,
				read_note = excluded.read_note,
				ai_rule = CASE WHEN kits.ai_decided_by = 'me' THEN kits.ai_rule ELSE excluded.ai_rule END,
				ai_sentence = CASE WHEN kits.ai_decided_by = 'me' THEN kits.ai_sentence ELSE excluded.ai_sentence END,
				ai_decided_by = CASE WHEN kits.ai_decided_by = 'me' THEN 'me' ELSE excluded.ai_decided_by END,
				updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
		)
		.bind(
			key.source,
			key.board,
			key.id,
			JSON.stringify(read.questions),
			read.note,
			rule,
			sentence,
			decidedBy
		)
		.run();
	return { ok: true, message: read.note };
}

const NO_KIT: Result = { ok: false, message: 'Prepare the kit first.' };

export const PASTED_LINE_MAX = 500;

/** Saves the questions I pasted in from the form, one per line, replacing the last paste. */
export async function savePasted(db: D1Database, key: JobKey, pasted: string): Promise<Result> {
	const lines = pasted
		.split(/\r?\n/)
		.map((line) => line.trim().replace(/\s+/g, ' '))
		.filter((line) => line !== '');
	if (lines.length > QUESTIONS_MAX) {
		return { ok: false, message: `Paste up to ${String(QUESTIONS_MAX)} questions.` };
	}
	if (lines.some((line) => line.length > PASTED_LINE_MAX)) {
		return {
			ok: false,
			message: `Keep each question under ${String(PASTED_LINE_MAX)} characters.`
		};
	}
	const row = await db
		.prepare(
			`UPDATE kits SET pasted = ?4, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
			 WHERE ${WHERE} RETURNING pasted`
		)
		.bind(key.source, key.board, key.id, lines.join('\n'))
		.first<Row>();
	if (row === null) return NO_KIT;
	const n = lines.length;
	return {
		ok: true,
		message:
			n === 0
				? 'Cleared the pasted questions.'
				: `Saved ${String(n)} pasted ${n === 1 ? 'question' : 'questions'}.`
	};
}

/** My say on the AI rule. It stays when the kit is read again. */
export async function setAiRule(
	db: D1Database,
	key: JobKey,
	rule: 'none' | 'forbids',
	sentence: string
): Promise<Result> {
	const kept = sentence.trim().replace(/\s+/g, ' ').slice(0, 500);
	const row = await db
		.prepare(
			`UPDATE kits SET ai_rule = ?4, ai_sentence = ?5, ai_decided_by = 'me',
			 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE ${WHERE} RETURNING ai_rule`
		)
		.bind(key.source, key.board, key.id, rule, rule === 'none' ? '' : kept)
		.first<Row>();
	if (row === null) return NO_KIT;
	return {
		ok: true,
		message:
			rule === 'forbids'
				? 'Marked: this posting forbids AI-written answers. Only answers in your own words are offered.'
				: 'Marked: no AI rule on this posting.'
	};
}

export interface Application {
	readonly appliedAt: string;
}

export async function getApplication(db: D1Database, key: JobKey): Promise<Application | null> {
	const row = await db
		.prepare(`SELECT applied_at FROM applications WHERE ${WHERE}`)
		.bind(key.source, key.board, key.id)
		.first<Row>();
	return row === null ? null : { appliedAt: text(row, 'applied_at') };
}

/** When I applied, by job key ("greenhouse:civic:101"), for the Jobs page. */
export async function appliedDates(db: D1Database): Promise<Map<string, string>> {
	const { results } = await db
		.prepare('SELECT source, board, posting_id, applied_at FROM applications')
		.all<Row>();
	return new Map(
		results.map((row) => [
			`${text(row, 'source')}:${text(row, 'board')}:${text(row, 'posting_id')}`,
			text(row, 'applied_at')
		])
	);
}

/** Records that I applied, with the saved answers the kit offered. */
export async function markApplied(
	db: D1Database,
	posting: StoredPosting,
	answerIds: readonly number[],
	now: string
): Promise<Result> {
	await db
		.prepare(
			`INSERT INTO applications (source, board, posting_id, company, title, applied_at, answer_ids)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
			 ON CONFLICT (source, board, posting_id) DO UPDATE SET applied_at = excluded.applied_at,
				answer_ids = excluded.answer_ids`
		)
		.bind(
			posting.source,
			posting.board,
			posting.id,
			posting.company,
			posting.title,
			now,
			JSON.stringify(answerIds)
		)
		.run();
	return { ok: true, message: `Recorded: you applied to ${posting.title} at ${posting.company}.` };
}

export async function unmarkApplied(db: D1Database, key: JobKey): Promise<Result> {
	const row = await db
		.prepare(`DELETE FROM applications WHERE ${WHERE} RETURNING title`)
		.bind(key.source, key.board, key.id)
		.first<Row>();
	return row === null
		? { ok: false, message: 'There was no application recorded for this job.' }
		: { ok: true, message: 'Removed the application record.' };
}

/** How many kits and applications exist, for tests and counts. */
export async function kitCount(db: D1Database): Promise<number> {
	return count(await db.prepare('SELECT COUNT(*) AS n FROM kits').first<Row>(), 'n');
}
