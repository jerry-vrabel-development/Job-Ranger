import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Board } from '#lib/jobs/posting.ts';
import { removeBoard, StoredDataError } from './db.ts';
import { listAnswers } from './answers.ts';
import {
	appliedDraftingCost,
	capMicros,
	dollars,
	draftAnswer,
	draftLetter,
	draftSummary,
	dropSummary,
	getAnswerDrafts,
	getDrafts,
	getSummaryDraft,
	jobDraftingCost,
	keepAnswerDraft,
	keepSummary,
	recordUsage,
	spentOn,
	type DraftSettings
} from './drafts.ts';
import { addFact, pasteFacts } from './facts.ts';
import { getPosting, markApplied, prepareKit, savePasted, setAiRule, type JobKey } from './kits.ts';
import { anthropic } from '#lib/models/anthropic.ts';
import type { Setup } from './models/model.ts';
import { addBoard, migratedDb } from './test-db.ts';

const flight: Board = { source: 'lever', token: 'Flight', company: 'Flight Co' };
const other: Board = { source: 'lever', token: 'other', company: 'Spotify' };
const job: JobKey = { source: 'lever', board: 'Flight', id: 'abc' };
const NOW = '2026-11-20T15:00:00.000Z';
/** Draft settings with the Anthropic adapter over a fake network. */
const using = (fetcher: typeof fetch): DraftSettings => ({
	setup: {
		ok: true,
		adapter: anthropic(fetcher),
		apiKey: 'sk-test',
		model: 'claude-sonnet-5-5',
		label: 'test'
	},
	capMicros: 1_000_000,
	now: NOW
});

let db: D1Database;
let factId = 0;
const notSetUp: Setup = {
	ok: false,
	message: 'Drafting isn’t set up yet: the Worker has no API key.'
};

const letter = (paragraphs: unknown) =>
	vi.fn<typeof fetch>(() =>
		Promise.resolve(
			Response.json({
				content: [{ type: 'tool_use', name: 'write_letter', input: { paragraphs } }],
				usage: { input_tokens: 1000, output_tokens: 500 }
			})
		)
	);

beforeEach(async () => {
	db = await migratedDb();
	await db.batch([
		db.prepare('DELETE FROM drafts'),
		db.prepare('DELETE FROM draft_costs'),
		db.prepare('DELETE FROM applications'),
		db.prepare('DELETE FROM answer_drafts'),
		db.prepare('DELETE FROM resume_summaries'),
		db.prepare('DELETE FROM answers'),
		db.prepare('DELETE FROM model_usage'),
		db.prepare('DELETE FROM kits'),
		db.prepare('DELETE FROM facts'),
		db.prepare('DELETE FROM postings'),
		db.prepare('DELETE FROM boards')
	]);
	await addBoard(db, flight);
	await addBoard(db, other);
	await db
		.prepare(
			`INSERT INTO postings (source, board, id, company, title, location, workplace, apply_url,
			 first_seen_at, last_seen_at) VALUES ('lever', 'Flight', 'abc', 'Flight Co', 'Pilot',
			 'Remote', 'remote', 'https://x.test/abc', ?1, ?1)`
		)
		.bind(NOW)
		.run();
	await prepareKit(db, vi.fn<typeof fetch>(), job);
	await addFact(db, {
		kind: 'role',
		experience: 'professional',
		organization: 'Air Force',
		period: '1985–1989',
		text: 'Security Police'
	});
	await addFact(db, {
		kind: 'accomplishment',
		experience: 'professional',
		organization: 'Air Force',
		period: '1985–1989',
		text: 'Led a 12-person flight security team.'
	});
	await addFact(db, {
		kind: 'project',
		experience: 'side',
		organization: 'Quest Log',
		period: '',
		text: 'Quest Log, a flight-ready task app.'
	});
	factId = Number(
		(await db.prepare("SELECT id FROM facts WHERE kind = 'accomplishment'").first())?.['id']
	);
});

describe('spending', () => {
	it('adds up a day’s cost across calls and models, and formats dollars', async () => {
		expect(await spentOn(db, '2026-11-20')).toBe(0);
		const tokens = { inputTokens: 1000, outputTokens: 500 };
		await recordUsage(db, '2026-11-20', 'claude-sonnet-5-5', tokens, 7000);
		await recordUsage(db, '2026-11-20', 'claude-sonnet-5-5', tokens, 7000);
		await recordUsage(
			db,
			'2026-11-20',
			'claude-haiku-5-5',
			{ inputTokens: 1000, outputTokens: 0 },
			100
		);
		await recordUsage(
			db,
			'2026-11-21',
			'claude-sonnet-5-5',
			{ inputTokens: 1, outputTokens: 0 },
			2
		);
		expect(await spentOn(db, '2026-11-20')).toBe(14_100);
		expect(
			await db
				.prepare(
					"SELECT calls FROM model_usage WHERE model = 'claude-sonnet-5-5' AND day = '2026-11-20'"
				)
				.first()
		).toEqual({ calls: 2 });
		expect(dollars(14_100)).toBe('$0.01');
		expect(dollars(1_250_000)).toBe('$1.25');
	});

	it('reads the daily cap, falling back to $1', () => {
		expect(capMicros('2.50')).toBe(2_500_000);
		expect(capMicros(' 3 ')).toBe(3_000_000);
		for (const odd of ['', 'lots', '-1', '1.234']) expect(capMicros(odd)).toBe(1_000_000);
	});
});

describe('draftLetter', () => {
	it('drafts, checks and keeps a letter, and records what it cost', async () => {
		const fetcher = letter([
			[{ text: 'I’m applying to fly with Flight Co.', facts: [] }],
			[{ text: 'In the Air Force I led a 12-person flight security team.', facts: [factId] }]
		]);
		expect(await draftLetter(db, using(fetcher), job, 'letter_full')).toEqual({
			ok: true,
			message:
				'Drafted a full letter ($0.01). Every sentence is backed by its facts. Read it, and make it yours.'
		});
		const sent = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string) as {
			messages: { content: string }[];
		};
		expect(sent.messages[0]?.content).toMatch(/Led a 12-person flight security team/);
		expect(sent.messages[0]?.content).toMatch(/"experience":"side","where":"Quest Log"/);
		const [draft] = await getDrafts(db, job);
		expect(draft).toMatchObject({ kind: 'letter_full', problems: [], costMicros: 7000 });
		expect(draft?.paragraphs[1]?.[0]?.facts).toEqual([factId]);
		expect(await spentOn(db, '2026-11-20')).toBe(7000);
	});

	it('keeps a letter with problems and says how many', async () => {
		const fetcher = letter([[{ text: 'Spotify trained me for 30 years.', facts: [factId] }]]);
		expect((await draftLetter(db, using(fetcher), job, 'letter_short')).message).toBe(
			'Drafted a short letter ($0.01), but the checks found 3 problems. Fix or cut those sentences before you use it.'
		);
		expect((await getDrafts(db, job))[0]?.problems).toHaveLength(3);
		const one = letter([[{ text: 'Flight Co needs a 99-person team.', facts: [factId] }]]);
		expect((await draftLetter(db, using(one), job, 'letter_short')).message).toMatch(
			/found 1 problem\./
		);
		expect(await getDrafts(db, job)).toHaveLength(1);
	});

	it('says why it can’t draft, before spending anything', async () => {
		const fetcher = vi.fn<typeof fetch>();
		expect(
			(await draftLetter(db, { ...using(fetcher), setup: notSetUp }, job, 'letter_full')).message
		).toBe('Drafting isn’t set up yet: the Worker has no API key.');
		expect(
			(await draftLetter(db, using(fetcher), { ...job, id: 'gone' }, 'letter_full')).message
		).toBe('That job is no longer in Job Ranger.');
		await db.prepare('DELETE FROM kits').run();
		expect((await draftLetter(db, using(fetcher), job, 'letter_full')).message).toBe(
			'Prepare the kit first.'
		);
		await prepareKit(db, vi.fn<typeof fetch>(), job);
		await setAiRule(db, job, 'forbids', 'No AI.');
		expect((await draftLetter(db, using(fetcher), job, 'letter_full')).message).toMatch(
			/forbids AI-written answers/
		);
		await setAiRule(db, job, 'none', '');
		await recordUsage(
			db,
			'2026-11-20',
			'claude-sonnet-5-5',
			{ inputTokens: 0, outputTokens: 100_000 },
			1_000_000
		);
		expect((await draftLetter(db, using(fetcher), job, 'letter_full')).message).toBe(
			'Today’s drafting limit is reached ($1.00 of $1.00). It resets at midnight UTC.'
		);
		await db.prepare('DELETE FROM model_usage').run();
		await db.prepare('DELETE FROM facts').run();
		await pasteFacts(db, [
			{ kind: 'skill', experience: 'side', organization: '', period: '', text: 'Unconfirmed' }
		]);
		expect((await draftLetter(db, using(fetcher), job, 'letter_full')).message).toBe(
			'There are no confirmed facts to draft from yet.'
		);
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('passes API errors on in words, and charges for an answer in the wrong shape', async () => {
		const refused = vi.fn<typeof fetch>(() => Promise.resolve(new Response('', { status: 401 })));
		expect((await draftLetter(db, using(refused), job, 'letter_full')).message).toBe(
			'Couldn’t draft: the API key was refused (401).'
		);
		expect((await draftLetter(db, using(letter('nonsense')), job, 'letter_full')).message).toBe(
			'The model didn’t return a letter in the shape asked for ($0.01 spent). Try again.'
		);
		expect(await spentOn(db, '2026-11-20')).toBe(7000);
		expect(await getDrafts(db, job)).toEqual([]);
	});

	it('lets unexpected errors through, rather than calling them API errors', async () => {
		// Not a Response at all: a bug, not the API saying no.
		const broken = vi.fn<typeof fetch>(() => Promise.resolve(null as unknown as Response));
		await expect(draftLetter(db, using(broken), job, 'letter_full')).rejects.toThrow(TypeError);
	});

	it('refuses a model with no price before sending anything, so the cap holds', async () => {
		const fetcher = letter([[{ text: 'Flight Co.', facts: [] }]]);
		const unpriced = using(fetcher);
		const setup = unpriced.setup as Extract<Setup, { ok: true }>;
		expect(
			(
				await draftLetter(
					db,
					{ ...unpriced, setup: { ...setup, model: 'unpriced' } },
					job,
					'letter_full'
				)
			).message
		).toBe('There’s no price on file for the model “unpriced”, so it can’t be called.');
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('records the cost of a refusal or a cut-off answer, and says so', async () => {
		const answering = (stop_reason: string) =>
			vi.fn<typeof fetch>(() =>
				Promise.resolve(
					Response.json({
						content: [{ type: 'text', text: 'No.' }],
						model: 'claude-sonnet-5-5',
						stop_reason,
						usage: { input_tokens: 1000, output_tokens: 500 }
					})
				)
			);
		expect((await draftLetter(db, using(answering('refusal')), job, 'letter_full')).message).toBe(
			'The model declined to draft a letter ($0.01 spent).'
		);
		expect((await draftAnswer(db, using(answering('max_tokens')), job, 'x')).message).toBe(
			'That question isn’t on this kit any more.'
		);
		expect(
			(await draftLetter(db, using(answering('max_tokens')), job, 'letter_short')).message
		).toBe('The model ran out of room before finishing a letter ($0.01 spent). Try again.');
		expect(await spentOn(db, '2026-11-20')).toBe(14_000);
	});
});

describe('stored drafts', () => {
	it('fails loudly on a stored draft it doesn’t recognise, and goes with its company', async () => {
		await draftLetter(db, using(letter([[{ text: 'Flight Co.', facts: [] }]])), job, 'letter_full');
		await db.prepare(`UPDATE drafts SET problems = '[{"problem": 1}]'`).run();
		await expect(getDrafts(db, job)).rejects.toThrow(StoredDataError);
		await db.prepare(`UPDATE drafts SET problems = '[]', paragraphs = '[[]]'`).run();
		await expect(getDrafts(db, job)).rejects.toThrow(StoredDataError);
		await db.prepare('PRAGMA ignore_check_constraints = ON').run();
		await db
			.prepare(`UPDATE drafts SET paragraphs = '[[{"text":"x","facts":[]}]]', kind = 'poem'`)
			.run();
		await expect(getDrafts(db, job)).rejects.toThrow(StoredDataError);
		await db.prepare(`UPDATE drafts SET kind = 'letter_full', problems = '{}'`).run();
		await expect(getDrafts(db, job)).rejects.toThrow(StoredDataError);
		await db.prepare('PRAGMA ignore_check_constraints = OFF').run();
		await removeBoard(db, 'lever', 'Flight');
		expect(await db.prepare('SELECT COUNT(*) AS n FROM drafts').first()).toEqual({ n: 0 });
	});
});

describe('answer drafts', () => {
	const WHY = 'Why do you want to join Flight Co?';
	const LEAD = 'Tell us about a time you led a team.';
	const PAY = 'What are your salary expectations?';

	beforeEach(async () => {
		await savePasted(db, job, [WHY, LEAD, PAY, 'x'.repeat(100)].join('\n'));
	});

	it('drafts an answer to a kit question, checks it, and keeps it', async () => {
		const fetcher = letter([
			[{ text: 'I led a 12-person flight security team.', facts: [factId] }]
		]);
		expect(await draftAnswer(db, using(fetcher), job, LEAD)).toEqual({
			ok: true,
			message:
				'Drafted an answer ($0.01). Every sentence is backed by its facts. Read it, and make it yours.'
		});
		const sent = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string) as {
			system: string;
			messages: { content: string }[];
		};
		expect(sent.system).toMatch(/one question on a job application/);
		expect(sent.messages[0]?.content).toMatch(/"question":"Tell us about a time you led a team\."/);
		const [draft] = await getAnswerDrafts(db, job);
		expect(draft).toMatchObject({
			question: LEAD,
			problems: [],
			model: 'claude-sonnet-5-5',
			costMicros: 7000
		});
	});

	it('asks a why-this-company answer to name the company', async () => {
		await draftAnswer(
			db,
			using(letter([[{ text: 'I led a 12-person flight security team.', facts: [factId] }]])),
			job,
			WHY
		);
		expect((await getAnswerDrafts(db, job))[0]?.problems).toEqual([
			{ paragraph: -1, sentence: -1, problem: 'Never names Flight Co.' }
		]);
	});

	it('won’t draft situation questions, questions not on the kit, or for no-AI postings', async () => {
		const fetcher = vi.fn<typeof fetch>();
		expect((await draftAnswer(db, using(fetcher), job, PAY)).message).toMatch(
			/about your situation/
		);
		expect((await draftAnswer(db, using(fetcher), job, 'Not asked?')).message).toBe(
			'That question isn’t on this kit any more.'
		);
		await setAiRule(db, job, 'forbids', '');
		expect((await draftAnswer(db, using(fetcher), job, LEAD)).message).toBe(
			'This posting forbids AI-written answers, so Job Ranger won’t draft an answer for it.'
		);
		await db.prepare('DELETE FROM kits').run();
		expect((await draftAnswer(db, using(fetcher), job, LEAD)).message).toBe(
			'That question isn’t on this kit any more.'
		);
		expect(fetcher).not.toHaveBeenCalled();
		expect((await draftAnswer(db, using(letter('nonsense')), job, 'x'.repeat(100))).message).toBe(
			'That question isn’t on this kit any more.'
		);
	});

	it('drafts the form’s own questions too, but not its name and contact fields', async () => {
		await db
			.prepare(
				`UPDATE kits SET questions = '[{"label":"Why us?","required":true,"basic":false},{"label":"Email","required":true,"basic":true}]'`
			)
			.run();
		const fetcher = letter([[{ text: 'Flight Co, because I led a team.', facts: [factId] }]]);
		expect((await draftAnswer(db, using(fetcher), job, 'Why us?')).ok).toBe(true);
		expect((await draftAnswer(db, using(fetcher), job, 'Email')).message).toBe(
			'That question isn’t on this kit any more.'
		);
	});

	it('says when the model’s answer isn’t the shape asked for', async () => {
		expect((await draftAnswer(db, using(letter('nonsense')), job, LEAD)).message).toBe(
			'The model didn’t return an answer in the shape asked for ($0.01 spent). Try again.'
		);
	});

	it('keeps my edited answer in the answer bank, labeled and noted, and drops the draft', async () => {
		await draftAnswer(db, using(letter([[{ text: 'I led a team.', facts: [factId] }]])), job, LEAD);
		expect(await keepAnswerDraft(db, job, LEAD, '  I led a team. ', NOW)).toEqual({
			ok: false,
			message:
				'Make it yours first: change at least a word. It’s saved as “AI draft, edited by me”, so it should be.'
		});
		expect(await keepAnswerDraft(db, job, LEAD, 'x'.repeat(5001), NOW)).toEqual({
			ok: false,
			message: 'Keep an answer under 5000 characters.'
		});
		expect(
			await keepAnswerDraft(db, job, LEAD, 'I led a twelve-person team in the Air Force.', NOW)
		).toEqual({
			ok: true,
			message: 'Saved your edited answer to Answers, labeled “AI draft, edited by me”.'
		});
		expect(await listAnswers(db)).toMatchObject([
			{
				question: 'leadership',
				label: LEAD,
				text: 'I led a twelve-person team in the Air Force.',
				origin: 'ai_edited',
				notes:
					'Drafted by claude-sonnet-5-5 for Pilot at Flight Co on 2026-11-20, then edited by me.'
			}
		]);
		expect(await getAnswerDrafts(db, job)).toEqual([]);
		expect(await keepAnswerDraft(db, job, LEAD, 'Again.', NOW)).toEqual({
			ok: false,
			message: 'That draft is no longer here.'
		});
	});

	it('shortens a long question into the answer’s name, files unmatched ones under Other, and copes with a gone posting', async () => {
		const long = `Describe your favorite ${'very '.repeat(20)}long story.`;
		await savePasted(db, job, long);
		await draftAnswer(db, using(letter([[{ text: 'A story.', facts: [factId] }]])), job, long);
		await db.prepare('DELETE FROM postings').run();
		await keepAnswerDraft(db, job, long, 'My story, my words.', NOW);
		const [saved] = await listAnswers(db);
		expect(saved?.question).toBe('other');
		expect(saved?.label).toHaveLength(80);
		expect(saved?.label.endsWith('…')).toBe(true);
		expect(saved?.notes).toMatch(/for a job on/);
	});

	it('fails loudly on a stored answer draft it doesn’t recognise, and drops drafts with the company', async () => {
		await draftAnswer(db, using(letter([[{ text: 'I led a team.', facts: [factId] }]])), job, LEAD);
		await db.prepare(`UPDATE answer_drafts SET problems = '[1]'`).run();
		await expect(getAnswerDrafts(db, job)).rejects.toThrow(StoredDataError);
		await removeBoard(db, 'lever', 'Flight');
		expect(await db.prepare('SELECT COUNT(*) AS n FROM answer_drafts').first()).toEqual({ n: 0 });
	});
});

describe('cost per application', () => {
	it('logs every call against its job, even ones that fail, and saves the total when I apply', async () => {
		expect(await jobDraftingCost(db, job)).toBe(0);
		await draftLetter(db, using(letter([[{ text: 'Flight Co.', facts: [] }]])), job, 'letter_full');
		const refusing = vi.fn<typeof fetch>(() =>
			Promise.resolve(
				Response.json({
					content: [],
					model: 'claude-sonnet-5-5',
					stop_reason: 'refusal',
					usage: { input_tokens: 500, output_tokens: 0 }
				})
			)
		);
		await draftLetter(db, using(refusing), job, 'letter_short');
		expect(await jobDraftingCost(db, job)).toBe(8000);
		expect(
			(await db.prepare('SELECT kind, model, price_table FROM draft_costs ORDER BY id').all())
				.results
		).toEqual([
			{ kind: 'letter_full', model: 'claude-sonnet-5-5', price_table: '2026-11-20' },
			{ kind: 'letter_short', model: 'claude-sonnet-5-5', price_table: '2026-11-20' }
		]);
		expect(await appliedDraftingCost(db)).toEqual({ applications: 0, micros: 0 });
		const posting = await getPosting(db, job);
		if (!posting) throw new Error('no posting');
		await markApplied(db, posting, [], NOW);
		expect(await appliedDraftingCost(db)).toEqual({ applications: 1, micros: 8000 });
		await removeBoard(db, 'lever', 'Flight');
		expect(await jobDraftingCost(db, job)).toBe(0);
		// The application keeps what drafting for it cost.
		expect(await appliedDraftingCost(db)).toEqual({ applications: 1, micros: 8000 });
	});

	it('logs answer drafts as answers', async () => {
		await savePasted(db, job, 'Tell us about a time you led a team.');
		await draftAnswer(
			db,
			using(letter([[{ text: 'I led a team.', facts: [factId] }]])),
			job,
			'Tell us about a time you led a team.'
		);
		expect(await db.prepare('SELECT kind, cost_micros FROM draft_costs').first()).toEqual({
			kind: 'answer',
			cost_micros: 7000
		});
	});
});

describe('resume summary drafts', () => {
	const BACKED = 'Led a 12-person flight security team in the Air Force.';

	it('drafts a summary from the picked facts, checks it, and keeps it off the resume until chosen', async () => {
		const fetcher = letter([[{ text: BACKED, facts: [factId] }]]);
		expect(await draftSummary(db, using(fetcher), job)).toEqual({
			ok: true,
			message:
				'Drafted a summary ($0.01). Every sentence is backed by its facts. Read it, and make it yours.'
		});
		const sent = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string) as {
			system: string;
			messages: { content: string }[];
		};
		expect(sent.system).toMatch(/the summary at the top of a resume/);
		expect(sent.messages[0]?.content).toMatch(/Led a 12-person flight security team/);
		expect(await getSummaryDraft(db, job)).toMatchObject({
			problems: [],
			model: 'claude-sonnet-5-5',
			costMicros: 7000,
			kept: null
		});
		expect(
			await db
				.prepare('SELECT kind, cost_micros FROM draft_costs WHERE kind = ?1')
				.bind('summary')
				.first()
		).toEqual({ kind: 'summary', cost_micros: 7000 });
		expect(await jobDraftingCost(db, job)).toBe(7000);
	});

	it('flags a sentence without facts, and doesn’t ask for the company', async () => {
		const fetcher = letter([
			[
				{ text: BACKED, facts: [factId] },
				{ text: 'A natural leader.', facts: [] }
			]
		]);
		expect((await draftSummary(db, using(fetcher), job)).message).toMatch(/found 1 problem\./);
		expect((await getSummaryDraft(db, job))?.problems).toEqual([
			{ paragraph: 0, sentence: 1, problem: 'Makes a claim without citing a fact.' }
		]);
	});

	it('won’t draft where AI is forbidden, or put a draft on that resume', async () => {
		await draftSummary(db, using(letter([[{ text: BACKED, facts: [factId] }]])), job);
		await setAiRule(db, job, 'forbids', 'No AI.');
		const fetcher = vi.fn<typeof fetch>();
		expect((await draftSummary(db, using(fetcher), job)).message).toBe(
			'This posting forbids AI-written answers, so Job Ranger won’t draft a summary for it.'
		);
		expect(fetcher).not.toHaveBeenCalled();
		expect(await keepSummary(db, job, BACKED, NOW)).toEqual({
			ok: false,
			message: 'This posting forbids AI-written answers, so the resume keeps your picked facts.'
		});
	});

	it('puts a clean draft on the resume as drafted, and a flagged one only once edited', async () => {
		expect((await keepSummary(db, job, BACKED, NOW)).message).toBe(
			'That summary draft is no longer here.'
		);
		await draftSummary(db, using(letter([[{ text: BACKED, facts: [factId] }]])), job);
		expect(await keepSummary(db, job, `  ${BACKED}\n`, NOW)).toEqual({
			ok: true,
			message:
				'The drafted summary is on the resume for this job. Every sentence is backed by its facts.'
		});
		expect((await getSummaryDraft(db, job))?.kept).toEqual({
			text: BACKED,
			edited: false,
			at: NOW
		});

		const flagged = 'Led a 99-person team.';
		await draftSummary(db, using(letter([[{ text: flagged, facts: [factId] }]])), job);
		// A new draft takes the old choice off the resume.
		expect((await getSummaryDraft(db, job))?.kept).toBeNull();
		expect((await keepSummary(db, job, flagged, NOW)).message).toMatch(
			/^The checks found problems in this draft\./
		);
		expect((await keepSummary(db, job, '  ', NOW)).message).toBe(
			'Write the summary first: the box is empty.'
		);
		expect((await keepSummary(db, job, 'x'.repeat(1501), NOW)).message).toBe(
			'That’s 1501 characters. Keep the summary under 1500.'
		);
		expect((await keepSummary(db, job, 'Led a 12-person team.', NOW)).message).toBe(
			'Your edited summary is on the resume for this job.'
		);
		expect((await getSummaryDraft(db, job))?.kept).toMatchObject({ edited: true });

		expect((await dropSummary(db, job)).message).toBe(
			'The resume uses your picked facts for its summary again.'
		);
		expect(await getSummaryDraft(db, job)).toMatchObject({ kept: null, problems: [{}] });
	});

	it('fails loudly on a stored summary it doesn’t recognise, and goes with its company', async () => {
		await draftSummary(db, using(letter([[{ text: BACKED, facts: [factId] }]])), job);
		await db.prepare(`UPDATE resume_summaries SET problems = '[{"problem": 1}]'`).run();
		await expect(getSummaryDraft(db, job)).rejects.toThrow(StoredDataError);
		await removeBoard(db, 'lever', 'Flight');
		expect(await db.prepare('SELECT COUNT(*) AS n FROM resume_summaries').first()).toEqual({
			n: 0
		});
	});
});
