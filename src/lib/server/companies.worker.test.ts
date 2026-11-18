import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Board } from '#lib/jobs/posting.ts';
import ashbyBoard from '#lib/sources/fixtures/ashby-board.json' with { type: 'json' };
import greenhouseBoard from '#lib/sources/fixtures/greenhouse-board.json' with { type: 'json' };
import {
	ADD_CONCURRENCY,
	addCompanies,
	boardKey,
	checkNow,
	COMPANY_MAX,
	MAX_LINES,
	pauseCompany,
	removeCompany,
	renameCompany,
	splitLine,
	type AddResult
} from './companies.ts';
import { findBoard, insertBoard, listOpenPostings, loadBoard, setPaused } from './db.ts';
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

/** The per-line results of a paste that was tried. */
function lines(result: AddResult) {
	if (!result.ok) throw new Error(`The paste was refused: ${result.message}`);
	return result.results.map(({ line, ok, message }) => ({ line, ok, message }));
}

describe('addCompanies', () => {
	it('checks a board, then adds it with its jobs and the name Greenhouse gives it', async () => {
		const fetcher = network({ splice: json(greenhouseBoard) });
		const result = await addCompanies(
			db,
			fetcher,
			'https://job-boards.greenhouse.io/splice/jobs/1',
			NOW
		);
		expect(result).toEqual({
			ok: true,
			added: 1,
			results: [
				{
					line: 1,
					text: 'https://job-boards.greenhouse.io/splice/jobs/1',
					ok: true,
					message: 'Added Example Co: 2 open jobs found.'
				}
			],
			retry: ''
		});
		expect(fetcher).toHaveBeenCalledWith(
			'https://boards-api.greenhouse.io/v1/boards/splice/jobs?content=true',
			expect.anything()
		);
		expect(await findBoard(db, 'greenhouse', 'splice')).toMatchObject({
			company: 'Example Co',
			lastFetchedAt: NOW.toISOString(),
			lastFetchOk: true,
			openJobs: 2
		});
		// Every stored job carries the company's name too.
		const stored = await loadBoard(db, { source: 'greenhouse', token: 'splice', company: '' });
		expect(stored.map((posting) => posting.company)).toEqual(['Example Co', 'Example Co']);
	});

	it('uses a name typed after a comma, over the board’s own', async () => {
		const result = await addCompanies(
			db,
			network({ splice: json(greenhouseBoard) }),
			'job-boards.greenhouse.io/splice ,  Splice \t  Music ',
			NOW
		);
		expect(lines(result)).toEqual([
			{ line: 1, ok: true, message: 'Added Splice Music: 2 open jobs found.' }
		]);
		expect((await listOpenPostings(db)).map((posting) => posting.company)).toEqual([
			'Splice Music',
			'Splice Music'
		]);
	});

	it('makes a name from the link when the board has none (Ashby)', async () => {
		const result = await addCompanies(
			db,
			network({ 'civic roundtable': json(ashbyBoard) }),
			'jobs.ashbyhq.com/civic%20roundtable',
			NOW
		);
		expect(lines(result)).toEqual([
			{ line: 1, ok: true, message: 'Added Civic Roundtable: 2 open jobs found.' }
		]);
	});

	it('makes a name from the link when a Greenhouse board names no company', async () => {
		const unnamed = {
			jobs: greenhouseBoard.jobs.map((job) => ({ ...job, company_name: undefined }))
		};
		const result = await addCompanies(
			db,
			network({ distrokid: json(unnamed) }),
			'job-boards.greenhouse.io/distrokid',
			NOW
		);
		expect(lines(result)).toEqual([
			{ line: 1, ok: true, message: 'Added Distrokid: 2 open jobs found.' }
		]);
	});

	it('says "1 open job" for one', async () => {
		const one = { ...greenhouseBoard, jobs: greenhouseBoard.jobs.slice(0, 1) };
		const result = await addCompanies(
			db,
			network({ one: json(one) }),
			'job-boards.greenhouse.io/one, One',
			NOW
		);
		expect(lines(result)).toEqual([{ line: 1, ok: true, message: 'Added One: 1 open job found.' }]);
	});

	it('adds every good line, says why each other line was not added, and hands those back', async () => {
		await addBoard(db, { source: 'ashby', token: 'suno', company: 'Suno' });
		const paste = [
			'job-boards.greenhouse.io/splice',
			'',
			'https://www.splice.com/careers',
			'jobs.ashbyhq.com/suno',
			'job-boards.greenhouse.io/splise, Splice',
			'job-boards.greenhouse.io/Splice/jobs/2',
			`jobs.ashbyhq.com/new, ${'x'.repeat(COMPANY_MAX + 1)}`,
			'jobs.ashbyhq.com/blank,   '
		].join('\r\n');
		const fetcher = network({ splice: json(greenhouseBoard), blank: json(ashbyBoard) });
		const result = await addCompanies(db, fetcher, paste, NOW);

		expect(lines(result)).toEqual([
			{ line: 1, ok: true, message: 'Added Example Co: 2 open jobs found.' },
			{
				line: 3,
				ok: false,
				message: expect.stringMatching(/that link is on www\.splice\.com/) as string
			},
			{ line: 4, ok: false, message: 'Already on your list, as Suno.' },
			{
				line: 5,
				ok: false,
				message: "There's no Greenhouse board called “splise”. Check the spelling in the link."
			},
			{ line: 6, ok: false, message: 'The same board as line 1.' },
			{
				line: 7,
				ok: false,
				message: `Keep the name under ${String(COMPANY_MAX)} characters.`
			},
			// An empty name after the comma just means "no name given".
			{ line: 8, ok: true, message: 'Added Blank: 2 open jobs found.' }
		]);
		expect(result).toMatchObject({
			added: 2,
			retry: [
				'https://www.splice.com/careers',
				'jobs.ashbyhq.com/suno',
				'job-boards.greenhouse.io/splise, Splice',
				'job-boards.greenhouse.io/Splice/jobs/2',
				`jobs.ashbyhq.com/new, ${'x'.repeat(COMPANY_MAX + 1)}`
			].join('\n')
		});
		// The refused lines never reached the network; the misspelled one did, once.
		expect(fetcher).toHaveBeenCalledTimes(3);
	});

	it.each([
		['an error status', () => new Response('down', { status: 503 }), /Board answered 503/],
		['a changed format', () => Response.json({ nope: true }), /format changed/]
	])('does not add a board that answers with %s', async (_, answer, message) => {
		const result = await addCompanies(
			db,
			network({ splice: answer }),
			'job-boards.greenhouse.io/splice',
			NOW
		);
		const [line] = lines(result);
		expect(line?.ok).toBe(false);
		expect(line?.message).toMatch(message);
		expect(line?.message).toMatch(/Try again later/);
		expect(await findBoard(db, 'greenhouse', 'splice')).toBeNull();
	});

	it('refuses an empty paste, or too long a one, without trying any of it', async () => {
		expect(await addCompanies(db, offline, ' \n \n', NOW)).toEqual({
			ok: false,
			message: 'Paste at least one job board link, one per line.'
		});
		const tooMany = Array.from(
			{ length: MAX_LINES + 1 },
			(_, i) => `job-boards.greenhouse.io/b${String(i)}`
		);
		expect(await addCompanies(db, offline, tooMany.join('\n'), NOW)).toEqual({
			ok: false,
			message: `That's ${String(MAX_LINES + 1)} lines. Paste up to ${String(MAX_LINES)} at a time.`
		});
		expect(offline).not.toHaveBeenCalled();
	});

	it(`reads at most ${String(ADD_CONCURRENCY)} boards at once, and keeps the lines in order`, async () => {
		let reading = 0;
		let most = 0;
		const slow = async () => {
			reading += 1;
			most = Math.max(most, reading);
			await new Promise((resolve) => setTimeout(resolve, 5));
			reading -= 1;
			return Response.json(greenhouseBoard);
		};
		const tokens = Array.from({ length: MAX_LINES }, (_, i) => `b${String(i)}`);
		const result = await addCompanies(
			db,
			network(Object.fromEntries(tokens.map((token) => [token, slow]))),
			tokens.map((token) => `job-boards.greenhouse.io/${token}, ${token}`).join('\n'),
			NOW
		);
		expect(most).toBe(ADD_CONCURRENCY);
		expect(lines(result).map((line) => line.message)).toEqual(
			tokens.map((token) => `Added ${token}: 2 open jobs found.`)
		);
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
		const result = await addCompanies(db, fetcher, 'job-boards.greenhouse.io/splice', NOW);
		expect(lines(result)).toEqual([{ line: 1, ok: false, message: 'Already on your list.' }]);
	});
});

describe('splitLine', () => {
	it('splits a link from an optional name at the first comma', () => {
		expect(splitLine(' jobs.ashbyhq.com/suno ')).toEqual({
			link: 'jobs.ashbyhq.com/suno',
			name: null
		});
		expect(splitLine('jobs.ashbyhq.com/suno, Suno, Inc.')).toEqual({
			link: 'jobs.ashbyhq.com/suno',
			name: 'Suno, Inc.'
		});
		expect(splitLine('jobs.ashbyhq.com/suno,')).toEqual({
			link: 'jobs.ashbyhq.com/suno',
			name: null
		});
	});
});

describe('renameCompany', () => {
	it('renames a company everywhere, its jobs included', async () => {
		await addCompanies(
			db,
			network({ splice: json(greenhouseBoard) }),
			'job-boards.greenhouse.io/splice',
			NOW
		);
		expect(await renameCompany(db, 'greenhouse', 'splice', '  Splice   Music ')).toEqual({
			ok: true,
			message: 'Renamed Example Co to Splice Music.'
		});
		expect(await findBoard(db, 'greenhouse', 'splice')).toMatchObject({ company: 'Splice Music' });
		expect((await listOpenPostings(db)).map((posting) => posting.company)).toEqual([
			'Splice Music',
			'Splice Music'
		]);
	});

	it('asks for a usable name', async () => {
		await addBoard(db, { source: 'ashby', token: 'suno', company: 'Suno' });
		expect(await renameCompany(db, 'ashby', 'suno', '  ')).toEqual({
			ok: false,
			message: 'Give the company a name.'
		});
		expect(await renameCompany(db, 'ashby', 'suno', 'x'.repeat(COMPANY_MAX + 1))).toEqual({
			ok: false,
			message: `Keep the name under ${String(COMPANY_MAX)} characters.`
		});
		expect(await findBoard(db, 'ashby', 'suno')).toMatchObject({ company: 'Suno' });
	});

	it('says when the company is gone', async () => {
		expect(await renameCompany(db, 'ashby', 'nope', 'Name')).toEqual({
			ok: false,
			message: 'That company is no longer on your list.'
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
		{ source: 'workday', token: 'splice' },
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
		await addCompanies(
			db,
			network({ splice: json(greenhouseBoard) }),
			'job-boards.greenhouse.io/splice, Splice',
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
