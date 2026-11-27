/**
 * Scoring jobs (design note 0008, step 5): build my profile, find the open
 * jobs not yet scored for this prompt and profile, ask the model, check its
 * answer in code (#lib/scoring/score.ts), and keep a trace of every answered
 * call. Scoring has its own daily cap, apart from drafting's.
 */
import { fingerprint } from '#lib/jobs/posting.ts';
import { forScoring } from '#lib/preferences.ts';
import { askModel } from '#lib/scoring/ask.ts';
import {
	PROMPT_VERSION,
	type CheckedReason,
	type Profile,
	type Score
} from '#lib/scoring/score.ts';
import type { LatestScore } from '#lib/scoring/view.ts';
import { count, postingTextOf, text } from './db.ts';
import { listFacts } from './facts.ts';
import { listInterests } from './interests.ts';
import type { Setup } from './models/model.ts';
import { getPreferences } from './preferences.ts';

type Row = Record<string, unknown>;

/** The cap when SCORE_DAILY_CAP_USD isn't set, in dollars (0008). */
export const SCORE_CAP_USD = 0.1;
/** Most jobs one run scores, whatever the cap allows. */
export const MAX_SCORES_PER_RUN = 300;

/** What the model is told about me: confirmed, current facts; interests not paused; preferences set. */
export async function scoringProfile(db: D1Database): Promise<Profile> {
	const [facts, interests, preferences] = await Promise.all([
		listFacts(db),
		listInterests(db),
		getPreferences(db)
	]);
	return {
		facts: facts
			.filter((fact) => fact.confirmed && !fact.retired)
			.map(({ id, kind, experience, organization, period, text: words }) => ({
				id,
				kind,
				experience,
				organization,
				period,
				text: words
			})),
		interests: interests
			.filter((interest) => !interest.paused)
			.map(({ id, name, note, keywords }) => ({ id, name, note, keywords })),
		preferences: forScoring(preferences)
	};
}

/** Changes whenever anything the model is told about me changes. */
export function profileVersion(profile: Profile): string {
	return fingerprint(JSON.stringify(profile));
}

export interface JobToScore {
	readonly source: string;
	readonly board: string;
	readonly id: string;
	readonly title: string;
	readonly company: string;
	readonly location: string;
	readonly workplace: string;
	readonly department: string | null;
}

/**
 * Open jobs on boards I haven't paused, with text, and no score yet for this
 * prompt and profile; newest first.
 */
export async function jobsToScore(
	db: D1Database,
	promptVersion: string,
	profile: string,
	limit: number
): Promise<JobToScore[]> {
	const { results } = await db
		.prepare(
			`SELECT p.source, p.board, p.id, p.title, p.company, p.location, p.workplace, p.department
			 FROM postings p
			 JOIN boards b ON b.source = p.source AND b.token = p.board
			 JOIN posting_texts t ON t.source = p.source AND t.board = p.board AND t.id = p.id
			 WHERE p.closed_at IS NULL AND b.paused = 0
			 AND NOT EXISTS (
			   SELECT 1 FROM job_scores s
			   WHERE s.source = p.source AND s.board = p.board AND s.posting_id = p.id
			   AND s.prompt_version = ?1 AND s.profile_version = ?2
			 )
			 ORDER BY p.posted_at IS NULL, p.posted_at DESC, p.first_seen_at DESC, p.id
			 LIMIT ?3`
		)
		.bind(promptVersion, profile, limit)
		.all<Row>();
	return results.map(toJob);
}

function toJob(row: Row): JobToScore {
	return {
		source: text(row, 'source'),
		board: text(row, 'board'),
		id: text(row, 'id'),
		title: text(row, 'title'),
		company: text(row, 'company'),
		location: text(row, 'location'),
		workplace: text(row, 'workplace'),
		department: typeof row['department'] === 'string' ? row['department'] : null
	};
}

/** What scoring has cost on a day ("2026-11-26"), in millionths of a dollar. */
export async function scoringSpentOn(db: D1Database, day: string): Promise<number> {
	return count(
		await db
			.prepare(
				'SELECT COALESCE(SUM(cost_micros), 0) AS n FROM job_scores WHERE substr(at, 1, 10) = ?1'
			)
			.bind(day)
			.first<Row>(),
		'n'
	);
}

export type ScoreResult =
	| { readonly kind: 'scored' | 'unscored'; readonly costMicros: number }
	| { readonly kind: 'error'; readonly message: string };

/**
 * Asks the model about one job, checks the answer and records it, stamped
 * with the run's time, so the day the cap counts and the day the trace
 * records always agree.
 */
export async function scoreJob(
	db: D1Database,
	setup: Extract<Setup, { ok: true }>,
	job: JobToScore,
	profile: Profile,
	version: string,
	now: Date
): Promise<ScoreResult> {
	const scoring = { ...job, postingText: await postingTextOf(db, job) };
	const asked = await askModel(setup, scoring, profile);
	if (!asked.ok) return { kind: 'error', message: asked.message };
	const { checked } = asked;
	await db
		.prepare(
			`INSERT INTO job_scores (source, board, posting_id, prompt_version, profile_version, model,
			 ok, score, summary, reasons, dropped, why, grade,
			 input_tokens, output_tokens, cost_micros, price_table, latency_ms, at)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)`
		)
		.bind(
			job.source,
			job.board,
			job.id,
			PROMPT_VERSION,
			version,
			asked.model,
			checked.ok ? 1 : 0,
			checked.ok ? checked.score : null,
			checked.ok ? checked.summary : '',
			JSON.stringify(checked.ok ? checked.reasons : []),
			JSON.stringify(checked.dropped),
			checked.ok ? '' : checked.why,
			checked.ok ? checked.grade : null,
			asked.usage.inputTokens,
			asked.usage.outputTokens,
			asked.cost.micros,
			asked.cost.priceTable,
			asked.latencyMs,
			now.toISOString()
		)
		.run();
	return { kind: checked.ok ? 'scored' : 'unscored', costMicros: asked.cost.micros };
}

/** Counts only, for the run's log line: no companies, titles or text. */
export interface ScoringSummary {
	readonly scored: number;
	readonly unscored: number;
	/** Jobs still waiting when the run stopped. */
	readonly waiting: number;
	readonly spentMicros: number;
	/** Why the run stopped early, if it did. */
	readonly stopped: 'cap' | 'time' | 'error' | null;
}

/**
 * Scores new jobs until there are none, the day's cap is reached, the time is
 * up, or the API fails (then the rest wait for tomorrow). A run can go over
 * the cap by at most one job's cost, since a call's cost is known only after
 * it's made.
 */
export async function scoreNewJobs(
	db: D1Database,
	setup: Extract<Setup, { ok: true }>,
	options: {
		readonly capMicros: number;
		readonly now: Date;
		readonly deadline: number;
		readonly clock?: () => number;
	}
): Promise<ScoringSummary> {
	const clock = options.clock ?? Date.now;
	const profile = await scoringProfile(db);
	const version = profileVersion(profile);
	const jobs = await jobsToScore(db, PROMPT_VERSION, version, MAX_SCORES_PER_RUN);
	const day = options.now.toISOString().slice(0, 10);
	let spent = await scoringSpentOn(db, day);
	let scored = 0;
	let unscored = 0;
	let spentMicros = 0;
	let stopped: ScoringSummary['stopped'] = null;
	for (const job of jobs) {
		if (spent >= options.capMicros) stopped = 'cap';
		else if (clock() >= options.deadline) stopped = 'time';
		if (stopped !== null) break;
		const result = await scoreJob(db, setup, job, profile, version, options.now);
		if (result.kind === 'error') {
			stopped = 'error';
			break;
		}
		if (result.kind === 'scored') scored += 1;
		else unscored += 1;
		spent += result.costMicros;
		spentMicros += result.costMicros;
	}
	return { scored, unscored, waiting: jobs.length - scored - unscored, spentMicros, stopped };
}

/** Each job's latest scoring answer, by job key ("source:board:id"), for the Jobs page. */
export async function latestScores(db: D1Database): Promise<Map<string, LatestScore>> {
	const { results } = await db
		.prepare(
			`SELECT s.source, s.board, s.posting_id, s.ok, s.score, s.summary, s.reasons, s.why,
			 s.prompt_version, s.profile_version
			 FROM job_scores s
			 JOIN (SELECT MAX(id) AS id FROM job_scores GROUP BY source, board, posting_id) l ON l.id = s.id`
		)
		.all<Row>();
	return new Map(
		results.map((row) => [
			`${text(row, 'source')}:${text(row, 'board')}:${text(row, 'posting_id')}`,
			{
				ok: row['ok'] === 1,
				score: typeof row['score'] === 'number' ? (row['score'] as Score) : null,
				summary: text(row, 'summary'),
				reasons: JSON.parse(text(row, 'reasons')) as CheckedReason[],
				why: text(row, 'why'),
				promptVersion: text(row, 'prompt_version'),
				profileVersion: text(row, 'profile_version')
			}
		])
	);
}

/** Keys of the open jobs that have posting text to score. */
export async function jobsWithText(db: D1Database): Promise<Set<string>> {
	const { results } = await db
		.prepare(
			`SELECT t.source, t.board, t.id FROM posting_texts t
			 JOIN postings p ON p.source = t.source AND p.board = t.board AND p.id = t.id
			 WHERE p.closed_at IS NULL`
		)
		.all<Row>();
	return new Set(
		results.map((row) => `${text(row, 'source')}:${text(row, 'board')}:${text(row, 'id')}`)
	);
}

/** One open job with text, as the scorer needs it; null if it's gone, closed or has no text. */
export async function jobToScore(
	db: D1Database,
	key: { readonly source: string; readonly board: string; readonly id: string }
): Promise<JobToScore | null> {
	const row = await db
		.prepare(
			`SELECT p.source, p.board, p.id, p.title, p.company, p.location, p.workplace, p.department
			 FROM postings p
			 JOIN posting_texts t ON t.source = p.source AND t.board = p.board AND t.id = p.id
			 WHERE p.source = ?1 AND p.board = ?2 AND p.id = ?3 AND p.closed_at IS NULL`
		)
		.bind(key.source, key.board, key.id)
		.first<Row>();
	return row === null ? null : toJob(row);
}

export type ScoreNow =
	| { readonly ok: true; readonly message: string }
	| { readonly ok: false; readonly message: string };

/** "Score now" on one job (0008): the same checks, trace and daily cap as the daily run. */
export async function scoreNow(
	db: D1Database,
	setup: Setup,
	key: { readonly source: string; readonly board: string; readonly id: string },
	capMicros: number,
	now: Date
): Promise<ScoreNow> {
	if (!setup.ok) return { ok: false, message: setup.message };
	const job = await jobToScore(db, key);
	if (job === null) {
		return { ok: false, message: 'That job is closed, gone, or has no posting text to score.' };
	}
	if ((await scoringSpentOn(db, now.toISOString().slice(0, 10))) >= capMicros) {
		return {
			ok: false,
			message: 'Today’s scoring cap is used. It will be scored in tomorrow’s run.'
		};
	}
	const profile = await scoringProfile(db);
	const result = await scoreJob(db, setup, job, profile, profileVersion(profile), now);
	if (result.kind === 'error') return { ok: false, message: `Scoring failed. ${result.message}` };
	return {
		ok: true,
		message:
			result.kind === 'scored'
				? `Scored ${job.title} at ${job.company}.`
				: `Couldn’t use the answer for ${job.title} at ${job.company}; it says why on the job.`
	};
}
