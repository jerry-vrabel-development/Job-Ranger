import { error } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { toJobCard } from '#lib/jobs/display.ts';
import { boardKeyOf, isFiltered, NO_FILTER, parseFilter } from '#lib/jobs/filter.ts';
import { whyMatched, type InterestMatch } from '#lib/jobs/interest-match.ts';
import {
	countOpenPostings,
	LIST_LIMIT,
	listBoardStatus,
	listOpenPostings,
	markAllSeen
} from '#lib/server/db.ts';
import { listInterests } from '#lib/server/interests.ts';
import type { Actions, PageServerLoad } from './$types';

// SvelteKit 3's Cloudflare adapter has no `platform`: bindings come from
// cloudflare:workers, in the Worker and in `npm run dev` alike.
function database(): D1Database {
	const db = (env as Partial<Env>).DB;
	if (!db) error(503, 'The job list is not available right now.');
	return db;
}

export const load: PageServerLoad = async ({ url }) => {
	const db = database();
	const now = new Date().toISOString();
	// Paused interests are hidden here; the Interests page lists them.
	const interests: InterestMatch[] = (await listInterests(db))
		.filter((interest) => !interest.paused)
		.map((interest) => ({
			id: interest.id,
			name: interest.name,
			keywords: interest.keywords,
			boards: interest.companies.map((company) => company.key)
		}));
	const filter = parseFilter(url.searchParams, interests);
	const { interest } = filter;
	const filtered = isFiltered(filter);
	const [postings, matching, allOpen, newOpen, boards] = await Promise.all([
		listOpenPostings(db, filter),
		countOpenPostings(db, filter),
		filtered ? countOpenPostings(db) : null,
		countOpenPostings(db, { ...NO_FILTER, onlyNew: true }),
		listBoardStatus(db)
	]);
	return {
		jobs: postings.map((posting) => ({
			...toJobCard(posting, now),
			why: interest ? whyMatched(interest, posting) : null
		})),
		/** Real counts: the list stops at LIST_LIMIT, the page says so. */
		counts: { matching, all: allOpen ?? matching, new: newOpen, limit: LIST_LIMIT },
		filter: {
			q: filter.words.join(' '),
			company: filter.board ? boardKeyOf(filter.board) : '',
			workplace: filter.workplace ?? '',
			onlyNew: filter.onlyNew,
			interest: interest ? String(interest.id) : '',
			active: filtered
		},
		interests: interests.map(({ id, name }) => ({ id: String(id), name })),
		// Paused companies are hidden here; the Companies page lists them.
		boards: boards
			.filter((board) => !board.paused)
			.map((board) => ({
				key: boardKeyOf(board),
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
