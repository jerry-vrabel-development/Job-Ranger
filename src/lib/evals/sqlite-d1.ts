/**
 * Just enough of D1 over Node's built-in SQLite for `npm run eval:labels`:
 * it loads an export of the database on my machine and reads it with the
 * same code the app uses (my profile, the labelled jobs), so the eval sees
 * what the app sees. Only the calls that code makes are here.
 */
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

type Row = Record<string, unknown>;

interface Statement {
	bind(...values: SQLInputValue[]): Statement;
	all(): Promise<{ results: Row[]; success: true }>;
	first(column?: string): Promise<unknown>;
	run(): Promise<{ success: true; meta: { changes: number; last_row_id: number } }>;
}

/** SQLite hands back rows without a prototype; the app's readers expect plain objects. */
const plain = (row: Row): Row => ({ ...row });

export function sqliteD1(database: DatabaseSync): D1Database {
	const statement = (sql: string, values: SQLInputValue[]): Statement => ({
		bind: (...next) => statement(sql, next),
		all: () =>
			Promise.resolve({
				results: database
					.prepare(sql)
					.all(...values)
					.map(plain),
				success: true as const
			}),
		first: (column?: string) => {
			const row = database.prepare(sql).get(...values);
			if (row === undefined) return Promise.resolve(null);
			const out = plain(row);
			return Promise.resolve(column === undefined ? out : (out[column] ?? null));
		},
		run: () => {
			const result = database.prepare(sql).run(...values);
			return Promise.resolve({
				success: true as const,
				meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) }
			});
		}
	});
	const d1 = {
		prepare: (sql: string) => statement(sql, []),
		batch: async (statements: readonly Statement[]) => {
			const out = [];
			for (const each of statements) out.push(await each.all());
			return out;
		}
	};
	return d1 as unknown as D1Database;
}
