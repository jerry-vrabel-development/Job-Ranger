/**
 * Drafting cover letters for a job (design note 0004, step 4): picks the
 * facts that fit, asks the model, checks the answer in code, and keeps a
 * daily spending cap.
 */
import { buildResume, jobTextOf } from '#lib/kit/resume.ts';
import {
	checkLetter,
	LETTER_TOOL,
	parseLetter,
	systemPrompt,
	userPrompt,
	type LetterFact,
	type LetterKind,
	type Paragraph,
	type Problem
} from '#lib/kit/letter.ts';
import { callTool, ClaudeError, costMicros, DRAFT_MODEL, type Usage } from './claude.ts';
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
	usage: Usage
): Promise<number> {
	const cost = costMicros(model, usage);
	await db
		.prepare(
			`INSERT INTO model_usage (day, model, calls, input_tokens, output_tokens, cost_micros)
			 VALUES (?1, ?2, 1, ?3, ?4, ?5)
			 ON CONFLICT (day, model) DO UPDATE SET calls = calls + 1,
			 input_tokens = input_tokens + excluded.input_tokens,
			 output_tokens = output_tokens + excluded.output_tokens,
			 cost_micros = cost_micros + excluded.cost_micros`
		)
		.bind(day, model, usage.inputTokens, usage.outputTokens, cost)
		.run();
	return cost;
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
	readonly apiKey: string;
	readonly capMicros: number;
	readonly now: string;
}

/** Drafts a cover letter for the job, checks it, and keeps it. */
export async function draftLetter(
	db: D1Database,
	fetcher: typeof fetch,
	settings: DraftSettings,
	key: JobKey,
	kind: LetterKind
): Promise<Result> {
	if (settings.apiKey === '') {
		return { ok: false, message: 'Drafting isn’t set up yet: the Worker has no API key.' };
	}
	const posting = await getPosting(db, key);
	if (!posting) return { ok: false, message: 'That job is no longer in Job Ranger.' };
	const kit = await getKit(db, key);
	if (!kit) return { ok: false, message: 'Prepare the kit first.' };
	if (kit.aiRule === 'forbids') {
		return {
			ok: false,
			message: 'This posting forbids AI-written answers, so Job Ranger won’t draft a letter for it.'
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
	const chosen: LetterFact[] = [
		...resume.summary,
		...resume.roles.flatMap((r) => [r.role, ...r.accomplishments]),
		...resume.projects.flatMap((p) => [p.project, ...p.accomplishments]),
		...resume.skills
	];
	const job = {
		title: posting.title,
		company: posting.company,
		department: posting.department,
		postingText: kit.postingText
	};

	let input: unknown;
	let cost: number;
	try {
		const answer = await callTool(fetcher, settings.apiKey, {
			model: DRAFT_MODEL,
			system: systemPrompt(kind),
			user: userPrompt(job, chosen),
			tool: LETTER_TOOL,
			maxTokens: 4000
		});
		cost = await recordUsage(db, day, DRAFT_MODEL, answer.usage);
		input = answer.input;
	} catch (error) {
		if (error instanceof ClaudeError) return { ok: false, message: error.message };
		throw error;
	}
	const letter = parseLetter(input);
	if (letter === null) {
		return {
			ok: false,
			message: `The model didn’t return a letter in the shape asked for (${dollars(cost)} spent). Try again.`
		};
	}
	const { results } = await db.prepare('SELECT company FROM boards').all<Row>();
	const problems = checkLetter(
		kind,
		letter,
		chosen,
		job,
		results.map((row) => text(row, 'company'))
	);
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
			JSON.stringify(letter),
			JSON.stringify(problems),
			DRAFT_MODEL,
			cost
		)
		.run();
	const length = kind === 'letter_full' ? 'full' : 'short';
	return {
		ok: true,
		message:
			problems.length === 0
				? `Drafted a ${length} letter (${dollars(cost)}). Every sentence is backed by its facts. Read it, and make it yours.`
				: `Drafted a ${length} letter (${dollars(cost)}), but the checks found ${String(problems.length)} ${problems.length === 1 ? 'problem' : 'problems'}. Fix or cut those sentences before you use it.`
	};
}
