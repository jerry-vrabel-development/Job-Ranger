import { error, fail } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { boardKeyOf, isFiltered, NO_FILTER, parseFilter } from '#lib/jobs/filter.ts';
import { dateLabel, toJobCard } from '#lib/jobs/display.ts';
import { whyMatched, type InterestMatch } from '#lib/jobs/interest-match.ts';
import {
	countOpenPostings,
	LIST_LIMIT,
	listBoardStatus,
	listOpenPostings,
	markAllSeen
} from '#lib/server/db.ts';
import { listInterests } from '#lib/server/interests.ts';
import { appliedDates, parseJobKey, type Result } from '#lib/server/kits.ts';
import { clearMark, jobMarks, markJob, NOTE_MAX } from '#lib/server/marks.ts';
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
	const [postings, matching, allOpen, newOpen, boards, applications, marks, passed] =
		await Promise.all([
			listOpenPostings(db, filter),
			countOpenPostings(db, filter),
			filtered ? countOpenPostings(db) : null,
			countOpenPostings(db, { ...NO_FILTER, onlyNew: true }),
			listBoardStatus(db),
			appliedDates(db),
			jobMarks(db),
			countOpenPostings(db, { ...NO_FILTER, show: 'passed' })
		]);
	return {
		jobs: postings.map((posting) => {
			const card = toJobCard(posting, now);
			const applied = applications.get(card.key);
			const mark = marks.get(card.key);
			return {
				...card,
				why: interest ? whyMatched(interest, posting) : null,
				applied: applied === undefined ? null : dateLabel(applied),
				mark:
					mark === undefined ? null : { kind: mark.mark, note: mark.note, on: dateLabel(mark.at) }
			};
		}),
		/** Real counts: the list stops at LIST_LIMIT, the page says so. */
		counts: { matching, all: allOpen ?? matching, new: newOpen, limit: LIST_LIMIT, passed },
		noteMax: NOTE_MAX,
		filter: {
			q: filter.words.join(' '),
			company: filter.board ? boardKeyOf(filter.board) : '',
			workplace: filter.workplace ?? '',
			onlyNew: filter.onlyNew,
			interest: interest ? String(interest.id) : '',
			show: filter.show ?? '',
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

/** The job a card's form is about, from its hidden fields. */
function jobOf(form: FormData) {
	const field = (name: string) => {
		const value = form.get(name);
		return typeof value === 'string' ? value : '';
	};
	return parseJobKey(field('source'), field('board'), field('id'));
}

const reply = (result: Result) => (result.ok ? { result } : fail(400, { result }));
const NO_JOB: Result = { ok: false, message: 'That job is no longer in Job Ranger.' };

export const actions: Actions = {
	seen: async () => {
		const marked = await markAllSeen(database(), new Date().toISOString());
		return { marked };
	},
	save: async ({ request }) => {
		const key = jobOf(await request.formData());
		if (!key) return reply(NO_JOB);
		return reply(await markJob(database(), key, 'saved', '', new Date().toISOString()));
	},
	pass: async ({ request }) => {
		const form = await request.formData();
		const key = jobOf(form);
		if (!key) return reply(NO_JOB);
		const note = form.get('note');
		return reply(
			await markJob(
				database(),
				key,
				'passed',
				typeof note === 'string' ? note.slice(0, 2000) : '',
				new Date().toISOString()
			)
		);
	},
	unmark: async ({ request }) => {
		const key = jobOf(await request.formData());
		return reply(key ? await clearMark(database(), key) : NO_JOB);
	}
};
