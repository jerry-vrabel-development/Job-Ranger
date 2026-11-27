import { error } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import {
	costTiles,
	draftingStatus,
	perApplication,
	scoringCount,
	scoringStatus
} from '#lib/insights/costs.ts';
import {
	companyBars,
	companyRows,
	marketSummary,
	payLine,
	workplaceBars
} from '#lib/insights/market.ts';
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
import { mapStates, mapSummary, stateCounts } from '#lib/insights/map.ts';
import { listed, signalBars, signalCounts, signalSummary } from '#lib/insights/signals.ts';
import { GHOST_DAYS, GHOST_REPOSTS } from '#lib/signals/ghost.ts';
import { appliedDraftingCost, capMicros } from '#lib/server/drafts.ts';
import {
	checkedJobs,
	companyCounts,
	marketCounts,
	openJobs,
	searchCounts,
	scoringTotals,
	spendingTotals
} from '#lib/server/insights.ts';
import { chooseModel, PROVIDERS, SCORING, setupStatus } from '#lib/server/models/model.ts';
import { SCORE_CAP_USD } from '#lib/server/scoring.ts';
import { listApplications } from '#lib/server/tracker.ts';
import type { PageServerLoad } from './$types';

/** A Worker setting, trimmed; empty when it isn't set. */
function setting(name: string): string {
	const value = (env as unknown as Record<string, unknown>)[name];
	return typeof value === 'string' ? value.trim() : '';
}

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
	const [counts, apps, companies, market, open, checked, spent, applied, scoringSpent] =
		await Promise.all([
			searchCounts(db),
			listApplications(db),
			companyCounts(db, addDays(today, -LOOKBACK_DAYS)),
			marketCounts(db),
			openJobs(db),
			checkedJobs(db),
			spendingTotals(db, today),
			appliedDraftingCost(db),
			scoringTotals(db, today)
		]);
	const signals = signalCounts(open, checked, now);
	const byState = stateCounts(open);
	const map = mapStates(byState, now);
	const spending = {
		setup: setupStatus(chooseModel(PROVIDERS, setting, fetch)),
		capMicros: capMicros(setting('DRAFT_DAILY_CAP_USD')),
		todayMicros: spent.today,
		monthMicros: spent.month,
		totalMicros: spent.total,
		applications: applied.applications,
		appliedMicros: applied.micros
	};
	const scoring = {
		setup: setupStatus(chooseModel(PROVIDERS, setting, fetch, SCORING)),
		capMicros: capMicros(setting('SCORE_DAILY_CAP_USD'), SCORE_CAP_USD),
		todayMicros: scoringSpent.today,
		monthMicros: scoringSpent.month,
		totalMicros: scoringSpent.total,
		scored: scoringSpent.scored,
		unscored: scoringSpent.unscored
	};
	const byCompany = companyBars(market);
	const trends = byChange(
		companies.map((c) => ({
			key: `${c.source}:${c.board}`,
			source: c.source,
			board: c.board,
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
		rules: { minChange: MIN_CHANGE, minShare: Math.round(MIN_SHARE * 100) },
		market: {
			summary: marketSummary(market),
			companies: byCompany.bars,
			companiesMore: byCompany.more,
			companyTable: companyRows(market),
			workplaces: workplaceBars(market),
			pay: payLine(market)
		},
		map: {
			summary: mapSummary(byState),
			states: map.states,
			legend: map.legend,
			remote: byState.remote,
			elsewhere: byState.elsewhere
		},
		signals: {
			summary: signalSummary(signals),
			bars: signalBars(signals),
			rules: { ghostDays: GHOST_DAYS, ghostReposts: GHOST_REPOSTS },
			lists: [
				{ title: 'Possible ghost jobs', ...listed(signals.ghost) },
				{ title: 'Pay missing where a state law may require it', ...listed(signals.pay) },
				{ title: 'Scam patterns', ...listed(signals.scam) }
			]
		},
		costs: {
			status: draftingStatus(spending),
			tiles: costTiles(spending),
			perApplication: perApplication(spending)
		},
		scoring: {
			status: scoringStatus(scoring),
			tiles: costTiles(scoring),
			count: scoringCount(scoring)
		}
	};
};
