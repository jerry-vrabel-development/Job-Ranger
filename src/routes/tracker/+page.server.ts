import { error, fail } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { dateLabel } from '#lib/jobs/display.ts';
import { parseJobKey, type Result } from '#lib/server/kits.ts';
import { followedUp, listApplications } from '#lib/server/tracker.ts';
import {
	FOLLOW_UP_DAYS,
	NO_REPLY_DAYS,
	standing,
	STATUS_WORDS,
	type Group
} from '#lib/tracking/standing.ts';
import type { Actions, PageServerLoad } from './$types';

function database(): D1Database {
	const db = (env as Partial<Env>).DB;
	if (!db) error(503, 'The tracker is not available right now.');
	return db;
}

/** The groups, in the order the page shows them: what needs me first. */
const GROUPS: readonly { readonly group: Group; readonly heading: string }[] = [
	{ group: 'follow-up', heading: 'Follow up now' },
	{ group: 'interviewing', heading: 'Interviewing' },
	{ group: 'offer', heading: 'Offers' },
	{ group: 'waiting', heading: 'Waiting to hear' },
	{ group: 'no-reply', heading: 'No reply' },
	{ group: 'closed', heading: 'Closed' }
];

export const load: PageServerLoad = async () => {
	const now = new Date().toISOString();
	const items = (await listApplications(database())).map((app) => ({
		key: `${app.source}:${app.board}:${app.id}`,
		source: app.source,
		board: app.board,
		id: app.id,
		title: app.title,
		company: app.company,
		applied: dateLabel(app.appliedAt),
		status: STATUS_WORDS[app.status],
		note: app.note,
		...standing(app, now)
	}));
	return {
		groups: GROUPS.map(({ group, heading }) => ({
			group,
			heading,
			items: items.filter((item) => item.group === group)
		})).filter((each) => each.items.length > 0),
		total: items.length,
		rules: { followUp: FOLLOW_UP_DAYS, noReply: NO_REPLY_DAYS }
	};
};

export const actions: Actions = {
	followedUp: async ({ request }) => {
		const form = await request.formData();
		const field = (name: string) => {
			const value = form.get(name);
			return typeof value === 'string' ? value : '';
		};
		const key = parseJobKey(field('source'), field('board'), field('id'));
		const result: Result = key
			? await followedUp(database(), key, new Date().toISOString())
			: { ok: false, message: 'There’s no application recorded for this job.' };
		return result.ok ? { result } : fail(400, { result });
	}
};
