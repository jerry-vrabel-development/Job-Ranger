import { applyD1Migrations } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS, scratchDb as db } from './test-db.ts';

const first = (sql: string) => db.prepare(sql).first();

/** Every test starts from an empty scratch database: all tables dropped, whatever they are. */
beforeEach(async () => {
	const { results } = await db
		.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"
		)
		.all<{ name: string }>();
	await db.prepare('PRAGMA foreign_keys = OFF').run();
	for (const { name } of results) await db.prepare(`DROP TABLE IF EXISTS "${name}"`).run();
	await db.prepare('PRAGMA foreign_keys = ON').run();
});

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

describe('migration 0006: Breezy boards', () => {
	it('keeps every row, still keeps Lever names’ case, and then accepts Breezy', async () => {
		await applyD1Migrations(db, MIGRATIONS.slice(0, 5));
		await db
			.prepare(
				"INSERT INTO boards (source, token, company, paused) VALUES ('lever', 'BluesInc', 'Blues', 1)"
			)
			.run();
		const addBreezy = () =>
			db
				.prepare(
					"INSERT INTO boards (source, token, company) VALUES ('breezy', 'swing-left', 'Swing Left')"
				)
				.run();
		await expect(addBreezy()).rejects.toThrow();

		await applyD1Migrations(db, [...MIGRATIONS]);

		await addBreezy();
		expect(await first("SELECT paused FROM boards WHERE token = 'BluesInc'")).toEqual({
			paused: 1
		});
		await expect(
			db
				.prepare("INSERT INTO boards (source, token, company) VALUES ('breezy', 'Upper', 'U')")
				.run()
		).rejects.toThrow();
		expect(
			await first(
				"SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('boards_new', 'postings_new')"
			)
		).toEqual({ n: 0 });
	});
});

describe('migration 0007: daily open-job counts', () => {
	it('keeps one count per board per day, and only sensible values', async () => {
		await applyD1Migrations(db, [...MIGRATIONS]);
		const insert = (day: string, n: number) =>
			db
				.prepare(
					"INSERT INTO board_counts (source, board, day, open_jobs) VALUES ('ashby', 'x', ?1, ?2)"
				)
				.bind(day, n)
				.run();
		await insert('2026-11-18', 4);
		await expect(insert('2026-11-18', 5)).rejects.toThrow();
		await expect(insert('yesterday', 1)).rejects.toThrow();
		await expect(insert('2026-11-19', -1)).rejects.toThrow();
		expect(await first('SELECT COUNT(*) AS n FROM board_counts')).toEqual({ n: 1 });
	});
});

describe('migration 0008: interests', () => {
	it('keeps names unique in any case, keywords a JSON list, and tags tied to their interest', async () => {
		await applyD1Migrations(db, [...MIGRATIONS]);
		await db.prepare("INSERT INTO interests (id, name) VALUES (1, 'Robotics')").run();
		await expect(
			db.prepare("INSERT INTO interests (name) VALUES ('robotics')").run()
		).rejects.toThrow();
		await expect(
			db.prepare("INSERT INTO interests (name, keywords) VALUES ('X', '{}')").run()
		).rejects.toThrow();
		await expect(
			db.prepare("INSERT INTO interests (name, keywords) VALUES ('Y', 'not json')").run()
		).rejects.toThrow();
		await db
			.prepare("INSERT INTO board_interests (source, board, interest_id) VALUES ('ashby', 'x', 1)")
			.run();
		await db.prepare('DELETE FROM interests WHERE id = 1').run();
		expect(await first('SELECT COUNT(*) AS n FROM board_interests')).toEqual({ n: 0 });
	});
});

describe('migration 0009: facts', () => {
	it('keeps kinds, experience and sources to the known words, and text within limits', async () => {
		await applyD1Migrations(db, [...MIGRATIONS]);
		const insert = (kind: string, experience: string, source: string, text: string) =>
			db
				.prepare('INSERT INTO facts (kind, experience, source, text) VALUES (?1, ?2, ?3, ?4)')
				.bind(kind, experience, source, text)
				.run();
		await insert('skill', 'side', 'gap', 'Kubernetes, in a home lab');
		expect(await first('SELECT confirmed_at, retired_at FROM facts')).toEqual({
			confirmed_at: null,
			retired_at: null
		});
		await expect(insert('job', 'side', 'gap', 'x')).rejects.toThrow();
		await expect(insert('skill', 'expert', 'gap', 'x')).rejects.toThrow();
		await expect(insert('skill', 'side', 'magic', 'x')).rejects.toThrow();
		await expect(insert('skill', 'side', 'gap', '')).rejects.toThrow();
		await expect(insert('skill', 'side', 'gap', 'x'.repeat(501))).rejects.toThrow();
	});
});

describe('migration 0010: answers', () => {
	it('keeps questions and origins to the known words, and text within limits', async () => {
		await applyD1Migrations(db, [...MIGRATIONS]);
		const insert = (question: string, origin: string, text: string) =>
			db
				.prepare('INSERT INTO answers (question, origin, text) VALUES (?1, ?2, ?3)')
				.bind(question, origin, text)
				.run();
		await insert('pay', 'own', 'Open to discussing a fair range.');
		expect(await first('SELECT label, notes FROM answers')).toEqual({ label: '', notes: '' });
		await expect(insert('colour', 'own', 'x')).rejects.toThrow();
		await expect(insert('pay', 'magic', 'x')).rejects.toThrow();
		await expect(insert('pay', 'own', '')).rejects.toThrow();
		await expect(insert('pay', 'own', 'x'.repeat(5001))).rejects.toThrow();
	});
});

describe('migration 0011: kits and applications', () => {
	it('keeps questions a JSON list, the AI rule to known words, and one row per job', async () => {
		await applyD1Migrations(db, [...MIGRATIONS]);
		const kit = (questions: string, rule: string) =>
			db
				.prepare(
					'INSERT INTO kits (source, board, posting_id, questions, ai_rule) VALUES (?1, ?2, ?3, ?4, ?5)'
				)
				.bind('lever', 'Flight', String(Math.random()), questions, rule)
				.run();
		await kit('[]', 'unknown');
		await expect(kit('{}', 'none')).rejects.toThrow();
		await expect(kit('not json', 'none')).rejects.toThrow();
		await expect(kit('[]', 'maybe')).rejects.toThrow();
		const applied = () =>
			db
				.prepare(
					`INSERT INTO applications (source, board, posting_id, company, title, applied_at)
					 VALUES ('lever', 'Flight', 'abc', 'Flight Co', 'Pilot', '2026-11-20T00:00:00Z')`
				)
				.run();
		await applied();
		await expect(applied()).rejects.toThrow();
		expect(await first('SELECT answer_ids FROM applications')).toEqual({ answer_ids: '[]' });
	});
});

describe('migration 0012: profile and kit text', () => {
	it('keeps one profile row, and adds posting text and dismissed skills to kits', async () => {
		await applyD1Migrations(db, [...MIGRATIONS]);
		await db.prepare("INSERT INTO profile (id, name) VALUES (1, 'Jane')").run();
		await expect(
			db.prepare("INSERT INTO profile (id, name) VALUES (2, 'Two')").run()
		).rejects.toThrow();
		await db
			.prepare("INSERT INTO kits (source, board, posting_id) VALUES ('lever', 'f', '1')")
			.run();
		expect(await first('SELECT posting_text, dismissed FROM kits')).toEqual({
			posting_text: '',
			dismissed: '[]'
		});
		await expect(db.prepare("UPDATE kits SET dismissed = '{}'").run()).rejects.toThrow();
		await expect(
			db.prepare(`UPDATE kits SET posting_text = '${'x'.repeat(30_001)}'`).run()
		).rejects.toThrow();
	});
});

describe('migration 0013: drafts and usage', () => {
	it('keeps draft kinds and JSON lists, and usage per day and model', async () => {
		await applyD1Migrations(db, [...MIGRATIONS]);
		const draft = (kind: string, paragraphs: string, cost: number) =>
			db
				.prepare(
					`INSERT INTO drafts (source, board, posting_id, kind, paragraphs, model, cost_micros)
					 VALUES ('lever', 'f', ?4, ?1, ?2, 'm', ?3)`
				)
				.bind(kind, paragraphs, cost, String(Math.random()))
				.run();
		await draft('letter_full', '[]', 0);
		await expect(draft('poem', '[]', 0)).rejects.toThrow();
		await expect(draft('letter_short', '{}', 0)).rejects.toThrow();
		await expect(draft('letter_short', '[]', -1)).rejects.toThrow();
		await db.prepare("INSERT INTO model_usage (day, model) VALUES ('2026-11-20', 'm')").run();
		await expect(
			db.prepare("INSERT INTO model_usage (day, model) VALUES ('2026-11-20', 'm')").run()
		).rejects.toThrow();
		await expect(
			db.prepare("INSERT INTO model_usage (day, model) VALUES ('today', 'm')").run()
		).rejects.toThrow();
	});
});
