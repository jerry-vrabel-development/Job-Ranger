/**
 * Drafting cover letters for a job (design note 0004, step 4): picks the
 * facts that fit, asks the model, checks the answer in code, and keeps a
 * daily spending cap.
 */
import { buildResume, jobTextOf } from '#lib/kit/resume.ts';
import { LABEL_MAX } from '#lib/answers.ts';
import {
	answerSystemPrompt,
	checkLetter,
	draftable,
	LETTER_TOOL,
	parseLetter,
	plainText,
	systemPrompt,
	userPrompt,
	type LetterFact,
	type LetterJob,
	type LetterKind,
	type Paragraph,
	type Problem
} from '#lib/kit/letter.ts';
import { matchQuestion } from '#lib/kit/match.ts';
import { addAnswer, checkAnswer } from './answers.ts';
import { complete } from '#lib/models/complete.ts';
import type { TokenUsage } from '#lib/models/types.ts';
import type { Setup } from './models/model.ts';
import { count, StoredDataError, text } from './db.ts';
import { listFacts } from './facts.ts';
import { getKit, getPosting, type JobKey, type Result } from './kits.ts';

type Row = Record<string, unknown>;

/** Spending so far on a day ("2026-11-20"), in millionths of a dollar. */
export async function spentOn(db: D1Database, day: string): Promise<number> {
	return count(
		await db
			.prepare('SELECT COALESCE(SUM(cost_micros), 0) AS n FROM model_usage WHERE day = ?1')
			.bind(day)
			.first<Row>(),
		'n'
	);
}

export async function recordUsage(
	db: D1Database,
	day: string,
	model: string,
	usage: Pick<TokenUsage, 'inputTokens' | 'outputTokens'>,
	micros: number
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO model_usage (day, model, calls, input_tokens, output_tokens, cost_micros)
			 VALUES (?1, ?2, 1, ?3, ?4, ?5)
			 ON CONFLICT (day, model) DO UPDATE SET calls = calls + 1,
			 input_tokens = input_tokens + excluded.input_tokens,
			 output_tokens = output_tokens + excluded.output_tokens,
			 cost_micros = cost_micros + excluded.cost_micros`
		)
		.bind(day, model, usage.inputTokens, usage.outputTokens, micros)
		.run();
}

/** "$0.04". */
export function dollars(micros: number): string {
	return `$${(micros / 1_000_000).toFixed(2)}`;
}

/** The daily cap from the DRAFT_DAILY_CAP_USD setting, in millionths of a dollar; $1 if unset or unreadable. */
export function capMicros(setting: string): number {
	const usd = /^\d+(?:\.\d{1,2})?$/.test(setting.trim()) ? Number(setting) : 1;
	return Math.round(usd * 1_000_000);
}

export interface Draft {
	readonly kind: LetterKind;
	readonly paragraphs: readonly Paragraph[];
	readonly problems: readonly Problem[];
	readonly costMicros: number;
	readonly createdAt: string;
}

function isParagraphs(value: unknown): value is Paragraph[] {
	return parseLetter({ paragraphs: value }) !== null;
}

function isProblems(value: unknown): value is Problem[] {
	return (
		Array.isArray(value) &&
		value.every(
			(item: unknown) =>
				typeof item === 'object' &&
				item !== null &&
				typeof (item as Problem).problem === 'string' &&
				typeof (item as Problem).paragraph === 'number' &&
				typeof (item as Problem).sentence === 'number'
		)
	);
}

export async function getDrafts(db: D1Database, key: JobKey): Promise<Draft[]> {
	const { results } = await db
		.prepare(
			`SELECT * FROM drafts WHERE source = ?1 AND board = ?2 AND posting_id = ?3 ORDER BY kind`
		)
		.bind(key.source, key.board, key.id)
		.all<Row>();
	return results.map((row) => {
		const kind = text(row, 'kind');
		const paragraphs: unknown = JSON.parse(text(row, 'paragraphs'));
		const problems: unknown = JSON.parse(text(row, 'problems'));
		if (
			(kind !== 'letter_full' && kind !== 'letter_short') ||
			!isParagraphs(paragraphs) ||
			!isProblems(problems)
		) {
			throw new StoredDataError('a stored draft is not the shape we keep');
		}
		return {
			kind,
			paragraphs,
			problems,
			costMicros: count(row, 'cost_micros'),
			createdAt: text(row, 'created_at')
		};
	});
}

export interface DraftSettings {
	/** Which provider and model to draft with, or why drafting isn't set up. */
	readonly setup: Setup;
	readonly capMicros: number;
	readonly now: string;
}

interface Ready {
	readonly ok: true;
	readonly setup: Extract<Setup, { ok: true }>;
	readonly day: string;
	readonly chosen: LetterFact[];
	readonly job: LetterJob;
	readonly title: string;
}

/**
 * Everything that must hold before a model is asked, so nothing is spent on
 * a draft that can't be made: set up, the job and kit exist, the posting
 * allows AI, today's cap isn't reached, and there are confirmed facts.
 */
async function ready(
	db: D1Database,
	settings: DraftSettings,
	key: JobKey,
	what: string
): Promise<Ready | Result> {
	const { setup } = settings;
	if (!setup.ok) return { ok: false, message: setup.message };
	const posting = await getPosting(db, key);
	if (!posting) return { ok: false, message: 'That job is no longer in Job Ranger.' };
	const kit = await getKit(db, key);
	if (!kit) return { ok: false, message: 'Prepare the kit first.' };
	if (kit.aiRule === 'forbids') {
		return {
			ok: false,
			message: `This posting forbids AI-written answers, so Job Ranger won’t draft ${what} for it.`
		};
	}
	const day = settings.now.slice(0, 10);
	const spent = await spentOn(db, day);
	if (spent >= settings.capMicros) {
		return {
			ok: false,
			message: `Today’s drafting limit is reached (${dollars(spent)} of ${dollars(settings.capMicros)}). It resets at midnight UTC.`
		};
	}
	const confirmed = (await listFacts(db)).filter((fact) => fact.confirmed && !fact.retired);
	if (confirmed.length === 0) {
		return { ok: false, message: 'There are no confirmed facts to draft from yet.' };
	}
	const resume = buildResume(confirmed, jobTextOf(posting, kit));
	return {
		ok: true,
		setup,
		day,
		chosen: [
			...resume.summary,
			...resume.roles.flatMap((r) => [r.role, ...r.accomplishments]),
			...resume.projects.flatMap((p) => [p.project, ...p.accomplishments]),
			...resume.skills
		],
		job: {
			title: posting.title,
			company: posting.company,
			department: posting.department,
			postingText: kit.postingText
		},
		title: `${posting.title} at ${posting.company}`
	};
}

type Written =
	{ readonly ok: true; readonly paragraphs: Paragraph[]; readonly cost: number } | Result;

/** Asks the model, records what it cost, and reads its answer as paragraphs. */
async function write(
	db: D1Database,
	go: Ready,
	system: string,
	user: string,
	what: string
): Promise<Written> {
	const result = await complete(
		go.setup.adapter,
		{
			model: go.setup.model,
			system,
			user,
			maxOutputTokens: 4000,
			timeoutMs: 90_000,
			json: {
				name: LETTER_TOOL.name,
				description: LETTER_TOOL.description,
				schema: LETTER_TOOL.input_schema
			}
		},
		go.setup.apiKey
	);
	if (!result.ok) return { ok: false, message: result.error.message };
	const cost = result.cost.micros;
	await recordUsage(db, go.day, go.setup.model, result.usage, cost);
	const spent = `${dollars(cost)} spent`;
	if (result.stopReason === 'refusal') {
		return { ok: false, message: `The model declined to draft ${what} (${spent}).` };
	}
	if (result.stopReason === 'max_tokens') {
		return {
			ok: false,
			message: `The model ran out of room before finishing ${what} (${spent}). Try again.`
		};
	}
	const paragraphs = parseLetter(result.output);
	if (paragraphs === null) {
		return {
			ok: false,
			message: `The model didn’t return ${what} in the shape asked for (${spent}). Try again.`
		};
	}
	return { ok: true, paragraphs, cost };
}

async function companies(db: D1Database): Promise<string[]> {
	const { results } = await db.prepare('SELECT company FROM boards').all<Row>();
	return results.map((row) => text(row, 'company'));
}

function drafted(what: string, cost: number, problems: readonly Problem[]): string {
	return problems.length === 0
		? `Drafted ${what} (${dollars(cost)}). Every sentence is backed by its facts. Read it, and make it yours.`
		: `Drafted ${what} (${dollars(cost)}), but the checks found ${String(problems.length)} ${problems.length === 1 ? 'problem' : 'problems'}. Fix or cut those sentences before you use it.`;
}

/** Drafts a cover letter for the job, checks it, and keeps it. */
export async function draftLetter(
	db: D1Database,
	settings: DraftSettings,
	key: JobKey,
	kind: LetterKind
): Promise<Result> {
	const go = await ready(db, settings, key, 'a letter');
	if (!('setup' in go)) return go;
	const written = await write(
		db,
		go,
		systemPrompt(kind),
		userPrompt(go.job, go.chosen),
		'a letter'
	);
	if (!('paragraphs' in written)) return written;
	const problems = checkLetter(kind, written.paragraphs, go.chosen, go.job, await companies(db));
	await db
		.prepare(
			`INSERT INTO drafts (source, board, posting_id, kind, paragraphs, problems, model, cost_micros)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
			 ON CONFLICT (source, board, posting_id, kind) DO UPDATE SET paragraphs = excluded.paragraphs,
			 problems = excluded.problems, model = excluded.model, cost_micros = excluded.cost_micros,
			 created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
		)
		.bind(
			key.source,
			key.board,
			key.id,
			kind,
			JSON.stringify(written.paragraphs),
			JSON.stringify(problems),
			go.setup.model,
			written.cost
		)
		.run();
	return {
		ok: true,
		message: drafted(
			`a ${kind === 'letter_full' ? 'full' : 'short'} letter`,
			written.cost,
			problems
		)
	};
}

/** The questions a kit has: the form's (beyond basics) and the pasted ones. */
async function kitQuestions(db: D1Database, key: JobKey): Promise<string[]> {
	const kit = await getKit(db, key);
	return kit === null
		? []
		: [...kit.questions.filter((q) => !q.basic).map((q) => q.label), ...kit.pasted];
}

/** Drafts an answer to one of the kit's questions, from facts, and keeps it. */
export async function draftAnswer(
	db: D1Database,
	settings: DraftSettings,
	key: JobKey,
	question: string
): Promise<Result> {
	const type = matchQuestion(question);
	if (!draftable(type)) {
		return {
			ok: false,
			message:
				'That question is about your situation, not your experience, so answer it yourself on Answers.'
		};
	}
	if (!(await kitQuestions(db, key)).includes(question)) {
		return { ok: false, message: 'That question isn’t on this kit any more.' };
	}
	const go = await ready(db, settings, key, 'an answer');
	if (!('setup' in go)) return go;
	const written = await write(
		db,
		go,
		answerSystemPrompt(),
		userPrompt(go.job, go.chosen, question),
		'an answer'
	);
	if (!('paragraphs' in written)) return written;
	const problems = checkLetter(
		'answer',
		written.paragraphs,
		go.chosen,
		go.job,
		await companies(db),
		type === 'why_company'
	);
	await db
		.prepare(
			`INSERT INTO answer_drafts (source, board, posting_id, question, paragraphs, problems, model, cost_micros)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
			 ON CONFLICT (source, board, posting_id, question) DO UPDATE SET paragraphs = excluded.paragraphs,
			 problems = excluded.problems, model = excluded.model, cost_micros = excluded.cost_micros,
			 created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
		)
		.bind(
			key.source,
			key.board,
			key.id,
			question,
			JSON.stringify(written.paragraphs),
			JSON.stringify(problems),
			go.setup.model,
			written.cost
		)
		.run();
	return { ok: true, message: drafted('an answer', written.cost, problems) };
}

export interface AnswerDraft {
	readonly question: string;
	readonly paragraphs: readonly Paragraph[];
	readonly problems: readonly Problem[];
	readonly model: string;
	readonly costMicros: number;
	readonly createdAt: string;
}

export async function getAnswerDrafts(db: D1Database, key: JobKey): Promise<AnswerDraft[]> {
	const { results } = await db
		.prepare(
			`SELECT * FROM answer_drafts WHERE source = ?1 AND board = ?2 AND posting_id = ?3 ORDER BY question`
		)
		.bind(key.source, key.board, key.id)
		.all<Row>();
	return results.map((row) => {
		const paragraphs: unknown = JSON.parse(text(row, 'paragraphs'));
		const problems: unknown = JSON.parse(text(row, 'problems'));
		if (!isParagraphs(paragraphs) || !isProblems(problems)) {
			throw new StoredDataError('a stored answer draft is not the shape we keep');
		}
		return {
			question: text(row, 'question'),
			paragraphs,
			problems,
			model: text(row, 'model'),
			costMicros: count(row, 'cost_micros'),
			createdAt: text(row, 'created_at')
		};
	});
}

/**
 * Saves my edited version of a drafted answer to the answer bank, labeled
 * "AI draft, edited by me" (so it's never offered where AI is forbidden),
 * with a note of where it came from. It must differ from the draft: the
 * label says I edited it.
 */
export async function keepAnswerDraft(
	db: D1Database,
	key: JobKey,
	question: string,
	edited: string,
	now: string
): Promise<Result> {
	const draft = (await getAnswerDrafts(db, key)).find((d) => d.question === question);
	if (!draft) return { ok: false, message: 'That draft is no longer here.' };
	const tidy = (value: string) => value.replace(/\s+/g, ' ').trim();
	if (tidy(edited) === tidy(plainText(draft.paragraphs))) {
		return {
			ok: false,
			message:
				'Make it yours first: change at least a word. It’s saved as “AI draft, edited by me”, so it should be.'
		};
	}
	const posting = await getPosting(db, key);
	const where = posting === null ? 'a job' : `${posting.title} at ${posting.company}`;
	const checked = checkAnswer({
		question: matchQuestion(question) ?? 'other',
		label:
			question.length <= LABEL_MAX ? question : `${question.slice(0, LABEL_MAX - 1).trimEnd()}…`,
		text: edited,
		origin: 'ai_edited',
		notes: `Drafted by ${draft.model} for ${where} on ${now.slice(0, 10)}, then edited by me.`
	});
	if (!checked.ok) return { ok: false, message: checked.message };
	await addAnswer(db, checked.input);
	await db
		.prepare(
			'DELETE FROM answer_drafts WHERE source = ?1 AND board = ?2 AND posting_id = ?3 AND question = ?4'
		)
		.bind(key.source, key.board, key.id, question)
		.run();
	return {
		ok: true,
		message: 'Saved your edited answer to Answers, labeled “AI draft, edited by me”.'
	};
}
