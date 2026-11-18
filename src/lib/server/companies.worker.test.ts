import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Board } from '#lib/jobs/posting.ts';
import ashbyBoard from '#lib/sources/fixtures/ashby-board.json' with { type: 'json' };
import greenhouseBoard from '#lib/sources/fixtures/greenhouse-board.json' with { type: 'json' };
import {
	addCompany,
	boardKey,
	checkNow,
	COMPANY_MAX,
	pauseCompany,
	removeCompany
} from './companies.ts';
import { findBoard, insertBoard, listOpenPostings, setPaused } from './db.ts';
import { addBoard, migratedDb } from './test-db.ts';

const NOW = new Date('2026-11-18T16:00:00.000Z');

/** A network that answers per board name, and records what was asked. */
function network(boards: Record<string, () => Response | Promise<Response>>) {
	return vi.fn<typeof fetch>((input) => {
		const url = new URL(input instanceof Request ? input.url : String(input));
		const parts = url.pathname.split('/');
		// Greenhouse: /v1/boards/{token}/jobs. Ashby: /posting-api/job-board/{token}.
		const token = decodeURIComponent(
			parts.at(-1) === 'jobs' ? (parts.at(-2) ?? '') : (parts.at(-1) ?? '')
		);
		const answer = boards[token];
		return Promise.resolve(answer ? answer() : new Response('not found', { status: 404 }));
	});
}

const json = (body: unknown) => () => Response.json(body);
const offline = vi.fn<typeof fetch>(() => Promise.reject(new Error('no network in this test')));

let db: D1Database;

beforeEach(async () => {
	db = await migratedDb();
	await db.batch([db.prepare('DELETE FROM postings'), db.prepare('DELETE FROM boards')]);
	offline.mockClear();
});

describe('addCompany', () => {
	it('checks the board, then adds it with the jobs it found', async () => {
		const fetcher = network({ splice: json(greenhouseBoard) });
		const result = await addCompany(
			db,
			fetcher,
			'https://job-boards.greenhouse.io/splice/jobs/1',
			'  Splice  ',
			NOW
		);
		expect(result).toEqual({ ok: true, message: 'Added Splice: 2 open jobs found.' });
		expect(fetcher).toHaveBeenCalledOnce();
		expect(fetcher).toHaveBeenCalledWith(
			'https://boards-api.greenhouse.io/v1/boards/splice/jobs?content=true',
			expect.anything()
		);
		expect(await findBoard(db, 'greenhouse', 'splice')).toMatchObject({
			company: 'Splice',
			lastFetchedAt: NOW.toISOString(),
			lastFetchOk: true,
			openJobs: 2
		});
		expect((await listOpenPostings(db)).every((p) => p.company === 'Splice')).toBe(true);
	});

	it('says "1 open job" for one', async () => {
		const one = { ...greenhouseBoard, jobs: greenhouseBoard.jobs.slice(0, 1) };
		const result = await addCompany(
			db,
			network({ one: json(one) }),
			'job-boards.greenhouse.io/one',
			'One',
			NOW
		);
		expect(result).toEqual({ ok: true, message: 'Added One: 1 open job found.' });
	});

	it('reads Ashby boards too', async () => {
		const result = await addCompany(
			db,
			network({ suno: json(ashbyBoard) }),
			'jobs.ashbyhq.com/suno',
			'Suno',
			NOW
		);
		expect(result.ok).toBe(true);
		expect(await findBoard(db, 'ashby', 'suno')).toMatchObject({ openJobs: 2 });
	});

	it('explains a link it cannot use, without going to the network', async () => {
		const result = await addCompany(db, offline, 'https://www.splice.com/careers', 'Splice', NOW);
		expect(result).toMatchObject({ ok: false, field: 'link' });
		expect(offline).not.toHaveBeenCalled();
	});

	it.each([
		['', 'Give the company a name.'],
		['   ', 'Give the company a name.'],
		['x'.repeat(COMPANY_MAX + 1), `Keep the name under ${String(COMPANY_MAX)} characters.`]
	])('asks for a usable company name (%#)', async (name, message) => {
		const result = await addCompany(db, offline, 'jobs.ashbyhq.com/suno', name, NOW);
		expect(result).toEqual({ ok: false, field: 'company', message });
		expect(offline).not.toHaveBeenCalled();
	});

	it('tidies the spaces in a company name', async () => {
		await addCompany(
			db,
			network({ suno: json(ashbyBoard) }),
			'jobs.ashbyhq.com/suno',
			' Suno \n  Inc ',
			NOW
		);
		expect(await findBoard(db, 'ashby', 'suno')).toMatchObject({ company: 'Suno Inc' });
	});

	it('says when the board is already on the list, and by what name', async () => {
		await addBoard(db, { source: 'ashby', token: 'suno', company: 'Suno' });
		const result = await addCompany(db, offline, 'jobs.ashbyhq.com/Suno', 'Again', NOW);
		expect(result).toEqual({
			ok: false,
			field: 'link',
			message: 'That board is already on your list, as Suno.'
		});
		expect(offline).not.toHaveBeenCalled();
	});

	it('does not add a board that does not exist', async () => {
		const result = await addCompany(
			db,
			network({}),
			'job-boards.greenhouse.io/splise',
			'Splice',
			NOW
		);
		expect(result).toEqual({
			ok: false,
			field: 'link',
			message: "There's no Greenhouse board called “splise”. Check the spelling in the link."
		});
		expect(await findBoard(db, 'greenhouse', 'splise')).toBeNull();
	});

	it.each([
		['an error status', () => new Response('down', { status: 503 }), /Board answered 503/],
		['a changed format', () => Response.json({ nope: true }), /format changed/]
	])('does not add a board that answers with %s', async (_, answer, message) => {
		const result = await addCompany(
			db,
			network({ splice: answer }),
			'job-boards.greenhouse.io/splice',
			'Splice',
			NOW
		);
		expect(result).toMatchObject({ ok: false, field: 'link' });
		if (!result.ok) {
			expect(result.message).toMatch(message);
			expect(result.message).toMatch(/Nothing was added/);
		}
		expect(await findBoard(db, 'greenhouse', 'splice')).toBeNull();
	});

	it('does not add the same board twice when two adds race', async () => {
		const board: Board = { source: 'greenhouse', token: 'splice', company: 'Splice' };
		// The other tab saves the board while this one is still checking it.
		const fetcher = network({
			splice: async () => {
				await insertBoard(db, board);
				return Response.json(greenhouseBoard);
			}
		});
		const result = await addCompany(db, fetcher, 'job-boards.greenhouse.io/splice', 'Splice', NOW);
		expect(result).toEqual({
			ok: false,
			field: 'link',
			message: 'That board is already on your list.'
		});
	});
});

describe('boardKey', () => {
	const form = (fields: Record<string, string>) => {
		const data = new FormData();
		for (const [name, value] of Object.entries(fields)) data.set(name, value);
		return data;
	};

	it('reads the board a form names', () => {
		expect(boardKey(form({ source: 'greenhouse', token: 'splice' }))).toEqual({
			source: 'greenhouse',
			token: 'splice'
		});
	});

	it.each([
		{},
		{ source: 'lever', token: 'splice' },
		{ source: 'greenhouse', token: 'Splice' },
		{ source: 'greenhouse', token: '../x' },
		{ source: 'greenhouse' }
	])('refuses a form that does not name a board properly (%#)', (fields) => {
		expect(boardKey(form(fields))).toBeNull();
	});
});

describe('checkNow', () => {
	const splice: Board = { source: 'greenhouse', token: 'splice', company: 'Splice' };

	it('reads the board now and says what it found', async () => {
		await addBoard(db, splice);
		const result = await checkNow(
			db,
			network({ splice: json(greenhouseBoard) }),
			'greenhouse',
			'splice',
			NOW
		);
		expect(result).toEqual({
			ok: true,
			message: 'Checked Splice: 2 open, 2 new, 0 closed. Left out: 1 no apply link.'
		});
		expect(await findBoard(db, 'greenhouse', 'splice')).toMatchObject({
			lastFetchOk: true,
			openJobs: 2
		});
	});

	it('records and explains a board it could not read', async () => {
		await addBoard(db, splice);
		const result = await checkNow(db, network({}), 'greenhouse', 'splice', NOW);
		expect(result).toEqual({ ok: false, message: "Couldn't read Splice: Board not found (404)." });
		expect(await findBoard(db, 'greenhouse', 'splice')).toMatchObject({
			lastFetchOk: false,
			lastFetchNote: 'Board not found (404)'
		});
	});

	it('leaves a paused board alone', async () => {
		await addBoard(db, splice);
		await setPaused(db, 'greenhouse', 'splice', true);
		const result = await checkNow(db, offline, 'greenhouse', 'splice', NOW);
		expect(result).toEqual({ ok: false, message: 'Splice is paused. Resume it to check it.' });
		expect(offline).not.toHaveBeenCalled();
	});

	it('says when the company is gone', async () => {
		expect(await checkNow(db, offline, 'greenhouse', 'splice', NOW)).toEqual({
			ok: false,
			message: 'That company is no longer on your list.'
		});
	});
});

describe('pauseCompany and removeCompany', () => {
	beforeEach(async () => {
		await addCompany(
			db,
			network({ splice: json(greenhouseBoard) }),
			'job-boards.greenhouse.io/splice',
			'Splice',
			NOW
		);
	});

	it('pauses and resumes, saying what each means', async () => {
		expect(await pauseCompany(db, 'greenhouse', 'splice', true)).toEqual({
			ok: true,
			message: "Paused Splice. Its jobs are hidden and it won't be checked until you resume it."
		});
		expect(await listOpenPostings(db)).toEqual([]);
		expect(await pauseCompany(db, 'greenhouse', 'splice', false)).toEqual({
			ok: true,
			message: 'Resumed Splice. It will be checked every morning again.'
		});
		expect(await listOpenPostings(db)).toHaveLength(2);
	});

	it('removes a company and says how many jobs went with it', async () => {
		expect(await removeCompany(db, 'greenhouse', 'splice')).toEqual({
			ok: true,
			message: 'Removed Splice and its 2 jobs.'
		});
		expect(await findBoard(db, 'greenhouse', 'splice')).toBeNull();
	});

	it('says when the company is already gone', async () => {
		const gone = { ok: false, message: 'That company is no longer on your list.' };
		expect(await pauseCompany(db, 'ashby', 'nope', true)).toEqual(gone);
		expect(await removeCompany(db, 'ashby', 'nope')).toEqual(gone);
	});
});
