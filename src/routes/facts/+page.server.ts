import { error, fail } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import {
	addFact,
	checkFact,
	confirmFact,
	listFacts,
	parseId,
	parsePaste,
	pasteFacts,
	removeFact,
	restoreFact,
	retireFact,
	updateFact,
	type Field,
	type Result
} from '#lib/server/facts.ts';
import {
	checkProfile,
	getProfile,
	PROFILE_MAX,
	saveProfile,
	type ProfileField
} from '#lib/server/profile.ts';
import { getPreferences, savePreferences } from '#lib/server/preferences.ts';
import { AREA_MAX, checkPreferences, LOOKING_FOR_MAX } from '#lib/preferences.ts';
import type { Actions, PageServerLoad } from './$types';

function database(): D1Database {
	const db = (env as Partial<Env>).DB;
	if (!db) error(503, 'Your fact bank is not available right now.');
	return db;
}

export const load: PageServerLoad = async () => {
	const db = database();
	const [facts, profile, preferences] = await Promise.all([
		listFacts(db),
		getProfile(db),
		getPreferences(db)
	]);
	return { facts, profile, preferences };
};

function value(form: FormData, name: string, max: number): string {
	const raw = form.get(name);
	return typeof raw === 'string' ? raw.slice(0, max) : '';
}

function fields(form: FormData): Record<Field, string> {
	return {
		kind: value(form, 'kind', 40),
		experience: value(form, 'experience', 40),
		organization: value(form, 'organization', 400),
		period: value(form, 'period', 200),
		text: value(form, 'text', 2000)
	};
}

const MISSING: Result = { ok: false, message: 'That form was missing which fact.' };

/** Runs an action on the fact a form names. */
async function onFact(
	request: Request,
	run: (db: D1Database, id: number, form: FormData) => Promise<Result>
) {
	const form = await request.formData();
	const id = parseId(form.get('id'));
	const result = id === null ? MISSING : await run(database(), id, form);
	return result.ok ? { result } : fail(400, { result });
}

export const actions: Actions = {
	preferences: async ({ request }) => {
		const form = await request.formData();
		const words = (name: string) =>
			form
				.getAll(name)
				.filter((v): v is string => typeof v === 'string')
				.slice(0, 20);
		const values = {
			workplaces: words('workplaces'),
			area: value(form, 'area', AREA_MAX * 4),
			levels: words('levels'),
			payFloor: value(form, 'payFloor', 40),
			lookingFor: value(form, 'lookingFor', LOOKING_FOR_MAX * 4)
		};
		const checked = checkPreferences(values);
		if (!checked.ok) {
			return fail(400, {
				wanted: { field: checked.field, message: checked.message, values }
			});
		}
		return { result: await savePreferences(database(), checked.preferences) };
	},
	profile: async ({ request }) => {
		const form = await request.formData();
		const values = Object.fromEntries(
			(Object.keys(PROFILE_MAX) as ProfileField[]).map((name) => [
				name,
				value(form, name, PROFILE_MAX[name] * 4)
			])
		) as Record<ProfileField, string>;
		const checked = checkProfile(values);
		if (!checked.ok) {
			return fail(400, { details: { field: checked.field, message: checked.message, values } });
		}
		return { result: await saveProfile(database(), checked.profile) };
	},
	add: async ({ request }) => {
		const values = fields(await request.formData());
		const checked = checkFact(values);
		if (!checked.ok) {
			return fail(400, { add: { field: checked.field, message: checked.message, values } });
		}
		return { result: await addFact(database(), checked.input) };
	},
	paste: async ({ request }) => {
		const pasted = value(await request.formData(), 'facts', 200_000);
		const parsed = parsePaste(pasted);
		if (!parsed.ok) return fail(400, { paste: { message: parsed.message, pasted } });
		return { result: await pasteFacts(database(), parsed.facts) };
	},
	edit: ({ request }) =>
		onFact(request, (db, id, form) => {
			const checked = checkFact(fields(form));
			if (!checked.ok) return Promise.resolve({ ok: false, message: checked.message });
			return updateFact(db, id, checked.input);
		}),
	confirm: ({ request }) => onFact(request, confirmFact),
	retire: ({ request }) => onFact(request, retireFact),
	restore: ({ request }) => onFact(request, restoreFact),
	remove: ({ request }) => onFact(request, removeFact)
};
