import { error } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { toJobCard } from '#lib/jobs/display.ts';
import { listBoardStatus, listOpenPostings, markAllSeen } from '#lib/server/db.ts';
import type { Actions, PageServerLoad } from './$types';

// SvelteKit 3's Cloudflare adapter has no `platform`: bindings come from
// cloudflare:workers, in the Worker and in `npm run dev` alike.
function database(): D1Database {
	const db = (env as Partial<Env>).DB;
	if (!db) error(503, 'The job list is not available right now.');
	return db;
}

export const load: PageServerLoad = async () => {
	const db = database();
	const now = new Date().toISOString();
	const [postings, boards] = await Promise.all([listOpenPostings(db), listBoardStatus(db)]);
	return {
		jobs: postings.map((posting) => toJobCard(posting, now)),
		// Paused companies are hidden here; the Companies page lists them.
		boards: boards
			.filter((board) => !board.paused)
			.map((board) => ({
				key: `${board.source}:${board.token}`,
				company: board.company,
				lastFetchedAt: board.lastFetchedAt,
				lastFetchOk: board.lastFetchOk,
				lastFetchNote: board.lastFetchNote
			}))
	};
};

export const actions: Actions = {
	seen: async () => {
		const marked = await markAllSeen(database(), new Date().toISOString());
		return { marked };
	}
};
