import { error, fail } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { SOURCE_NAMES } from '#lib/jobs/posting.ts';
import {
	addCompanies,
	boardKey,
	checkNow,
	pauseCompany,
	removeCompany,
	renameCompany,
	type ActionResult
} from '#lib/server/companies.ts';
import { listBoardStatus } from '#lib/server/db.ts';
import type { Actions, PageServerLoad } from './$types';

function database(): D1Database {
	const db = (env as Partial<Env>).DB;
	if (!db) error(503, 'The company list is not available right now.');
	return db;
}

export const load: PageServerLoad = async () => {
	const boards = await listBoardStatus(database());
	return {
		companies: boards.map((board) => ({
			key: `${board.source}:${board.token}`,
			source: board.source,
			sourceName: SOURCE_NAMES[board.source],
			token: board.token,
			company: board.company,
			paused: board.paused,
			openJobs: board.openJobs,
			lastFetchedAt: board.lastFetchedAt,
			lastFetchOk: board.lastFetchOk,
			lastFetchNote: board.lastFetchNote
		}))
	};
};

function text(form: FormData, name: string): string {
	const value = form.get(name);
	return typeof value === 'string' ? value : '';
}

/** Runs an action on the board a form names; a form with a bad key gets a plain answer. */
async function onBoard(
	request: Request,
	run: (
		db: D1Database,
		key: NonNullable<ReturnType<typeof boardKey>>,
		form: FormData
	) => Promise<ActionResult>
) {
	const form = await request.formData();
	const key = boardKey(form);
	if (key === null) {
		return fail(400, { result: { ok: false, message: 'That form was missing which company.' } });
	}
	const result = await run(database(), key, form);
	return result.ok ? { result } : fail(400, { result });
}

export const actions: Actions = {
	add: async ({ request }) => {
		const links = text(await request.formData(), 'links');
		const added = await addCompanies(database(), fetch, links, new Date());
		if (!added.ok) {
			// Nothing was tried: send the paste back so nothing has to be typed again.
			return fail(400, { add: { problem: added.message, links: links.slice(0, 20_000) } });
		}
		return { add: added };
	},
	check: ({ request }) =>
		onBoard(request, (db, key) => checkNow(db, fetch, key.source, key.token, new Date())),
	pause: ({ request }) =>
		onBoard(request, (db, key) => pauseCompany(db, key.source, key.token, true)),
	resume: ({ request }) =>
		onBoard(request, (db, key) => pauseCompany(db, key.source, key.token, false)),
	rename: ({ request }) =>
		onBoard(request, (db, key, form) =>
			renameCompany(db, key.source, key.token, text(form, 'company'))
		),
	remove: ({ request }) => onBoard(request, (db, key) => removeCompany(db, key.source, key.token))
};
