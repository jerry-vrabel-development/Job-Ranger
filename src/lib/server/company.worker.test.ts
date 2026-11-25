import { beforeEach, describe, expect, it } from 'vitest';
import { companyDetail } from './company.ts';
import { markJob } from './marks.ts';
import { addBoard, migratedDb } from './test-db.ts';

const NOW = '2026-11-25T18:00:00.000Z';
let db: D1Database;

async function posting(
	board: string,
	id: string,
	extra: { closed?: string; posted?: string } = {}
) {
	await db
		.prepare(
			`INSERT INTO postings (source, board, id, company, title, location, workplace, apply_url,
			 posted_at, first_seen_at, last_seen_at, closed_at) VALUES ('ashby', ?1, ?2, 'Co', ?3,
			 'Remote', 'remote', 'https://x.test/1', ?4, ?5, ?5, ?6)`
		)
		.bind(
			board,
			id,
			`Title ${id}`,
			extra.posted ?? null,
			'2026-11-20T11:23:00.000Z',
			extra.closed ?? null
		)
		.run();
}

beforeEach(async () => {
	db = await migratedDb();
	await db.batch(
		['job_marks', 'applications', 'board_counts', 'postings', 'boards'].map((t) =>
			db.prepare(`DELETE FROM ${t}`)
		)
	);
	await addBoard(db, { source: 'ashby', token: 'flight', company: 'Flight Co' });
	await addBoard(db, { source: 'ashby', token: 'other', company: 'Other Co' });
});

describe('the company page’s data', () => {
	it('is null for a board that isn’t on my list', async () => {
		expect(await companyDetail(db, 'ashby', 'nope', '2026-10-26')).toBeNull();
	});

	it('reads one board’s counts, open and closed jobs, and marks, and nothing of another', async () => {
		for (const [day, open] of [
			['2026-10-01', 9],
			['2026-11-20', 4],
			['2026-11-25', 5]
		] as const) {
			await db
				.prepare(
					`INSERT INTO board_counts (source, board, day, open_jobs) VALUES ('ashby', ?1, ?2, ?3)`
				)
				.bind('flight', day, open)
				.run();
		}
		await posting('flight', 'older', { posted: '2026-11-01T00:00:00.000Z' });
		await posting('flight', 'newer', { posted: '2026-11-24T00:00:00.000Z' });
		await posting('flight', 'unposted');
		await posting('flight', 'closed-lately', { closed: '2026-11-22T11:23:00.000Z' });
		await posting('flight', 'closed-long-ago', { closed: '2026-09-01T11:23:00.000Z' });
		await posting('other', 'elsewhere');
		await markJob(db, { source: 'ashby', board: 'flight', id: 'newer' }, 'saved', '', NOW);
		await markJob(db, { source: 'ashby', board: 'flight', id: 'older' }, 'passed', 'Too far', NOW);
		await markJob(db, { source: 'ashby', board: 'other', id: 'elsewhere' }, 'saved', '', NOW);

		const detail = await companyDetail(db, 'ashby', 'flight', '2026-10-26');
		expect(detail?.board).toMatchObject({ company: 'Flight Co', openJobs: 3 });
		expect(detail?.board.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(detail?.counts).toEqual([
			{ day: '2026-11-20', openJobs: 4 },
			{ day: '2026-11-25', openJobs: 5 }
		]);
		// Newest first, by the board's date or, without one, when first seen.
		expect(detail?.open.map((p) => p.id)).toEqual(['newer', 'unposted', 'older']);
		expect(detail?.closed).toEqual([
			{ id: 'closed-lately', title: 'Title closed-lately', closedAt: '2026-11-22T11:23:00.000Z' }
		]);
		expect([...(detail?.marks ?? [])].sort((a, b) => a.id.localeCompare(b.id))).toEqual([
			{ id: 'newer', title: 'Title newer', mark: 'saved', note: '', at: NOW },
			{ id: 'older', title: 'Title older', mark: 'passed', note: 'Too far', at: NOW }
		]);
	});
});
