import { error, fail } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { SOURCE_NAMES } from '#lib/jobs/posting.ts';
import {
	addCompany,
	boardKey,
	checkNow,
	pauseCompany,
	removeCompany,
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
	run: (db: D1Database, key: NonNullable<ReturnType<typeof boardKey>>) => Promise<ActionResult>
) {
	const key = boardKey(await request.formData());
	if (key === null) {
		return fail(400, { result: { ok: false, message: 'That form was missing which company.' } });
	}
	const result = await run(database(), key);
	return result.ok ? { result } : fail(400, { result });
}

export const actions: Actions = {
	add: async ({ request }) => {
		const form = await request.formData();
		const link = text(form, 'link');
		const company = text(form, 'company');
		const result = await addCompany(database(), fetch, link, company, new Date());
		if (result.ok) return { result };
		// Send back what was typed, so nothing has to be typed again.
		return fail(400, {
			result,
			values: { link: link.slice(0, 2000), company: company.slice(0, 300) }
		});
	},
	check: ({ request }) =>
		onBoard(request, (db, key) => checkNow(db, fetch, key.source, key.token, new Date())),
	pause: ({ request }) =>
		onBoard(request, (db, key) => pauseCompany(db, key.source, key.token, true)),
	resume: ({ request }) =>
		onBoard(request, (db, key) => pauseCompany(db, key.source, key.token, false)),
	remove: ({ request }) => onBoard(request, (db, key) => removeCompany(db, key.source, key.token))
};
