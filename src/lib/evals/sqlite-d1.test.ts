/**
 * The eval:labels path end to end, in Node: every migration applied to an
 * in-memory SQLite, then my profile and the labelled jobs read with the
 * app's own code through the D1 stand-in.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { labelledJobs } from '#lib/server/evals.ts';
import { scoringProfile } from '#lib/server/scoring.ts';
import { markOf, statusOf, wantedFrom } from './labels.ts';
import { sqliteD1 } from './sqlite-d1.ts';

const SEEN = '2026-11-20T00:00:00.000Z';

let database: DatabaseSync;
let db: D1Database;

function job(id: string, title: string, department: string | null = 'Engineering') {
	database
		.prepare(
			`INSERT INTO postings (source, board, id, company, title, location, workplace, department,
			 apply_url, first_seen_at, last_seen_at)
			 VALUES ('ashby', 'example', ?1, 'Example', ?2, 'Remote', 'remote', ?3,
			 'https://example.com/apply', ?4, ?4)`
		)
		.run(id, title, department, SEEN);
}

const postingText = (id: string, words: string) =>
	database
		.prepare(
			`INSERT INTO posting_texts (source, board, id, text) VALUES ('ashby', 'example', ?1, ?2)`
		)
		.run(id, words);

const mark = (id: string, which: 'saved' | 'passed') =>
	database
		.prepare(
			`INSERT INTO job_marks (source, board, posting_id, mark, marked_at)
			 VALUES ('ashby', 'example', ?1, ?2, ?3)`
		)
		.run(id, which, SEEN);

const applied = (id: string, status: string) =>
	database
		.prepare(
			`INSERT INTO applications (source, board, posting_id, company, title, applied_at, status)
			 VALUES ('ashby', 'example', ?1, 'Example', 'A job', ?2, ?3)`
		)
		.run(id, SEEN, status);

beforeEach(() => {
	database = new DatabaseSync(':memory:');
	for (const file of readdirSync('migrations').sort()) {
		database.exec(readFileSync(`migrations/${file}`, 'utf8'));
	}
	database
		.prepare(`INSERT INTO boards (source, token, company) VALUES ('ashby', 'example', 'Example')`)
		.run();
	db = sqliteD1(database);
});

describe('wantedFrom', () => {
	it('counts saving or applying as wanted and passing as not, and leaves out a withdrawal', () => {
		expect(wantedFrom('saved', null)).toBe(true);
		expect(wantedFrom('passed', null)).toBe(false);
		expect(wantedFrom(null, 'rejected')).toBe(true);
		expect(wantedFrom('passed', 'interviewing')).toBe(true);
		expect(wantedFrom('saved', 'withdrawn')).toBeNull();
		expect(wantedFrom(null, null)).toBeNull();
	});

	it('reads only marks and statuses it knows', () => {
		expect([markOf('saved'), markOf('passed'), markOf('later'), markOf(null)]).toEqual([
			'saved',
			'passed',
			null,
			null
		]);
		expect([statusOf('offer'), statusOf('ghosted'), statusOf(3)]).toEqual(['offer', null, null]);
	});
});

describe('labelledJobs, through the D1 stand-in', () => {
	it('labels every marked or applied job with its kept text, and counts what it left out', async () => {
		job('a', 'Frontend Engineer');
		postingText('a', 'Build accessible forms.');
		mark('a', 'saved');
		job('b', 'Data Scientist', null);
		postingText('b', 'Train models.');
		mark('b', 'passed');
		job('c', 'Web Developer');
		postingText('c', 'Typed JavaScript.');
		applied('c', 'offer');
		job('d', 'No text');
		mark('d', 'saved');
		job('e', 'Withdrawn');
		postingText('e', 'Words.');
		applied('e', 'withdrawn');
		job('f', 'Never marked');
		postingText('f', 'Words.');

		const file = await labelledJobs(db);
		expect(file.skipped).toEqual({ noText: 1, unclear: 1 });
		expect(file.labels.map((label) => [label.key, label.wanted])).toEqual([
			['ashby:example:a', true],
			['ashby:example:b', false],
			['ashby:example:c', true]
		]);
		expect(file.labels[1]?.job).toEqual({
			title: 'Data Scientist',
			company: 'Example',
			location: 'Remote',
			workplace: 'remote',
			department: null,
			postingText: 'Train models.'
		});
	});
});

describe('scoringProfile, through the D1 stand-in', () => {
	it('reads confirmed facts, live interests and set preferences, as the app does', async () => {
		database.exec(`
			INSERT INTO facts (id, kind, text, source, confirmed_at, experience)
				VALUES (1, 'skill', 'TypeScript', 'typed', '${SEEN}', 'side'),
				       (2, 'skill', 'Unconfirmed', 'typed', NULL, 'side');
			INSERT INTO interests (id, name, note, keywords) VALUES (1, 'Civic tech', '', '["civic tech"]');
			INSERT INTO interests (id, name, note, keywords, paused) VALUES (2, 'Paused', '', '[]', 1);
			INSERT INTO board_interests (interest_id, source, board) VALUES (1, 'ashby', 'example');
			INSERT INTO preferences (id, workplaces, looking_for) VALUES (1, '["remote"]', 'Small teams.');
		`);
		const profile = await scoringProfile(db);
		expect(profile.facts.map((fact) => fact.text)).toEqual(['TypeScript']);
		expect(profile.interests).toEqual([
			{ id: 1, name: 'Civic tech', note: '', keywords: ['civic tech'] }
		]);
		expect(profile.preferences).toMatchObject({ looking_for: 'Small teams.' });
	});

	it('answers a missing row with null, a chosen column, and a write with its changes', async () => {
		expect(await db.prepare('SELECT * FROM preferences WHERE id = ?1').bind(1).first()).toBeNull();
		expect(
			await db
				.prepare(`SELECT company FROM boards WHERE token = ?1`)
				.bind('example')
				.first('company')
		).toBe('Example');
		expect(
			await db
				.prepare(`SELECT company FROM boards WHERE token = ?1`)
				.bind('example')
				.first('nothing')
		).toBeNull();
		const result = await db
			.prepare(`UPDATE boards SET paused = 1 WHERE token = ?1`)
			.bind('example')
			.run();
		expect(result.meta).toMatchObject({ changes: 1 });
	});
});
