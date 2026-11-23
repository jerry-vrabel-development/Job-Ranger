import { beforeEach, describe, expect, it } from 'vitest';
import { getPosting, markApplied, type JobKey } from './kits.ts';
import { followedUp, getTracked, listApplications, setStatus } from './tracker.ts';
import { addBoard, migratedDb } from './test-db.ts';

const NOW = '2026-11-23T18:00:00.000Z';
const job = (id: string): JobKey => ({ source: 'lever', board: 'Flight', id });

let db: D1Database;

async function apply(id: string, title: string, at: string) {
	await db
		.prepare(
			`INSERT INTO postings (source, board, id, company, title, location, workplace, apply_url,
			 first_seen_at, last_seen_at) VALUES ('lever', 'Flight', ?1, 'Flight Co', ?2, 'Remote',
			 'remote', 'https://x.test/1', ?3, ?3)`
		)
		.bind(id, title, at)
		.run();
	const posting = await getPosting(db, job(id));
	if (posting) await markApplied(db, posting, [], at);
}

beforeEach(async () => {
	db = await migratedDb();
	await db.batch(['applications', 'postings', 'boards'].map((t) => db.prepare(`DELETE FROM ${t}`)));
	await addBoard(db, { source: 'lever', token: 'Flight', company: 'Flight Co' });
	await apply('a', 'Pilot', '2026-11-01T00:00:00.000Z');
	await apply('b', 'Navigator', '2026-11-10T00:00:00.000Z');
});

describe('tracking applications', () => {
	it('starts every application at applied, newest first', async () => {
		expect(await listApplications(db)).toMatchObject([
			{ title: 'Navigator', status: 'applied', statusAt: null, followedUpAt: null, note: '' },
			{ title: 'Pilot', status: 'applied', company: 'Flight Co', source: 'lever', id: 'a' }
		]);
	});

	it('moves an application on with a note, dated today', async () => {
		expect(await setStatus(db, job('a'), 'interviewing', '  Call   with Sam. ', NOW)).toEqual({
			ok: true,
			message: 'Pilot at Flight Co: Interviewing.'
		});
		expect(await getTracked(db, job('a'))).toMatchObject({
			status: 'interviewing',
			statusAt: NOW,
			note: 'Call with Sam.'
		});
		expect((await setStatus(db, job('a'), 'offer', 'x'.repeat(301), NOW)).message).toBe(
			'That note is 301 characters. Keep it under 300.'
		);
	});

	it('records a follow-up', async () => {
		expect(await followedUp(db, job('b'), NOW)).toEqual({
			ok: true,
			message: 'Recorded your follow-up on Navigator.'
		});
		expect((await getTracked(db, job('b')))?.followedUpAt).toBe(NOW);
	});

	it('says when there’s no application, and fails loudly on a status it doesn’t know', async () => {
		expect((await setStatus(db, job('zzz'), 'offer', '', NOW)).message).toBe(
			'There’s no application recorded for this job.'
		);
		expect((await followedUp(db, job('zzz'), NOW)).ok).toBe(false);
		expect(await getTracked(db, job('zzz'))).toBeNull();
		await db.prepare(`UPDATE applications SET source = 'workday' WHERE posting_id = 'a'`).run();
		await expect(listApplications(db)).rejects.toThrow(/unknown source or status/);
	});
});
