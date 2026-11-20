import { error, fail } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { QUESTION_LABELS, type Question } from '#lib/answers.ts';
import { dateLabel, toJobCard } from '#lib/jobs/display.ts';
import { SOURCE_NAMES } from '#lib/jobs/posting.ts';
import { matchQuestion } from '#lib/kit/match.ts';
import { buildResume, jobTextOf } from '#lib/kit/resume.ts';
import { SKILLS } from '#lib/kit/skills.ts';
import { addGapFact, listFacts } from '#lib/server/facts.ts';
import { capMicros, dollars, draftLetter, getDrafts, spentOn } from '#lib/server/drafts.ts';
import { getProfile } from '#lib/server/profile.ts';
import { listAnswers, type Answer } from '#lib/server/answers.ts';
import {
	dismissGap,
	getApplication,
	getKit,
	getPosting,
	markApplied,
	parseJobKey,
	prepareKit,
	savePasted,
	savePostingText,
	setAiRule,
	unmarkApplied,
	type JobKey,
	type Kit,
	type Result
} from '#lib/server/kits.ts';
import type { Actions, PageServerLoad } from './$types';

/** A Worker setting or secret, trimmed; empty when it isn't set. */
function setting(name: string): string {
	const value = (env as unknown as Record<string, unknown>)[name];
	return typeof value === 'string' ? value.trim() : '';
}

function database(): D1Database {
	const db = (env as Partial<Env>).DB;
	if (!db) error(503, 'Your job list is not available right now.');
	return db;
}

function keyOf(params: { source: string; board: string; id: string }): JobKey {
	const key = parseJobKey(params.source, params.board, params.id);
	if (!key) error(404, 'That is not a job in Job Ranger.');
	return key;
}

interface KitItem {
	readonly label: string;
	readonly required: boolean;
	readonly from: 'form' | 'pasted';
	readonly type: Question | null;
	readonly typeLabel: string | null;
	readonly answers: readonly Answer[];
	/** AI-edited answers left out because the posting forbids AI answers. */
	readonly hidden: number;
}

/** Each question, with the saved answers that fit it (only my own words where AI is forbidden). */
function itemsOf(kit: Kit, answers: readonly Answer[]): KitItem[] {
	const questions = [
		...kit.questions
			.filter((question) => !question.basic)
			.map((question) => ({ ...question, from: 'form' as const })),
		...kit.pasted.map((label) => ({ label, required: false, from: 'pasted' as const }))
	];
	return questions.map(({ label, required, from }) => {
		const type = matchQuestion(label);
		const fitting = type === null ? [] : answers.filter((answer) => answer.question === type);
		const allowed =
			kit.aiRule === 'forbids'
				? fitting.filter((answer) => answer.origin !== 'ai_edited')
				: fitting;
		return {
			label,
			required,
			from,
			type,
			typeLabel: type === null ? null : QUESTION_LABELS[type],
			answers: allowed,
			hidden: fitting.length - allowed.length
		};
	});
}

export const load: PageServerLoad = async ({ params }) => {
	const db = database();
	const key = keyOf(params);
	const posting = await getPosting(db, key);
	if (!posting) error(404, 'That job is no longer in Job Ranger.');
	const today = new Date().toISOString().slice(0, 10);
	const [kit, application, answers, facts, drafts, spent, profile] = await Promise.all([
		getKit(db, key),
		getApplication(db, key),
		listAnswers(db),
		listFacts(db),
		getDrafts(db, key),
		spentOn(db, today),
		getProfile(db)
	]);
	const factText = new Map(facts.map((fact) => [fact.id, fact.text]));
	const usable = facts.filter((fact) => fact.confirmed && !fact.retired);
	const gaps =
		kit === null
			? []
			: buildResume(usable, jobTextOf(posting, kit)).gaps.filter(
					(skill) => !kit.dismissed.includes(skill)
				);
	return {
		job: {
			...toJobCard(posting, new Date().toISOString()),
			source: posting.source,
			sourceName: SOURCE_NAMES[posting.source],
			closed: posting.closedAt !== null
		},
		kit:
			kit === null
				? null
				: {
						readNote: kit.readNote,
						aiRule: kit.aiRule,
						aiSentence: kit.aiSentence,
						aiDecidedBy: kit.aiDecidedBy,
						pasted: kit.pasted.join('\n'),
						postingText: kit.postingText,
						gaps,
						basics: kit.questions.filter((q) => q.basic).map((q) => q.label),
						items: itemsOf(kit, answers)
					},
		/** Every saved answer, to browse for a question no type matched. */
		answers,
		applied: application === null ? null : dateLabel(application.appliedAt),
		factCount: usable.length,
		drafting: {
			ready: setting('ANTHROPIC_API_KEY') !== '',
			spent: dollars(spent),
			cap: dollars(capMicros(setting('DRAFT_DAILY_CAP_USD'))),
			name: profile.name,
			drafts: drafts.map((draft) => ({
				...draft,
				created: dateLabel(draft.createdAt),
				cost: dollars(draft.costMicros),
				/** Each sentence's cited facts, in words. */
				used: draft.paragraphs.map((paragraph) =>
					paragraph.map((sentence) =>
						sentence.facts.map(
							(id) => factText.get(id) ?? `Fact ${String(id)} (no longer in your bank)`
						)
					)
				)
			}))
		}
	};
};

function reply(result: Result) {
	return result.ok ? { result } : fail(400, { result });
}

function value(form: FormData, name: string, max: number): string {
	const raw = form.get(name);
	return typeof raw === 'string' ? raw.slice(0, max) : '';
}

export const actions: Actions = {
	prepare: async ({ params, fetch }) => reply(await prepareKit(database(), fetch, keyOf(params))),
	pasted: async ({ params, request }) => {
		const pasted = value(await request.formData(), 'pasted', 40_000);
		const result = await savePasted(database(), keyOf(params), pasted);
		return result.ok ? { result } : fail(400, { result, pasted });
	},
	draft: async ({ params, request, fetch }) => {
		const kind = (await request.formData()).get('kind');
		if (kind !== 'letter_full' && kind !== 'letter_short') {
			return fail(400, { result: { ok: false, message: 'Say which length of letter to draft.' } });
		}
		return reply(
			await draftLetter(
				database(),
				fetch,
				{
					apiKey: setting('ANTHROPIC_API_KEY'),
					capMicros: capMicros(setting('DRAFT_DAILY_CAP_USD')),
					now: new Date().toISOString()
				},
				keyOf(params),
				kind
			)
		);
	},
	posting: async ({ params, request }) => {
		const pasted = value(await request.formData(), 'posting', 120_000);
		const result = await savePostingText(database(), keyOf(params), pasted);
		return result.ok ? { result } : fail(400, { result, posting: pasted });
	},
	gap: async ({ params, request }) => {
		const form = await request.formData();
		const skill = value(form, 'skill', 100);
		const answer = form.get('answer');
		if (skill === '' || !SKILLS.includes(skill)) {
			return fail(400, {
				result: { ok: false, message: 'That skill isn’t one the kit asks about.' }
			});
		}
		if (answer === 'professional' || answer === 'side' || answer === 'learning') {
			return reply(await addGapFact(database(), skill, answer));
		}
		if (answer === 'no') return reply(await dismissGap(database(), keyOf(params), skill));
		return fail(400, { result: { ok: false, message: 'Say whether you have used it.' } });
	},
	rule: async ({ params, request }) => {
		const form = await request.formData();
		const rule = form.get('rule');
		if (rule !== 'none' && rule !== 'forbids') {
			return fail(400, { result: { ok: false, message: 'Say whether there is an AI rule.' } });
		}
		return reply(await setAiRule(database(), keyOf(params), rule, value(form, 'sentence', 2000)));
	},
	applied: async ({ params }) => {
		const db = database();
		const key = keyOf(params);
		const posting = await getPosting(db, key);
		if (!posting) return reply({ ok: false, message: 'That job is no longer in Job Ranger.' });
		const kit = await getKit(db, key);
		const offered =
			kit === null ? [] : itemsOf(kit, await listAnswers(db)).flatMap((item) => item.answers);
		const ids = [...new Set(offered.map((answer) => answer.id))];
		return reply(await markApplied(db, posting, ids, new Date().toISOString()));
	},
	unapplied: async ({ params }) => reply(await unmarkApplied(database(), keyOf(params)))
};
