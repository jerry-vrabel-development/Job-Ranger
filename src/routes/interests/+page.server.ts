import { error, fail } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { listBoardStatus } from '#lib/server/db.ts';
import {
	checkInput,
	createInterest,
	listInterests,
	parseBoardKey,
	parseId,
	removeInterest,
	setInterestPaused,
	updateInterest,
	type Result
} from '#lib/server/interests.ts';
import type { Actions, PageServerLoad } from './$types';

function database(): D1Database {
	const db = (env as Partial<Env>).DB;
	if (!db) error(503, 'Interests are not available right now.');
	return db;
}

export const load: PageServerLoad = async () => {
	const db = database();
	const [interests, boards] = await Promise.all([listInterests(db), listBoardStatus(db)]);
	return {
		interests,
		companies: boards.map((board) => ({
			key: `${board.source}:${board.token}`,
			company: board.company,
			paused: board.paused
		}))
	};
};

function text(form: FormData, name: string): string {
	const value = form.get(name);
	return typeof value === 'string' ? value : '';
}

const MISSING: Result = { ok: false, message: 'That form was missing which interest.' };

/** Runs an action on the interest a form names. */
async function onInterest(
	request: Request,
	run: (db: D1Database, id: number, form: FormData) => Promise<Result>
) {
	const form = await request.formData();
	const id = parseId(form.get('id'));
	const result = id === null ? MISSING : await run(database(), id, form);
	return result.ok ? { result } : fail(400, { result });
}

export const actions: Actions = {
	add: async ({ request }) => {
		const form = await request.formData();
		const values = {
			name: text(form, 'name').slice(0, 200),
			note: text(form, 'note').slice(0, 1000),
			keywords: text(form, 'keywords').slice(0, 2000)
		};
		const checked = checkInput(values.name, values.note, values.keywords);
		if (!checked.ok) {
			return fail(400, { add: { field: checked.field, message: checked.message, values } });
		}
		const result = await createInterest(database(), checked.input);
		return result.ok
			? { result }
			: fail(400, { add: { field: 'name' as const, message: result.message, values } });
	},
	edit: ({ request }) =>
		onInterest(request, (db, id, form) => {
			const checked = checkInput(text(form, 'name'), text(form, 'note'), text(form, 'keywords'));
			if (!checked.ok) return Promise.resolve({ ok: false, message: checked.message });
			const boards = form
				.getAll('company')
				.map(parseBoardKey)
				.filter((board) => board !== null);
			return updateInterest(db, id, checked.input, boards);
		}),
	pause: ({ request }) => onInterest(request, (db, id) => setInterestPaused(db, id, true)),
	resume: ({ request }) => onInterest(request, (db, id) => setInterestPaused(db, id, false)),
	remove: ({ request }) => onInterest(request, (db, id) => removeInterest(db, id))
};
