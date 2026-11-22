import { error } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { buildResume, jobTextOf } from '#lib/kit/resume.ts';
import { getSummaryDraft } from '#lib/server/drafts.ts';
import { listFacts } from '#lib/server/facts.ts';
import { getKit, getPosting, parseJobKey } from '#lib/server/kits.ts';
import { getProfile } from '#lib/server/profile.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const db = (env as Partial<Env>).DB;
	if (!db) error(503, 'Your facts are not available right now.');
	const key = parseJobKey(params.source, params.board, params.id);
	if (!key) error(404, 'That is not a job in Job Ranger.');
	const posting = await getPosting(db, key);
	if (!posting) error(404, 'That job is no longer in Job Ranger.');
	const [kit, facts, profile, drafted] = await Promise.all([
		getKit(db, key),
		listFacts(db),
		getProfile(db),
		getSummaryDraft(db, key)
	]);
	const usable = facts.filter((fact) => fact.confirmed && !fact.retired);
	// A summary I chose from a draft, unless the posting forbids AI-written words.
	const chosen = kit?.aiRule === 'forbids' ? null : (drafted?.kept ?? null);
	return {
		job: { title: posting.title, company: posting.company, ...key },
		profile,
		resume: buildResume(usable, jobTextOf(posting, kit)),
		factCount: usable.length,
		summary: chosen === null ? null : { text: chosen.text, edited: chosen.edited },
		hasKitText: kit !== null && kit.postingText !== ''
	};
};
