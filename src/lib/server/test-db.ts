/**
 * Test helpers for the Workers runtime: a migrated D1 and a few boards.
 * Only imported by *.worker.test.ts files.
 */
import type { D1Migration } from '@cloudflare/vitest-plugin';
import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import type { Board } from '#lib/jobs/posting.ts';

/** The test runtime's bindings: the real ones plus the migrations (see vite.config.ts). */
const testEnv = env as typeof env & {
	TEST_MIGRATIONS: D1Migration[];
	MIGRATION_DB: D1Database;
};

/** All migrations, in order (for tests that apply them one step at a time). */
export const MIGRATIONS: readonly D1Migration[] = testEnv.TEST_MIGRATIONS;

/** A database only the migration tests use, starting empty. */
export const scratchDb: D1Database = testEnv.MIGRATION_DB;

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
