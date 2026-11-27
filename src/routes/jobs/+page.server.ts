import { error, fail } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { boardKeyOf, isFiltered, NO_FILTER, parseFilter, parseOrder } from '#lib/jobs/filter.ts';
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
import { capMicros } from '#lib/server/drafts.ts';
import { chooseModel, PROVIDERS, SCORING } from '#lib/server/models/model.ts';
import {
	jobsWithText,
	latestScores,
	profileVersion,
	SCORE_CAP_USD,
	scoreNow,
	scoringProfile
} from '#lib/server/scoring.ts';
import { PROMPT_VERSION } from '#lib/scoring/score.ts';
import { fitView, STALE_NOTE } from '#lib/scoring/view.ts';
import type { Actions, PageServerLoad } from './$types';

// SvelteKit 3's Cloudflare adapter has no `platform`: bindings come from
// cloudflare:workers, in the Worker and in `npm run dev` alike.
/** A Worker setting, trimmed; empty when it isn't set. */
function setting(name: string): string {
	const value = (env as unknown as Record<string, unknown>)[name];
	return typeof value === 'string' ? value.trim() : '';
}

const scoringSetup = () => chooseModel(PROVIDERS, setting, fetch, SCORING);

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
	const order = parseOrder(url.searchParams);
	const { interest } = filter;
	const filtered = isFiltered(filter);
	const setup = scoringSetup();
	const [
		postings,
		matching,
		allOpen,
		newOpen,
		boards,
		applications,
		marks,
		passed,
		scores,
		withText,
		profile
	] = await Promise.all([
		listOpenPostings(db, filter, LIST_LIMIT, order),
		countOpenPostings(db, filter),
		filtered ? countOpenPostings(db) : null,
		countOpenPostings(db, { ...NO_FILTER, onlyNew: true }),
		listBoardStatus(db),
		appliedDates(db),
		jobMarks(db),
		countOpenPostings(db, { ...NO_FILTER, show: 'passed' }),
		latestScores(db),
		jobsWithText(db),
		scoringProfile(db)
	]);
	const fitContext = {
		promptVersion: PROMPT_VERSION,
		profileVersion: profileVersion(profile),
		scoringOff: setup.ok ? null : setup.message
	};
	return {
		jobs: postings.map((posting) => {
			const card = toJobCard(posting, now);
			const applied = applications.get(card.key);
			const mark = marks.get(card.key);
			return {
				...card,
				why: interest ? whyMatched(interest, posting) : null,
				fit: fitView(scores.get(card.key), { ...fitContext, hasText: withText.has(card.key) }),
				applied: applied === undefined ? null : dateLabel(applied),
				mark:
					mark === undefined ? null : { kind: mark.mark, note: mark.note, on: dateLabel(mark.at) }
			};
		}),
		/** Real counts: the list stops at LIST_LIMIT, the page says so. */
		counts: { matching, all: allOpen ?? matching, new: newOpen, limit: LIST_LIMIT, passed },
		noteMax: NOTE_MAX,
		staleNote: STALE_NOTE,
		filter: {
			q: filter.words.join(' '),
			company: filter.board ? boardKeyOf(filter.board) : '',
			workplace: filter.workplace ?? '',
			onlyNew: filter.onlyNew,
			interest: interest ? String(interest.id) : '',
			show: filter.show ?? '',
			sort: order,
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
	score: async ({ request }) => {
		const key = jobOf(await request.formData());
		if (!key) return reply(NO_JOB);
		return reply(
			await scoreNow(
				database(),
				scoringSetup(),
				key,
				capMicros(setting('SCORE_DAILY_CAP_USD'), SCORE_CAP_USD),
				new Date()
			)
		);
	},
	unmark: async ({ request }) => {
		const key = jobOf(await request.formData());
		return reply(key ? await clearMark(database(), key) : NO_JOB);
	}
};
