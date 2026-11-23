import { beforeEach, describe, expect, it } from 'vitest';
import type { Board } from '#lib/jobs/posting.ts';
import { NO_FILTER } from '#lib/jobs/filter.ts';
import { countOpenPostings, listOpenPostings, removeBoard } from './db.ts';
import type { JobKey } from './kits.ts';
import { clearMark, jobMarks, markJob } from './marks.ts';
import { addBoard, migratedDb } from './test-db.ts';

const board: Board = { source: 'lever', token: 'Flight', company: 'Flight Co' };
const NOW = '2026-11-23T18:00:00.000Z';
const job = (id: string): JobKey => ({ source: 'lever', board: 'Flight', id });

let db: D1Database;

beforeEach(async () => {
	db = await migratedDb();
	await db.batch(['job_marks', 'postings', 'boards'].map((t) => db.prepare(`DELETE FROM ${t}`)));
	await addBoard(db, board);
	for (const [id, title] of [
		['a', 'Pilot'],
		['b', 'Navigator'],
		['c', 'Mechanic']
	]) {
		await db
			.prepare(
				`INSERT INTO postings (source, board, id, company, title, location, workplace, apply_url,
				 first_seen_at, last_seen_at) VALUES ('lever', 'Flight', ?1, 'Flight Co', ?2, 'Remote',
				 'remote', 'https://x.test/1', ?3, ?3)`
			)
			.bind(id, title, NOW)
			.run();
	}
});

const ids = async (show: 'saved' | 'passed' | null) =>
	(await listOpenPostings(db, { ...NO_FILTER, show })).map((p) => p.id).sort();

describe('saved and passed jobs', () => {
	it('saves a job, and the list can show saved ones alone', async () => {
		expect(await markJob(db, job('a'), 'saved', 'ignored for a save', NOW)).toEqual({
			ok: true,
			message: 'Saved Pilot at Flight Co.'
		});
		expect(await ids('saved')).toEqual(['a']);
		expect(await ids(null)).toEqual(['a', 'b', 'c']);
		expect((await jobMarks(db)).get('lever:Flight:a')).toEqual({
			mark: 'saved',
			note: '',
			at: NOW
		});
	});

	it('takes a passed job off the list, with its note, until asked for', async () => {
		expect(await markJob(db, job('b'), 'passed', '  Needs   a clearance. ', NOW)).toEqual({
			ok: true,
			message:
				'Passed on Navigator at Flight Co. It’s off the list; choose “Passed only” to see it again.'
		});
		expect(await ids(null)).toEqual(['a', 'c']);
		expect(await countOpenPostings(db)).toBe(2);
		expect(await ids('passed')).toEqual(['b']);
		expect((await jobMarks(db)).get('lever:Flight:b')?.note).toBe('Needs a clearance.');
	});

	it('lets a new mark replace the old one, and clears either', async () => {
		await markJob(db, job('c'), 'passed', 'Too far.', NOW);
		await markJob(db, job('c'), 'saved', '', NOW);
		expect(await ids('passed')).toEqual([]);
		expect(await clearMark(db, job('c'))).toEqual({
			ok: true,
			message: 'That job is no longer saved.'
		});
		await markJob(db, job('c'), 'passed', '', NOW);
		expect((await clearMark(db, job('c'))).message).toBe('That job is back on the list.');
		expect((await clearMark(db, job('c'))).message).toBe('That job had no mark.');
	});

	it('refuses a missing job or a long note', async () => {
		expect((await markJob(db, job('zzz'), 'saved', '', NOW)).message).toBe(
			'That job is no longer in Job Ranger.'
		);
		expect((await markJob(db, job('a'), 'passed', 'x'.repeat(301), NOW)).message).toBe(
			'That note is 301 characters. Keep it under 300.'
		);
	});

	it('removes marks with their company', async () => {
		await markJob(db, job('a'), 'saved', '', NOW);
		await removeBoard(db, 'lever', 'Flight');
		expect(await db.prepare('SELECT COUNT(*) AS n FROM job_marks').first()).toEqual({ n: 0 });
	});
});
