import { applyD1Migrations } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, scratchDb as db } from './test-db.ts';

const first = (sql: string) => db.prepare(sql).first();

describe('migration 0002: Greenhouse boards', () => {
	it('keeps every board and posting, and then accepts Greenhouse', async () => {
		// The database as it is in production today: migration 0001 only.
		await applyD1Migrations(db, MIGRATIONS.slice(0, 1));
		await db.batch([
			db.prepare(
				`INSERT INTO boards (source, token, company, last_fetched_at, last_fetch_ok, last_fetch_note)
				 VALUES ('ashby', 'example', 'Example Co', '2026-11-17T11:23:00.000Z', 1, '1 open')`
			),
			db.prepare(
				`INSERT INTO postings (source, board, id, company, title, location, workplace, apply_url,
				 pay_summary, pay_min, first_seen_at, last_seen_at, reopen_count, seen_at)
				 VALUES ('ashby', 'example', 'a1', 'Example Co', 'Engineer', 'Remote', 'remote',
				 'https://jobs.ashbyhq.com/example/a1/application', '$1', 1, '2026-11-17T11:23:00.000Z',
				 '2026-11-17T11:23:00.000Z', 2, '2026-11-17T12:00:00.000Z')`
			)
		]);
		await expect(
			db
				.prepare("INSERT INTO boards (source, token, company) VALUES ('greenhouse', 'x', 'X')")
				.run()
		).rejects.toThrow();

		await applyD1Migrations(db, [...MIGRATIONS]);

		expect(await first('SELECT * FROM boards')).toMatchObject({
			source: 'ashby',
			token: 'example',
			last_fetch_ok: 1,
			last_fetch_note: '1 open'
		});
		expect(await first('SELECT * FROM postings')).toMatchObject({
			id: 'a1',
			pay_summary: '$1',
			pay_min: 1,
			reopen_count: 2,
			seen_at: '2026-11-17T12:00:00.000Z'
		});

		await db
			.prepare(
				"INSERT INTO boards (source, token, company) VALUES ('greenhouse', 'navapbc', 'Nava')"
			)
			.run();
		await expect(
			db.prepare("INSERT INTO boards (source, token, company) VALUES ('workday', 'x', 'X')").run()
		).rejects.toThrow();

		// Postings still belong to boards: removing a board removes its postings.
		await db.prepare("DELETE FROM boards WHERE token = 'example'").run();
		expect(await first('SELECT COUNT(*) AS n FROM postings')).toEqual({ n: 0 });

		// The list page's index came back.
		expect(
			await first(
				"SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'postings_open_newest'"
			)
		).toEqual({ name: 'postings_open_newest' });
		// No leftovers.
		expect(
			await first(
				"SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('boards_new', 'postings_new')"
			)
		).toEqual({ n: 0 });
	});
});

describe('migration 0003: paused boards', () => {
	it('starts every board unpaused, and only accepts 0 or 1', async () => {
		await applyD1Migrations(db, [...MIGRATIONS]);
		await db
			.prepare("INSERT INTO boards (source, token, company) VALUES ('ashby', 'paused', 'P')")
			.run();
		expect(await first("SELECT paused FROM boards WHERE token = 'paused'")).toEqual({
			paused: 0
		});
		await expect(
			db.prepare("UPDATE boards SET paused = 2 WHERE token = 'paused'").run()
		).rejects.toThrow();
	});
});

describe('migration 0004: Lever boards', () => {
	it('keeps every board, its pause and its postings, and then accepts Lever', async () => {
		// The database as it is in production before this migration: 0001 to 0003.
		await db.batch([
			db.prepare('DROP TABLE IF EXISTS postings'),
			db.prepare('DROP TABLE IF EXISTS boards'),
			db.prepare('DROP TABLE IF EXISTS d1_migrations')
		]);
		await applyD1Migrations(db, MIGRATIONS.slice(0, 3));
		await db.batch([
			db.prepare(
				`INSERT INTO boards (source, token, company, last_fetch_ok, last_fetch_note, paused)
				 VALUES ('greenhouse', 'splice', 'Splice', 1, '4 open', 1)`
			),
			db.prepare(
				`INSERT INTO postings (source, board, id, company, title, location, workplace, apply_url,
				 first_seen_at, last_seen_at)
				 VALUES ('greenhouse', 'splice', 'g1', 'Splice', 'Designer', 'Remote', 'remote',
				 'https://job-boards.greenhouse.io/splice/jobs/1', '2026-11-18T00:00:00.000Z',
				 '2026-11-18T00:00:00.000Z')`
			)
		]);
		await expect(
			db.prepare("INSERT INTO boards (source, token, company) VALUES ('lever', 'x', 'X')").run()
		).rejects.toThrow();

		await applyD1Migrations(db, [...MIGRATIONS]);

		expect(await first("SELECT * FROM boards WHERE token = 'splice'")).toMatchObject({
			company: 'Splice',
			last_fetch_note: '4 open',
			paused: 1
		});
		expect(await first('SELECT id FROM postings')).toEqual({ id: 'g1' });
		await db
			.prepare("INSERT INTO boards (source, token, company) VALUES ('lever', 'skydio', 'Skydio')")
			.run();
		await expect(
			db.prepare("UPDATE boards SET paused = 2 WHERE token = 'skydio'").run()
		).rejects.toThrow();
		await db.prepare("DELETE FROM boards WHERE token = 'splice'").run();
		expect(await first('SELECT COUNT(*) AS n FROM postings')).toEqual({ n: 0 });
		expect(
			await first(
				"SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('boards_new', 'postings_new')"
			)
		).toEqual({ n: 0 });
		expect(
			await first(
				"SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'postings_open_newest'"
			)
		).toEqual({ name: 'postings_open_newest' });
	});
});

describe('migration 0005: Lever board names keep their case', () => {
	it('accepts a mixed-case Lever name, still lowercases the others, and keeps every row', async () => {
		await db.batch([
			db.prepare('DROP TABLE IF EXISTS postings'),
			db.prepare('DROP TABLE IF EXISTS boards'),
			db.prepare('DROP TABLE IF EXISTS d1_migrations')
		]);
		await applyD1Migrations(db, MIGRATIONS.slice(0, 4));
		await db.batch([
			db.prepare(
				`INSERT INTO boards (source, token, company, paused) VALUES ('lever', 'spotify', 'Spotify', 1)`
			),
			db.prepare(
				`INSERT INTO postings (source, board, id, company, title, location, workplace, apply_url,
				 first_seen_at, last_seen_at)
				 VALUES ('lever', 'spotify', 'l1', 'Spotify', 'Engineer', 'Remote', 'remote',
				 'https://jobs.lever.co/spotify/l1/apply', '2026-11-18T00:00:00.000Z',
				 '2026-11-18T00:00:00.000Z')`
			)
		]);
		const addBlues = () =>
			db
				.prepare(
					"INSERT INTO boards (source, token, company) VALUES ('lever', 'BluesInc', 'Blues')"
				)
				.run();
		await expect(addBlues()).rejects.toThrow();

		await applyD1Migrations(db, [...MIGRATIONS]);

		await addBlues();
		await expect(
			db
				.prepare("INSERT INTO boards (source, token, company) VALUES ('greenhouse', 'Splice', 'S')")
				.run()
		).rejects.toThrow();
		expect(await first("SELECT paused FROM boards WHERE token = 'spotify'")).toEqual({ paused: 1 });
		expect(await first('SELECT id FROM postings')).toEqual({ id: 'l1' });
		await db.prepare("DELETE FROM boards WHERE token = 'spotify'").run();
		expect(await first('SELECT COUNT(*) AS n FROM postings')).toEqual({ n: 0 });
		expect(
			await first(
				"SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('boards_new', 'postings_new')"
			)
		).toEqual({ n: 0 });
		expect(
			await first(
				"SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'postings_open_newest'"
			)
		).toEqual({ name: 'postings_open_newest' });
	});
});
