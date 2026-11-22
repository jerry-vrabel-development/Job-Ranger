/**
 * Final review by code (design note 0004, step 5a): gathers what the checks
 * in #lib/kit/review.ts need for one job and one field. No model, no cost.
 */
import { TEXT_MAX } from '#lib/answers.ts';
import { matchQuestion } from '#lib/kit/match.ts';
import { LIMITS } from '#lib/kit/letter.ts';
import { review, type ReviewContext, type Suggestion } from '#lib/kit/review.ts';
import { text } from './db.ts';
import { SUMMARY_MAX } from './drafts.ts';
import { listFacts } from './facts.ts';
import { getPosting, type JobKey, type Result } from './kits.ts';

type Row = Record<string, unknown>;

export type Reviewed = { readonly ok: true; readonly suggestions: Suggestion[] } | Result;

/** Not this job: the condition, for tables keyed by source, board and posting_id. */
const OTHER = 'NOT (source = ?1 AND board = ?2 AND posting_id = ?3)';

async function shared(
	db: D1Database,
	key: JobKey
): Promise<Omit<ReviewContext, 'maxWords' | 'maxChars' | 'needsCompany' | 'elsewhere'> | null> {
	const posting = await getPosting(db, key);
	if (!posting) return null;
	const [companies, titles, facts] = await Promise.all([
		db.prepare('SELECT company FROM boards').all<Row>(),
		db
			.prepare(
				`SELECT p.title AS title FROM kits k JOIN postings p
				 ON p.source = k.source AND p.board = k.board AND p.id = k.posting_id
				 WHERE NOT (k.source = ?1 AND k.board = ?2 AND k.posting_id = ?3)
				 UNION SELECT title FROM applications WHERE ${OTHER}`
			)
			.bind(key.source, key.board, key.id)
			.all<Row>(),
		listFacts(db)
	]);
	return {
		company: posting.company,
		title: posting.title,
		otherCompanies: companies.results.map((row) => text(row, 'company')),
		otherTitles: titles.results.map((row) => text(row, 'title')),
		facts: facts
			.filter((fact) => fact.confirmed && !fact.retired)
			.map((fact) => `${fact.text} ${fact.period}`)
	};
}

const GONE: Result = { ok: false, message: 'That job is no longer in Job Ranger.' };

/** Reviews a resume summary for the job, against the summaries other jobs' resumes use. */
export async function reviewSummary(
	db: D1Database,
	key: JobKey,
	summary: string
): Promise<Reviewed> {
	const base = await shared(db, key);
	if (!base) return GONE;
	const { results } = await db
		.prepare(
			`SELECT r.kept_text AS kept, p.title AS title, p.company AS company
			 FROM resume_summaries r LEFT JOIN postings p
			 ON p.source = r.source AND p.board = r.board AND p.id = r.posting_id
			 WHERE r.kept_text IS NOT NULL AND NOT (r.source = ?1 AND r.board = ?2 AND r.posting_id = ?3)`
		)
		.bind(key.source, key.board, key.id)
		.all<Row>();
	const elsewhere = results.map((row) => ({
		where:
			typeof row['title'] === 'string' && typeof row['company'] === 'string'
				? `${row['title']} at ${row['company']}`
				: 'another job',
		text: text(row, 'kept')
	}));
	return {
		ok: true,
		suggestions: review(summary, {
			...base,
			maxWords: LIMITS.summary.words,
			maxChars: SUMMARY_MAX,
			needsCompany: false,
			elsewhere
		})
	};
}

/** Reviews an answer to one of the kit's questions. "Why this company" must name it. */
export async function reviewAnswer(
	db: D1Database,
	key: JobKey,
	question: string,
	answer: string
): Promise<Reviewed> {
	const base = await shared(db, key);
	if (!base) return GONE;
	return {
		ok: true,
		suggestions: review(answer, {
			...base,
			maxWords: LIMITS.answer.words,
			maxChars: TEXT_MAX,
			needsCompany: matchQuestion(question) === 'why_company',
			elsewhere: []
		})
	};
}
