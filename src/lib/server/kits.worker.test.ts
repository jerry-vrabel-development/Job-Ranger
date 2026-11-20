import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Board } from '#lib/jobs/posting.ts';
import { removeBoard, StoredDataError } from './db.ts';
import {
	appliedDates,
	getApplication,
	getKit,
	getPosting,
	kitCount,
	markApplied,
	parseJobKey,
	prepareKit,
	dismissGap,
	savePasted,
	savePostingText,
	setAiRule,
	unmarkApplied,
	type JobKey
} from './kits.ts';
import { addBoard, migratedDb } from './test-db.ts';

const civic: Board = { source: 'greenhouse', token: 'civic', company: 'Civic Co' };
const flight: Board = { source: 'lever', token: 'Flight', company: 'Flight Co' };
const greenhouseJob: JobKey = { source: 'greenhouse', board: 'civic', id: '101' };
const leverJob: JobKey = { source: 'lever', board: 'Flight', id: 'abc' };

const form = (content: string) => ({
	id: 101,
	content,
	questions: [
		{ required: true, label: 'First Name', fields: [{ name: 'first_name', type: 'input_text' }] },
		{
			required: true,
			label: 'Why do you want to join us?',
			fields: [{ name: 'q1', type: 'textarea' }]
		},
		{ required: false, label: 'Pay expectations?', fields: [{ name: 'q2', type: 'input_text' }] }
	]
});

const answering = (body: unknown) =>
	vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body)));
const failing = (response: () => Response | Promise<Response>) =>
	vi.fn<typeof fetch>(() => Promise.resolve(response()));

let db: D1Database;

beforeEach(async () => {
	db = await migratedDb();
	await db.batch([
		db.prepare('DELETE FROM kits'),
		db.prepare('DELETE FROM applications'),
		db.prepare('DELETE FROM postings'),
		db.prepare('DELETE FROM boards')
	]);
	await addBoard(db, civic);
	await addBoard(db, flight);
	const insert = db.prepare(
		`INSERT INTO postings (source, board, id, company, title, location, workplace, apply_url,
		 first_seen_at, last_seen_at) VALUES (?1, ?2, ?3, ?4, ?5, 'Remote', 'remote', ?6, ?7, ?7)`
	);
	await db.batch([
		insert.bind(
			'greenhouse',
			'civic',
			'101',
			'Civic Co',
			'Engineer',
			'https://x.test/101',
			'2026-11-19T00:00:00.000Z'
		),
		insert.bind(
			'lever',
			'Flight',
			'abc',
			'Flight Co',
			'Pilot',
			'https://x.test/abc',
			'2026-11-19T00:00:00.000Z'
		)
	]);
});

describe('parseJobKey and getPosting', () => {
	it('reads a job key from the address, and finds the posting', async () => {
		expect(parseJobKey('lever', 'Flight', 'abc')).toEqual(leverJob);
		const bad: [string, string, string][] = [
			['workday', 'x', '1'],
			['lever', '', '1'],
			['lever', 'x'.repeat(101), '1'],
			['lever', 'x', ''],
			['lever', 'x', 'y'.repeat(201)]
		];
		for (const [source, board, id] of bad) expect(parseJobKey(source, board, id)).toBeNull();
		expect((await getPosting(db, leverJob))?.title).toBe('Pilot');
		expect(await getKit(db, leverJob)).toBeNull();
		expect(await getPosting(db, { ...leverJob, id: 'gone' })).toBeNull();
	});
});

describe('prepareKit', () => {
	it('reads a Greenhouse form, keeps its questions, and finds an AI rule', async () => {
		const fetcher = answering(form('&lt;p&gt;Please do not use AI to write answers.&lt;/p&gt;'));
		expect(await prepareKit(db, fetcher, greenhouseJob)).toEqual({
			ok: true,
			message: 'Read the form from Greenhouse: 2 questions beyond name, contact and files.'
		});
		expect(fetcher).toHaveBeenCalledOnce();
		expect(await getKit(db, greenhouseJob)).toEqual({
			questions: [
				{ label: 'First Name', required: true, basic: true },
				{ label: 'Why do you want to join us?', required: true, basic: false },
				{ label: 'Pay expectations?', required: false, basic: false }
			],
			pasted: [],
			readNote: 'Read the form from Greenhouse: 2 questions beyond name, contact and files.',
			aiRule: 'forbids',
			aiSentence: 'Please do not use AI to write answers.',
			aiDecidedBy: 'check',
			postingText: 'Please do not use AI to write answers.',
			dismissed: []
		});
	});

	it('says when the check finds no rule, and words one question in the singular', async () => {
		const one = { ...form('We build things.'), questions: [form('').questions[1]] };
		expect((await prepareKit(db, answering(one), greenhouseJob)).message).toMatch(
			/: 1 question beyond/
		);
		expect(await getKit(db, greenhouseJob)).toMatchObject({ aiRule: 'none', aiDecidedBy: 'check' });
	});

	it('keeps my say on the AI rule when the form is read again', async () => {
		await prepareKit(db, answering(form('Nothing about it.')), greenhouseJob);
		await setAiRule(db, greenhouseJob, 'forbids', ' The   posting says no AI. ');
		await prepareKit(db, answering(form('Nothing about it.')), greenhouseJob);
		expect(await getKit(db, greenhouseJob)).toMatchObject({
			aiRule: 'forbids',
			aiSentence: 'The posting says no AI.',
			aiDecidedBy: 'me'
		});
	});

	it('says why a Greenhouse form could not be read, and asks for a paste', async () => {
		const cases: [ReturnType<typeof failing>, string][] = [
			[failing(() => new Response('', { status: 404 })), 'Board not found (404)'],
			[failing(() => Response.json({ nope: true })), 'its answer was not in the shape we know'],
			[vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline'))), 'it did not answer']
		];
		for (const [fetcher, why] of cases) {
			expect((await prepareKit(db, fetcher, greenhouseJob)).message).toBe(
				`Couldn't read the form from Greenhouse (${why}). Paste the questions in from the form.`
			);
		}
		expect(await getKit(db, greenhouseJob)).toMatchObject({
			questions: [],
			aiRule: 'unknown',
			aiDecidedBy: null
		});
	});

	it('asks for a paste on boards that do not share questions, without reading them', async () => {
		const fetcher = vi.fn<typeof fetch>();
		expect((await prepareKit(db, fetcher, leverJob)).message).toBe(
			"Lever doesn't share a form's questions. Paste them in from the form."
		);
		expect(fetcher).not.toHaveBeenCalled();
		expect(await kitCount(db)).toBe(1);
	});
});

describe('pasted questions and the AI rule', () => {
	it('saves pasted questions, one per line, and clears them', async () => {
		await prepareKit(db, vi.fn<typeof fetch>(), leverJob);
		expect(await savePasted(db, leverJob, ' Why us?  \r\n\r\nWhat   pay do you want?\n')).toEqual({
			ok: true,
			message: 'Saved 2 pasted questions.'
		});
		expect((await getKit(db, leverJob))?.pasted).toEqual(['Why us?', 'What pay do you want?']);
		expect((await savePasted(db, leverJob, 'Just one')).message).toBe('Saved 1 pasted question.');
		expect((await savePasted(db, leverJob, '  ')).message).toBe('Cleared the pasted questions.');
		expect((await getKit(db, leverJob))?.pasted).toEqual([]);
	});

	it('refuses too many or too long, and needs a kit first', async () => {
		await prepareKit(db, vi.fn<typeof fetch>(), leverJob);
		expect(
			await savePasted(
				db,
				leverJob,
				Array.from({ length: 61 }, (_, i) => `Q${String(i)}`).join('\n')
			)
		).toEqual({ ok: false, message: 'Paste up to 60 questions.' });
		expect((await savePasted(db, leverJob, 'x'.repeat(501))).message).toBe(
			'Keep each question under 500 characters.'
		);
		const noKit = { ok: false, message: 'Prepare the kit first.' };
		expect(await savePasted(db, greenhouseJob, 'Why?')).toEqual(noKit);
		expect(await setAiRule(db, greenhouseJob, 'none', '')).toEqual(noKit);
	});

	it('records my say on the AI rule, dropping the sentence when there is no rule', async () => {
		await prepareKit(db, vi.fn<typeof fetch>(), leverJob);
		expect((await setAiRule(db, leverJob, 'forbids', 'No AI.')).message).toMatch(
			/^Marked: this posting forbids/
		);
		expect((await setAiRule(db, leverJob, 'none', 'ignored')).message).toBe(
			'Marked: no AI rule on this posting.'
		);
		expect(await getKit(db, leverJob)).toMatchObject({
			aiRule: 'none',
			aiSentence: '',
			aiDecidedBy: 'me'
		});
	});

	it('fails loudly on stored questions or an AI rule it does not know', async () => {
		await prepareKit(db, vi.fn<typeof fetch>(), leverJob);
		await db.prepare(`UPDATE kits SET questions = '[{"label": 1}]'`).run();
		await expect(getKit(db, leverJob)).rejects.toThrow(StoredDataError);
		await db.prepare(`UPDATE kits SET questions = '[null]'`).run();
		await expect(getKit(db, leverJob)).rejects.toThrow(StoredDataError);
		await db.prepare(`UPDATE kits SET questions = '[]'`).run();
		await db.prepare('PRAGMA ignore_check_constraints = ON').run();
		await db.prepare(`UPDATE kits SET ai_rule = 'maybe'`).run();
		await expect(getKit(db, leverJob)).rejects.toThrow(StoredDataError);
		await db.prepare(`UPDATE kits SET ai_rule = 'none', questions = '{}'`).run();
		await expect(getKit(db, leverJob)).rejects.toThrow(StoredDataError);
		await db.prepare('PRAGMA ignore_check_constraints = OFF').run();
	});
});

describe('applications', () => {
	it('records, dates and undoes an application, keeping company and title', async () => {
		const posting = await getPosting(db, leverJob);
		if (!posting) throw new Error('no posting');
		expect(await markApplied(db, posting, [3, 7], '2026-11-20T15:00:00.000Z')).toEqual({
			ok: true,
			message: 'Recorded: you applied to Pilot at Flight Co.'
		});
		expect(await getApplication(db, leverJob)).toEqual({ appliedAt: '2026-11-20T15:00:00.000Z' });
		expect(await appliedDates(db)).toEqual(
			new Map([['lever:Flight:abc', '2026-11-20T15:00:00.000Z']])
		);
		expect(await db.prepare('SELECT company, title, answer_ids FROM applications').first()).toEqual(
			{
				company: 'Flight Co',
				title: 'Pilot',
				answer_ids: '[3,7]'
			}
		);
		await markApplied(db, posting, [], '2026-11-21T15:00:00.000Z');
		expect(await getApplication(db, leverJob)).toEqual({ appliedAt: '2026-11-21T15:00:00.000Z' });
		expect(await unmarkApplied(db, leverJob)).toEqual({
			ok: true,
			message: 'Removed the application record.'
		});
		expect(await getApplication(db, leverJob)).toBeNull();
		expect(await unmarkApplied(db, leverJob)).toEqual({
			ok: false,
			message: 'There was no application recorded for this job.'
		});
	});

	it('keeps applications when a company is removed, but drops its kits', async () => {
		await prepareKit(db, vi.fn<typeof fetch>(), leverJob);
		const posting = await getPosting(db, leverJob);
		if (!posting) throw new Error('no posting');
		await markApplied(db, posting, [], '2026-11-20T15:00:00.000Z');
		await removeBoard(db, 'lever', 'Flight');
		expect(await kitCount(db)).toBe(0);
		expect(await appliedDates(db)).toEqual(
			new Map([['lever:Flight:abc', '2026-11-20T15:00:00.000Z']])
		);
	});
});

describe('posting text and gaps', () => {
	it('saves pasted posting text, and lets the AI check read it', async () => {
		await prepareKit(db, vi.fn<typeof fetch>(), leverJob);
		expect(
			await savePostingText(db, leverJob, '  We build drones.\n\nNo AI-written answers, please.  ')
		).toEqual({
			ok: true,
			message: 'Saved the posting text.'
		});
		expect(await getKit(db, leverJob)).toMatchObject({
			postingText: 'We build drones. No AI-written answers, please.',
			aiRule: 'forbids',
			aiSentence: 'No AI-written answers, please.',
			aiDecidedBy: 'check'
		});
		await savePostingText(db, leverJob, 'We build drones.');
		expect(await getKit(db, leverJob)).toMatchObject({ aiRule: 'none', aiSentence: '' });
	});

	it('keeps my AI call over new text, and clearing the text leaves the rule alone', async () => {
		await prepareKit(db, vi.fn<typeof fetch>(), leverJob);
		await setAiRule(db, leverJob, 'none', '');
		await savePostingText(db, leverJob, 'Do not use AI tools to answer.');
		expect(await getKit(db, leverJob)).toMatchObject({ aiRule: 'none', aiDecidedBy: 'me' });
		await setAiRule(db, leverJob, 'forbids', 'Mine.');
		expect((await savePostingText(db, leverJob, ' ')).message).toBe('Cleared the posting text.');
		expect(await getKit(db, leverJob)).toMatchObject({
			postingText: '',
			aiRule: 'forbids',
			aiSentence: 'Mine.'
		});
	});

	it('keeps pasted text when a board read gives none, and refuses a huge paste', async () => {
		await prepareKit(
			db,
			failing(() => new Response('', { status: 500 })),
			greenhouseJob
		);
		await savePostingText(db, greenhouseJob, 'Pasted words.');
		await prepareKit(
			db,
			failing(() => new Response('', { status: 500 })),
			greenhouseJob
		);
		expect((await getKit(db, greenhouseJob))?.postingText).toBe('Pasted words.');
		expect(await savePostingText(db, greenhouseJob, 'x'.repeat(30_001))).toEqual({
			ok: false,
			message: 'That posting is too long to keep; paste the main part.'
		});
		expect(await savePostingText(db, leverJob, 'x')).toEqual({
			ok: false,
			message: 'Prepare the kit first.'
		});
	});

	it('remembers skills I said I do not have', async () => {
		await prepareKit(db, vi.fn<typeof fetch>(), leverJob);
		expect(await dismissGap(db, leverJob, 'Kubernetes')).toEqual({
			ok: true,
			message: 'Noted: no Kubernetes. It stays off this resume, which is honest.'
		});
		await dismissGap(db, leverJob, 'Terraform');
		expect((await getKit(db, leverJob))?.dismissed).toEqual(['Kubernetes', 'Terraform']);
		expect(await dismissGap(db, greenhouseJob, 'Go')).toEqual({
			ok: false,
			message: 'Prepare the kit first.'
		});
		await db.prepare(`UPDATE kits SET dismissed = '[1]'`).run();
		await expect(getKit(db, leverJob)).rejects.toThrow(StoredDataError);
	});
});
