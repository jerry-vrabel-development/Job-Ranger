/**
 * Test helpers for the Workers runtime: a migrated D1 and a few boards.
 * Only imported by *.worker.test.ts files.
 */
import type { D1Migration } from '@cloudflare/vitest-plugin';
import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import type { Board } from '#lib/jobs/posting.ts';

/** The test runtime's bindings: the real ones plus the migrations (see vite.config.ts). */
const testEnv = env as typeof env & { TEST_MIGRATIONS: D1Migration[] };

export async function migratedDb(): Promise<D1Database> {
	await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
	return testEnv.DB;
}

export async function addBoard(db: D1Database, board: Board): Promise<void> {
	await db
		.prepare('INSERT INTO boards (source, token, company) VALUES (?1, ?2, ?3)')
		.bind(board.source, board.token, board.company)
		.run();
}
