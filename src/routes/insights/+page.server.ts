import { error } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import {
	foundLine,
	funnelSteps,
	funnelSummary,
	MIN_FOR_SHARE,
	waitingCounts
} from '#lib/insights/search.ts';
import {
	addDays,
	byChange,
	MIN_CHANGE,
	MIN_SHARE,
	parseRange,
	points,
	RANGES,
	trend,
	trendSummary,
	windowDays
} from '#lib/insights/trend.ts';
import { companyCounts, searchCounts } from '#lib/server/insights.ts';
import { listApplications } from '#lib/server/tracker.ts';
import type { PageServerLoad } from './$types';

function database(): D1Database {
	const db = (env as Partial<Env>).DB;
	if (!db) error(503, 'Insights are not available right now.');
	return db;
}

/** Counts this far back, so a 30-day trend can start from the last count before its window. */
const LOOKBACK_DAYS = 60;

export const load: PageServerLoad = async ({ url }) => {
	const db = database();
	const now = new Date().toISOString();
	const today = now.slice(0, 10);
	const range = parseRange(url.searchParams.get('range'));
	const days = windowDays(today, range);
	const [counts, apps, companies] = await Promise.all([
		searchCounts(db),
		listApplications(db),
		companyCounts(db, addDays(today, -LOOKBACK_DAYS))
	]);
	const trends = byChange(
		companies.map((c) => ({
			key: `${c.source}:${c.board}`,
			company: c.company,
			trend: trend(c.counts, today, range),
			points: points(c.counts, days)
		}))
	);
	return {
		found: foundLine(counts),
		steps: funnelSteps(counts),
		summary: funnelSummary(counts),
		waiting: waitingCounts(apps, now),
		minForShare: MIN_FOR_SHARE,
		range,
		ranges: RANGES,
		trends,
		trendSummary: trendSummary(trends, range),
		rules: { minChange: MIN_CHANGE, minShare: Math.round(MIN_SHARE * 100) }
	};
};
