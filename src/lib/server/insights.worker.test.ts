import { beforeEach, describe, expect, it } from 'vitest';
import { getPosting, markApplied, type JobKey } from './kits.ts';
import { searchCounts } from './insights.ts';
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
		['job_marks', 'applications', 'postings', 'boards'].map((t) => db.prepare(`DELETE FROM ${t}`))
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
