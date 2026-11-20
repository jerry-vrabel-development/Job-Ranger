import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Board } from '#lib/jobs/posting.ts';
import { removeBoard, StoredDataError } from './db.ts';
import {
	capMicros,
	dollars,
	draftLetter,
	getDrafts,
	recordUsage,
	spentOn,
	type DraftSettings
} from './drafts.ts';
import { addFact, pasteFacts } from './facts.ts';
import { prepareKit, setAiRule, type JobKey } from './kits.ts';
import { addBoard, migratedDb } from './test-db.ts';

const flight: Board = { source: 'lever', token: 'Flight', company: 'Flight Co' };
const other: Board = { source: 'lever', token: 'other', company: 'Spotify' };
const job: JobKey = { source: 'lever', board: 'Flight', id: 'abc' };
const NOW = '2026-11-20T15:00:00.000Z';
const settings: DraftSettings = { apiKey: 'sk-test', capMicros: 1_000_000, now: NOW };

let db: D1Database;
let factId = 0;

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
		expect(
			await recordUsage(db, '2026-11-20', 'claude-sonnet-5-5', {
				inputTokens: 1000,
				outputTokens: 500
			})
		).toBe(7000);
		await recordUsage(db, '2026-11-20', 'claude-sonnet-5-5', {
			inputTokens: 1000,
			outputTokens: 500
		});
		await recordUsage(db, '2026-11-20', 'claude-haiku-5-5', { inputTokens: 1000, outputTokens: 0 });
		await recordUsage(db, '2026-11-21', 'claude-sonnet-5-5', { inputTokens: 1, outputTokens: 0 });
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
		expect(await draftLetter(db, fetcher, settings, job, 'letter_full')).toEqual({
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
		expect((await draftLetter(db, fetcher, settings, job, 'letter_short')).message).toBe(
			'Drafted a short letter ($0.01), but the checks found 3 problems. Fix or cut those sentences before you use it.'
		);
		expect((await getDrafts(db, job))[0]?.problems).toHaveLength(3);
		const one = letter([[{ text: 'Flight Co needs a 99-person team.', facts: [factId] }]]);
		expect((await draftLetter(db, one, settings, job, 'letter_short')).message).toMatch(
			/found 1 problem\./
		);
		expect(await getDrafts(db, job)).toHaveLength(1);
	});

	it('says why it can’t draft, before spending anything', async () => {
		const fetcher = vi.fn<typeof fetch>();
		expect(
			(await draftLetter(db, fetcher, { ...settings, apiKey: '' }, job, 'letter_full')).message
		).toBe('Drafting isn’t set up yet: the Worker has no API key.');
		expect(
			(await draftLetter(db, fetcher, settings, { ...job, id: 'gone' }, 'letter_full')).message
		).toBe('That job is no longer in Job Ranger.');
		await db.prepare('DELETE FROM kits').run();
		expect((await draftLetter(db, fetcher, settings, job, 'letter_full')).message).toBe(
			'Prepare the kit first.'
		);
		await prepareKit(db, vi.fn<typeof fetch>(), job);
		await setAiRule(db, job, 'forbids', 'No AI.');
		expect((await draftLetter(db, fetcher, settings, job, 'letter_full')).message).toMatch(
			/forbids AI-written answers/
		);
		await setAiRule(db, job, 'none', '');
		await recordUsage(db, '2026-11-20', 'claude-sonnet-5-5', {
			inputTokens: 0,
			outputTokens: 100_000
		});
		expect((await draftLetter(db, fetcher, settings, job, 'letter_full')).message).toBe(
			'Today’s drafting limit is reached ($1.00 of $1.00). It resets at midnight UTC.'
		);
		await db.prepare('DELETE FROM model_usage').run();
		await db.prepare('DELETE FROM facts').run();
		await pasteFacts(db, [
			{ kind: 'skill', experience: 'side', organization: '', period: '', text: 'Unconfirmed' }
		]);
		expect((await draftLetter(db, fetcher, settings, job, 'letter_full')).message).toBe(
			'There are no confirmed facts to draft from yet.'
		);
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('passes API errors on in words, and charges for an answer in the wrong shape', async () => {
		const refused = vi.fn<typeof fetch>(() => Promise.resolve(new Response('', { status: 401 })));
		expect((await draftLetter(db, refused, settings, job, 'letter_full')).message).toBe(
			'Couldn’t draft: the API key was refused.'
		);
		expect((await draftLetter(db, letter('nonsense'), settings, job, 'letter_full')).message).toBe(
			'The model didn’t return a letter in the shape asked for ($0.01 spent). Try again.'
		);
		expect(await spentOn(db, '2026-11-20')).toBe(7000);
		expect(await getDrafts(db, job)).toEqual([]);
	});

	it('lets unexpected errors through, rather than calling them API errors', async () => {
		// Not a Response at all: a bug, not the API saying no.
		const broken = vi.fn<typeof fetch>(() => Promise.resolve(null as unknown as Response));
		await expect(draftLetter(db, broken, settings, job, 'letter_full')).rejects.toThrow(TypeError);
	});
});

describe('stored drafts', () => {
	it('fails loudly on a stored draft it doesn’t recognise, and goes with its company', async () => {
		await draftLetter(
			db,
			letter([[{ text: 'Flight Co.', facts: [] }]]),
			settings,
			job,
			'letter_full'
		);
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
