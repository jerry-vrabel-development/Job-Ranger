import { error, fail } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { QUESTION_LABELS, type Question } from '#lib/answers.ts';
import { dateLabel, toJobCard } from '#lib/jobs/display.ts';
import { SOURCE_NAMES } from '#lib/jobs/posting.ts';
import { matchQuestion } from '#lib/kit/match.ts';
import { buildResume, jobTextOf } from '#lib/kit/resume.ts';
import { SKILLS } from '#lib/kit/skills.ts';
import { addGapFact, listFacts } from '#lib/server/facts.ts';
import {
	capMicros,
	dollars,
	draftAnswer,
	draftLetter,
	draftSummary,
	dropSummary,
	appliedDraftingCost,
	getAnswerDrafts,
	getDrafts,
	getSummaryDraft,
	jobDraftingCost,
	keepAnswerDraft,
	keepSummary,
	spentOn
} from '#lib/server/drafts.ts';
import { draftable, plainText } from '#lib/kit/letter.ts';
import { reviewed } from '#lib/kit/review.ts';
import { scamSignals } from '#lib/signals/scam.ts';
import { chooseModel, PROVIDERS } from '#lib/server/models/model.ts';
import { reviewAnswer, reviewSummary } from '#lib/server/review.ts';
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

export const load: PageServerLoad = async ({ params, fetch }) => {
	const db = database();
	const key = keyOf(params);
	const posting = await getPosting(db, key);
	if (!posting) error(404, 'That job is no longer in Job Ranger.');
	const today = new Date().toISOString().slice(0, 10);
	const [
		kit,
		application,
		answers,
		facts,
		drafts,
		spent,
		profile,
		answerDrafts,
		jobCost,
		appliedCost,
		summaryDraft
	] = await Promise.all([
		getKit(db, key),
		getApplication(db, key),
		listAnswers(db),
		listFacts(db),
		getDrafts(db, key),
		spentOn(db, today),
		getProfile(db),
		getAnswerDrafts(db, key),
		jobDraftingCost(db, key),
		appliedDraftingCost(db),
		getSummaryDraft(db, key)
	]);
	const factText = new Map(facts.map((fact) => [fact.id, fact.text]));
	/** Each sentence's cited facts, in words. */
	const usedBy = (paragraphs: readonly (readonly { readonly facts: readonly number[] }[])[]) =>
		paragraphs.map((paragraph) =>
			paragraph.map((sentence) =>
				sentence.facts.map(
					(id) => factText.get(id) ?? `Fact ${String(id)} (no longer in your bank)`
				)
			)
		);
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
						/** Scam patterns in the posting's text, each with its sentence (design note 0005). */
						scam: scamSignals(kit.postingText),
						gaps,
						basics: kit.questions.filter((q) => q.basic).map((q) => q.label),
						items: itemsOf(kit, answers).map((item) => {
							const draft = answerDrafts.find((d) => d.question === item.label);
							return {
								...item,
								draftable: draftable(item.type),
								draft:
									draft === undefined
										? null
										: {
												created: dateLabel(draft.createdAt),
												cost: dollars(draft.costMicros),
												problems: draft.problems,
												paragraphs: draft.paragraphs,
												text: plainText(draft.paragraphs),
												used: usedBy(draft.paragraphs)
											}
							};
						})
					},
		/** Every saved answer, to browse for a question no type matched. */
		answers,
		applied: application === null ? null : dateLabel(application.appliedAt),
		factCount: usable.length,
		drafting: {
			...describe(chooseModel(PROVIDERS, setting, fetch)),
			spent: dollars(spent),
			/** What drafting for this job has cost, and the average per application so far. */
			thisJob: jobCost === 0 ? null : dollars(jobCost),
			perApplication:
				appliedCost.applications === 0 || appliedCost.micros === 0
					? null
					: {
							applications: appliedCost.applications,
							total: dollars(appliedCost.micros),
							average: dollars(Math.round(appliedCost.micros / appliedCost.applications))
						},
			cap: dollars(capMicros(setting('DRAFT_DAILY_CAP_USD'))),
			name: profile.name,
			summary:
				summaryDraft === null
					? null
					: {
							created: dateLabel(summaryDraft.createdAt),
							cost: dollars(summaryDraft.costMicros),
							problems: summaryDraft.problems,
							paragraphs: summaryDraft.paragraphs,
							text: plainText(summaryDraft.paragraphs),
							used: usedBy(summaryDraft.paragraphs),
							kept:
								summaryDraft.kept === null
									? null
									: { text: summaryDraft.kept.text, edited: summaryDraft.kept.edited }
						},
			drafts: drafts.map((draft) => ({
				...draft,
				created: dateLabel(draft.createdAt),
				cost: dollars(draft.costMicros),
				used: usedBy(draft.paragraphs)
			}))
		}
	};
};

/** What the page shows about drafting: the model's name, or why it isn't set up. */
function describe(setup: ReturnType<typeof chooseModel>) {
	return setup.ok
		? { ready: true, label: setup.label, notReady: '' }
		: { ready: false, label: '', notReady: setup.message };
}

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
				{
					setup: chooseModel(PROVIDERS, setting, fetch),
					capMicros: capMicros(setting('DRAFT_DAILY_CAP_USD')),
					now: new Date().toISOString()
				},
				keyOf(params),
				kind
			)
		);
	},
	draftAnswer: async ({ params, request, fetch }) => {
		const question = value(await request.formData(), 'question', 500);
		return reply(
			await draftAnswer(
				database(),
				{
					setup: chooseModel(PROVIDERS, setting, fetch),
					capMicros: capMicros(setting('DRAFT_DAILY_CAP_USD')),
					now: new Date().toISOString()
				},
				keyOf(params),
				question
			)
		);
	},
	draftSummary: async ({ params, fetch }) =>
		reply(
			await draftSummary(
				database(),
				{
					setup: chooseModel(PROVIDERS, setting, fetch),
					capMicros: capMicros(setting('DRAFT_DAILY_CAP_USD')),
					now: new Date().toISOString()
				},
				keyOf(params)
			)
		),
	keepSummary: async ({ params, request }) => {
		const chosen = value(await request.formData(), 'summary', 20_000);
		const result = await keepSummary(database(), keyOf(params), chosen, new Date().toISOString());
		return result.ok ? { result } : fail(400, { result, summary: chosen });
	},
	reviewSummary: async ({ params, request }) => {
		const text = value(await request.formData(), 'summary', 20_000);
		const checked = await reviewSummary(database(), keyOf(params), text);
		if (!('suggestions' in checked)) return fail(400, { result: checked, summary: text });
		return {
			result: { ok: true, message: reviewed(checked.suggestions) },
			summary: text,
			review: { field: 'summary', suggestions: checked.suggestions }
		};
	},
	reviewAnswer: async ({ params, request }) => {
		const form = await request.formData();
		const question = value(form, 'question', 500);
		const edited = value(form, 'text', 20_000);
		const checked = await reviewAnswer(database(), keyOf(params), question, edited);
		if (!('suggestions' in checked)) {
			return fail(400, { result: checked, kept: { question, edited } });
		}
		return {
			result: { ok: true, message: reviewed(checked.suggestions) },
			kept: { question, edited },
			review: { field: `answer:${question}`, suggestions: checked.suggestions }
		};
	},
	dropSummary: async ({ params }) => reply(await dropSummary(database(), keyOf(params))),
	keepAnswer: async ({ params, request }) => {
		const form = await request.formData();
		const question = value(form, 'question', 500);
		const edited = value(form, 'text', 20_000);
		const result = await keepAnswerDraft(
			database(),
			keyOf(params),
			question,
			edited,
			new Date().toISOString()
		);
		return result.ok ? { result } : fail(400, { result, kept: { question, edited } });
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
