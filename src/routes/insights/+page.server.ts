import { error } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import {
	foundLine,
	funnelSteps,
	funnelSummary,
	MIN_FOR_SHARE,
	waitingCounts
} from '#lib/insights/search.ts';
import { searchCounts } from '#lib/server/insights.ts';
import { listApplications } from '#lib/server/tracker.ts';
import type { PageServerLoad } from './$types';

function database(): D1Database {
	const db = (env as Partial<Env>).DB;
	if (!db) error(503, 'Insights are not available right now.');
	return db;
}

export const load: PageServerLoad = async () => {
	const db = database();
	const [counts, apps] = await Promise.all([searchCounts(db), listApplications(db)]);
	return {
		found: foundLine(counts),
		steps: funnelSteps(counts),
		summary: funnelSummary(counts),
		waiting: waitingCounts(apps, new Date().toISOString()),
		minForShare: MIN_FOR_SHARE
	};
};
