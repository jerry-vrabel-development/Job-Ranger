import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Board } from '#lib/jobs/posting.ts';
import { addFact, pasteFacts } from './facts.ts';
import { getPosting, markApplied, prepareKit, type JobKey } from './kits.ts';
import { reviewAnswer, reviewSummary } from './review.ts';
import { addBoard, migratedDb } from './test-db.ts';

const flight: Board = { source: 'lever', token: 'Flight', company: 'Flight Co' };
const other: Board = { source: 'lever', token: 'other', company: 'Spotify' };
const job: JobKey = { source: 'lever', board: 'Flight', id: 'abc' };
const NOW = '2026-11-22T15:00:00.000Z';

let db: D1Database;

async function posting(board: string, id: string, company: string, title: string) {
	await db
		.prepare(
			`INSERT INTO postings (source, board, id, company, title, location, workplace, apply_url,
			 first_seen_at, last_seen_at) VALUES ('lever', ?1, ?2, ?3, ?4, 'Remote', 'remote',
			 'https://x.test/1', ?5, ?5)`
		)
		.bind(board, id, company, title, NOW)
		.run();
}

beforeEach(async () => {
	db = await migratedDb();
	await db.batch(
		['resume_summaries', 'applications', 'kits', 'facts', 'postings', 'boards'].map((table) =>
			db.prepare(`DELETE FROM ${table}`)
		)
	);
	await addBoard(db, flight);
	await addBoard(db, other);
	await posting('Flight', 'abc', 'Flight Co', 'Pilot');
	await posting('other', 'p1', 'Spotify', 'Senior Pilot, Playlists');
	await posting('other', 'p2', 'Spotify', 'Staff Pilot, Podcasts');
	await prepareKit(db, vi.fn<typeof fetch>(), job);
	await prepareKit(db, vi.fn<typeof fetch>(), { source: 'lever', board: 'other', id: 'p1' });
	const applied = await getPosting(db, { source: 'lever', board: 'other', id: 'p2' });
	if (applied) await markApplied(db, applied, [], NOW);
	await addFact(db, {
		kind: 'accomplishment',
		experience: 'professional',
		organization: 'Air Force',
		period: '1985–1989',
		text: 'Led a 12-person flight security team.'
	});
	// Not confirmed, so its number doesn't count.
	await pasteFacts(db, [
		{ kind: 'skill', experience: 'side', organization: '', period: '', text: 'Flew 300 hours' }
	]);
});

describe('reviewSummary', () => {
	it('checks names, numbers and length against this job and my confirmed facts', async () => {
		expect(await reviewSummary(db, job, 'Led a 12-person security team, 1985–1989.')).toEqual({
			ok: true,
			suggestions: []
		});
		const result = await reviewSummary(
			db,
			job,
			`Senior Pilot, Playlists at Spotify. Flew 300 hours. ${'Calm. '.repeat(80)}`
		);
		expect('suggestions' in result && result.suggestions.map((s) => s.label)).toEqual([
			'Wrong company',
			'Wrong role',
			'Too long',
			'Not in your facts'
		]);
	});

	it('counts a title from an application too, but not this job’s own', async () => {
		const result = await reviewSummary(db, job, 'Staff Pilot, Podcasts. Pilot.');
		expect('suggestions' in result && result.suggestions).toEqual([
			{
				label: 'Wrong role',
				detail: 'Names “Staff Pilot, Podcasts”, another job’s title, not “Pilot”.'
			}
		]);
	});

	it('says when another job’s resume uses the same summary', async () => {
		const keep = (board: string, id: string, kept: string) =>
			db
				.prepare(
					`INSERT INTO resume_summaries (source, board, posting_id, paragraphs, model, cost_micros,
					 kept_text, kept_at) VALUES ('lever', ?1, ?2, '[]', 'm', 0, ?3, ?4)`
				)
				.bind(board, id, kept, NOW)
				.run();
		await keep('other', 'p1', 'Led a 12-person team.');
		await keep('Flight', 'abc', 'Mine, for this job.');
		await keep('gone', 'x', 'Kept for a job that left.');
		const same = await reviewSummary(db, job, 'Led a 12-person team.');
		expect('suggestions' in same && same.suggestions).toEqual([
			{
				label: 'Same as another application',
				detail:
					'Word for word what Senior Pilot, Playlists at Spotify got. Tailor a line to Flight Co.'
			}
		]);
		const left = await reviewSummary(db, job, 'Kept for a job that left.');
		expect('suggestions' in left && left.suggestions[0]?.detail).toMatch(
			/^Word for word what another job got/
		);
		const own = await reviewSummary(db, job, 'Mine, for this job.');
		expect('suggestions' in own && own.suggestions).toEqual([]);
	});

	it('says when the job is gone', async () => {
		expect(await reviewSummary(db, { ...job, id: 'nope' }, 'x')).toEqual({
			ok: false,
			message: 'That job is no longer in Job Ranger.'
		});
	});
});

describe('reviewAnswer', () => {
	it('asks a “why this company” answer to name the company, and others not to', async () => {
		const why = await reviewAnswer(db, job, 'Why do you want to work here?', 'I love flying.');
		expect('suggestions' in why && why.suggestions).toEqual([
			{
				label: 'Missing company',
				detail: 'Never names Flight Co, and the question asks why them.'
			}
		]);
		const lead = await reviewAnswer(db, job, 'Tell us about a time you led a team.', 'I led 12.');
		expect('suggestions' in lead && lead.suggestions).toEqual([]);
		expect(await reviewAnswer(db, { ...job, id: 'nope' }, 'Why?', 'x')).toMatchObject({
			ok: false
		});
	});

	it('holds an answer to the answer length', async () => {
		const long = await reviewAnswer(db, job, 'About you?', 'word '.repeat(201));
		expect('suggestions' in long && long.suggestions).toEqual([
			{ label: 'Too long', detail: '201 words; keep it to 200.' }
		]);
	});
});
