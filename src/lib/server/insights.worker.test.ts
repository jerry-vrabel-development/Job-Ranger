import { beforeEach, describe, expect, it } from 'vitest';
import { getPosting, markApplied, type JobKey } from './kits.ts';
import { recordUsage } from './drafts.ts';
import {
	checkedJobs,
	companyCounts,
	marketCounts,
	openJobs,
	scoringTotals,
	searchCounts,
	spendingTotals
} from './insights.ts';
import { markJob } from './marks.ts';
import { addBoard, migratedDb } from './test-db.ts';
import { setStatus } from './tracker.ts';

const NOW = '2026-11-24T18:00:00.000Z';
const job = (id: string): JobKey => ({ source: 'lever', board: 'Flight', id });

let db: D1Database;

async function posting(id: string, closed = false) {
	await db
		.prepare(
			`INSERT INTO postings (source, board, id, company, title, location, workplace, apply_url,
			 first_seen_at, last_seen_at, closed_at) VALUES ('lever', 'Flight', ?1, 'Flight Co', ?1,
			 'Remote', 'remote', 'https://x.test/1', ?2, ?2, ?3)`
		)
		.bind(id, NOW, closed ? NOW : null)
		.run();
}

async function apply(id: string) {
	const stored = await getPosting(db, job(id));
	if (stored) await markApplied(db, stored, [], NOW);
}

beforeEach(async () => {
	db = await migratedDb();
	await db.batch(
		['job_marks', 'applications', 'board_counts', 'kits', 'postings', 'boards'].map((t) =>
			db.prepare(`DELETE FROM ${t}`)
		)
	);
	await addBoard(db, { source: 'lever', token: 'Flight', company: 'Flight Co' });
});

describe('the counts behind My search', () => {
	it('are all zero with nothing found', async () => {
		expect(await searchCounts(db)).toEqual({
			found: 0,
			open: 0,
			saved: 0,
			applied: 0,
			replied: 0,
			interviewing: 0,
			offers: 0
		});
	});

	it('count each step as what reached at least that far', async () => {
		for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) await posting(id);
		await posting('closed', true);
		// Saved only; saved then applied (counted once); applied without saving; passed.
		await markJob(db, job('a'), 'saved', '', NOW);
		await markJob(db, job('b'), 'saved', '', NOW);
		await apply('b');
		for (const id of ['c', 'd', 'e', 'f']) await apply(id);
		await markJob(db, job('g'), 'passed', 'Not for me', NOW);
		await setStatus(db, job('c'), 'interviewing', '', NOW);
		await setStatus(db, job('d'), 'offer', '', NOW);
		await setStatus(db, job('e'), 'rejected', '', NOW);
		// Withdrawn: the record doesn't say whether they'd answered, so it isn't a reply.
		await setStatus(db, job('f'), 'withdrawn', '', NOW);

		expect(await searchCounts(db)).toEqual({
			found: 8,
			open: 7,
			saved: 6,
			applied: 5,
			replied: 3,
			interviewing: 2,
			offers: 1
		});
	});
});

describe('the counts behind Trending companies', () => {
	async function counts(board: string, rows: readonly (readonly [string, number])[]) {
		for (const [day, open] of rows) {
			await db
				.prepare(
					`INSERT INTO board_counts (source, board, day, open_jobs) VALUES ('ashby', ?1, ?2, ?3)`
				)
				.bind(board, day, open)
				.run();
		}
	}

	it('gives each watched company its counts since a day, oldest first, and skips paused ones', async () => {
		await addBoard(db, { source: 'ashby', token: 'zeta', company: 'Zeta Labs' });
		await addBoard(db, { source: 'ashby', token: 'alpha', company: 'Alpha Co' });
		await addBoard(db, { source: 'ashby', token: 'paused', company: 'Paused Co' });
		await db.prepare(`UPDATE boards SET paused = 1 WHERE token = 'paused'`).run();
		await counts('zeta', [
			['2026-11-24', 12],
			['2026-10-01', 99],
			['2026-11-20', 9]
		]);
		await counts('paused', [['2026-11-24', 3]]);

		expect(await companyCounts(db, '2026-11-01')).toEqual([
			{ source: 'ashby', board: 'alpha', company: 'Alpha Co', counts: [] },
			{ source: 'lever', board: 'Flight', company: 'Flight Co', counts: [] },
			{
				source: 'ashby',
				board: 'zeta',
				company: 'Zeta Labs',
				counts: [
					{ day: '2026-11-20', openJobs: 9 },
					{ day: '2026-11-24', openJobs: 12 }
				]
			}
		]);
	});
});

describe('the counts behind The market I watch', () => {
	async function open(
		source: string,
		board: string,
		id: string,
		workplace: string,
		pay: string | null,
		closed = false
	) {
		await db
			.prepare(
				`INSERT INTO postings (source, board, id, company, title, location, workplace, apply_url,
				 first_seen_at, last_seen_at, closed_at, pay_summary) VALUES (?1, ?2, ?3, 'x', ?3, 'Remote',
				 ?4, 'https://x.test/1', ?5, ?5, ?6, ?7)`
			)
			.bind(source, board, id, workplace, NOW, closed ? NOW : null, pay)
			.run();
	}

	it('counts open jobs on watched boards by company, workplace and pay', async () => {
		await addBoard(db, { source: 'greenhouse', token: 'civic', company: 'Civic Co' });
		await addBoard(db, { source: 'ashby', token: 'quiet', company: 'Quiet Co' });
		await addBoard(db, { source: 'ashby', token: 'paused', company: 'Paused Co' });
		await db.prepare(`UPDATE boards SET paused = 1 WHERE token = 'paused'`).run();
		await open('lever', 'Flight', 'a', 'remote', '$100k–$120k');
		await open('lever', 'Flight', 'b', 'on-site', null);
		await open('lever', 'Flight', 'gone', 'remote', null, true);
		await open('greenhouse', 'civic', 'c', 'hybrid', null);
		await open('greenhouse', 'civic', 'd', 'remote', null);
		await open('ashby', 'paused', 'e', 'remote', '$1');

		const market = await marketCounts(db);
		expect([...market.byCompany].sort((x, y) => x.company.localeCompare(y.company))).toEqual([
			{ company: 'Civic Co', open: 2 },
			{ company: 'Flight Co', open: 2 },
			// Watched but nothing open: still listed, at 0.
			{ company: 'Quiet Co', open: 0 }
		]);
		expect([...market.byWorkplace].sort((x, y) => x.workplace.localeCompare(y.workplace))).toEqual([
			{ workplace: 'hybrid', open: 1 },
			{ workplace: 'on-site', open: 1 },
			{ workplace: 'remote', open: 2 }
		]);
		expect(market).toMatchObject({ payListed: 2, payPosted: 1, payUnlisted: 2 });
	});
});

describe('the inputs behind Signals and costs', () => {
	async function posting(id: string, closed = false) {
		await db
			.prepare(
				`INSERT INTO postings (source, board, id, company, title, location, workplace, apply_url,
				 first_seen_at, last_seen_at, closed_at, reopen_count) VALUES ('lever', 'Flight', ?1,
				 'Flight Co', ?1, 'Chicago, IL', 'on-site', 'https://x.test/1', ?2, ?2, ?3, 2)`
			)
			.bind(id, NOW, closed ? NOW : null)
			.run();
	}

	it('totals scoring by day, month and in all, and counts its answers', async () => {
		await posting('s');
		const score = async (at: string, ok: number, micros: number) => {
			await db
				.prepare(
					`INSERT INTO job_scores (source, board, posting_id, prompt_version, profile_version, model,
					 ok, score, input_tokens, output_tokens, cost_micros, price_table, latency_ms, at)
					 VALUES ('lever', 'Flight', 's', 'v', 'p', 'm', ?1, ?2, 1, 1, ?3, 't', 1, ?4)`
				)
				.bind(ok, ok === 1 ? 3 : null, micros, at)
				.run();
		};
		expect(await scoringTotals(db, '2026-11-26')).toEqual({
			today: 0,
			month: 0,
			total: 0,
			scored: 0,
			unscored: 0
		});
		await score('2026-11-26T12:00:00Z', 1, 500);
		await score('2026-11-26T13:00:00Z', 0, 400);
		await score('2026-11-02T13:00:00Z', 1, 300);
		await score('2026-10-31T13:00:00Z', 1, 200);
		expect(await scoringTotals(db, '2026-11-26')).toEqual({
			today: 900,
			month: 1200,
			total: 1400,
			scored: 3,
			unscored: 1
		});
	});

	it('reads every open watched job, with what the signal rules need', async () => {
		await posting('open');
		await posting('gone', true);
		const jobs = await openJobs(db);
		expect(jobs.map((j) => j.id)).toEqual(['open']);
		expect(jobs[0]).toMatchObject({ location: 'Chicago, IL', reopenCount: 2, pay: null });
	});

	it('checks only open jobs whose kit has the posting’s text', async () => {
		for (const id of ['scam', 'clean', 'empty', 'gone']) await posting(id, id === 'gone');
		const kit = async (id: string, text: string) => {
			await db
				.prepare(
					`INSERT INTO kits (source, board, posting_id, questions, posting_text)
					 VALUES ('lever', 'Flight', ?1, '[]', ?2)`
				)
				.bind(id, text)
				.run();
		};
		await kit('scam', 'Great role. Message us on WhatsApp to start your interview today.');
		await kit('clean', 'We build delivery drones. Apply through this page.');
		await kit('empty', '');
		await kit('gone', 'Message us on WhatsApp to start.');
		const checked = await checkedJobs(db);
		expect(checked.map((j) => [j.id, j.flags.map((f) => f.label)]).sort()).toEqual([
			['clean', []],
			['scam', ['Chat-app contact']]
		]);
	});

	it('adds up drafting spend for today, this month and in all', async () => {
		await db.prepare('DELETE FROM model_usage').run();
		expect(await spendingTotals(db, '2026-11-25')).toEqual({ today: 0, month: 0, total: 0 });
		await recordUsage(db, '2026-11-25', 'm', { inputTokens: 1, outputTokens: 1 }, 30_000);
		await recordUsage(db, '2026-11-02', 'm', { inputTokens: 1, outputTokens: 1 }, 20_000);
		await recordUsage(db, '2026-10-31', 'm', { inputTokens: 1, outputTokens: 1 }, 100_000);
		expect(await spendingTotals(db, '2026-11-25')).toEqual({
			today: 30_000,
			month: 50_000,
			total: 150_000
		});
	});
});
