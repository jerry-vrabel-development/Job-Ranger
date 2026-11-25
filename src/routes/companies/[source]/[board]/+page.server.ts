import { error } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { companySummary, history, openRows } from '#lib/insights/company.ts';
import { signalCounts } from '#lib/insights/signals.ts';
import { addDays, points, trend, windowDays } from '#lib/insights/trend.ts';
import { checkedLabel, dateLabel } from '#lib/jobs/display.ts';
import { isSource, SOURCE_NAMES } from '#lib/jobs/posting.ts';
import { companyDetail } from '#lib/server/company.ts';
import { listInterests } from '#lib/server/interests.ts';
import { listApplications } from '#lib/server/tracker.ts';
import { isToken, publicBoardUrl } from '#lib/sources/board-link.ts';
import type { PageServerLoad } from './$types';

function database(): D1Database {
	const db = (env as Partial<Env>).DB;
	if (!db) error(503, 'This company is not available right now.');
	return db;
}

/** Counts this far back, so a 30-day trend can start from the last count before its window. */
const LOOKBACK_DAYS = 60;

export const load: PageServerLoad = async ({ params }) => {
	const { source, board: token } = params;
	if (!isSource(source) || !isToken(token, source)) error(404, 'That company isn’t on your list.');
	const db = database();
	const now = new Date().toISOString();
	const today = now.slice(0, 10);
	const [detail, apps, interests] = await Promise.all([
		companyDetail(db, source, token, addDays(today, -LOOKBACK_DAYS)),
		listApplications(db),
		listInterests(db)
	]);
	if (detail === null) error(404, 'That company isn’t on your list.');
	const { board } = detail;
	const key = `${source}:${token}`;
	const applied = apps.filter((a) => a.source === source && a.board === token);
	const closedSince = addDays(today, -30);
	const closed = detail.closed.filter((c) => c.closedAt.slice(0, 10) >= closedSince);
	const signals = signalCounts(detail.open, [], now);
	const warned = new Set([...signals.ghost, ...signals.pay].map((job) => job.id)).size;
	return {
		key,
		source,
		token,
		company: board.company,
		sourceName: SOURCE_NAMES[source],
		boardUrl: publicBoardUrl(source, token),
		paused: board.paused,
		watchingSince: dateLabel(board.addedAt),
		lastCheck:
			board.lastFetchOk === null
				? 'Not checked yet.'
				: `${board.lastFetchOk ? 'Read' : 'Could not be read'} on ${checkedLabel(board.lastFetchedAt)}. ${board.lastFetchNote ?? ''}`.trim(),
		summary: companySummary({
			open: detail.open.length,
			closed: closed.length,
			reposted: detail.open.filter((p) => p.reopenCount > 0).length,
			applied: applied.length,
			warned
		}),
		trend7: trend(detail.counts, today, 7).words,
		trend30: trend(detail.counts, today, 30).words,
		points: points(detail.counts, windowDays(today, 30)),
		open: openRows(detail.open, now),
		closed: closed.map((c) => ({ id: c.id, title: c.title, when: dateLabel(c.closedAt) })),
		history: history(
			detail.marks,
			applied.map((a) => ({ id: a.id, title: a.title, status: a.status, appliedAt: a.appliedAt }))
		),
		interests: interests
			.filter((i) => i.companies.some((c) => c.key === key))
			.map((i) => ({ id: i.id, name: i.name, paused: i.paused }))
	};
};
