import { error, fail } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import {
	addAnswer,
	checkAnswer,
	listAnswers,
	parseId,
	removeAnswer,
	updateAnswer,
	type Field,
	type Result
} from '#lib/server/answers.ts';
import type { Actions, PageServerLoad } from './$types';

function database(): D1Database {
	const db = (env as Partial<Env>).DB;
	if (!db) error(503, 'Your answer bank is not available right now.');
	return db;
}

export const load: PageServerLoad = async () => ({ answers: await listAnswers(database()) });

function value(form: FormData, name: string, max: number): string {
	const raw = form.get(name);
	return typeof raw === 'string' ? raw.slice(0, max) : '';
}

function fields(form: FormData): Record<Field, string> {
	return {
		question: value(form, 'question', 40),
		label: value(form, 'label', 400),
		text: value(form, 'text', 20_000),
		origin: value(form, 'origin', 40),
		notes: value(form, 'notes', 8000)
	};
}

const MISSING: Result = { ok: false, message: 'That form was missing which answer.' };

export const actions: Actions = {
	add: async ({ request }) => {
		const values = fields(await request.formData());
		const checked = checkAnswer(values);
		if (!checked.ok) {
			return fail(400, { add: { field: checked.field, message: checked.message, values } });
		}
		return { result: await addAnswer(database(), checked.input) };
	},
	edit: async ({ request }) => {
		const form = await request.formData();
		const id = parseId(form.get('id'));
		let result: Result;
		if (id === null) result = MISSING;
		else {
			const checked = checkAnswer(fields(form));
			result = checked.ok
				? await updateAnswer(database(), id, checked.input)
				: { ok: false, message: checked.message };
		}
		return result.ok ? { result } : fail(400, { result });
	},
	remove: async ({ request }) => {
		const id = parseId((await request.formData()).get('id'));
		const result = id === null ? MISSING : await removeAnswer(database(), id);
		return result.ok ? { result } : fail(400, { result });
	}
};
