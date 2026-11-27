/**
 * What I'm looking for, stored (design note 0008, step 3). One row; the
 * words are checked in #lib/preferences.ts before they get here.
 */
import { LEVELS, WORKPLACES, EMPTY_PREFERENCES, type Preferences } from '#lib/preferences.ts';
import { text } from './db.ts';

/** A stored JSON list (the table checks it is one), keeping only the words still known. */
function known<T extends string>(raw: string, words: readonly T[]): T[] {
	const stored = JSON.parse(raw) as unknown[];
	return words.filter((word) => stored.includes(word));
}

export async function getPreferences(db: D1Database): Promise<Preferences> {
	const row = await db.prepare('SELECT * FROM preferences WHERE id = 1').first();
	if (row === null) return EMPTY_PREFERENCES;
	const pay = row['pay_floor'];
	return {
		workplaces: known(text(row, 'workplaces'), WORKPLACES),
		area: text(row, 'area'),
		levels: known(text(row, 'levels'), LEVELS),
		payFloor: typeof pay === 'number' ? pay : null,
		lookingFor: text(row, 'looking_for')
	};
}

export async function savePreferences(
	db: D1Database,
	preferences: Preferences
): Promise<{ ok: true; message: string }> {
	await db
		.prepare(
			`INSERT INTO preferences (id, workplaces, area, levels, pay_floor, looking_for)
			 VALUES (1, ?1, ?2, ?3, ?4, ?5)
			 ON CONFLICT (id) DO UPDATE SET workplaces = excluded.workplaces, area = excluded.area,
			 levels = excluded.levels, pay_floor = excluded.pay_floor, looking_for = excluded.looking_for,
			 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
		)
		.bind(
			JSON.stringify(preferences.workplaces),
			preferences.area,
			JSON.stringify(preferences.levels),
			preferences.payFloor,
			preferences.lookingFor
		)
		.run();
	return { ok: true, message: 'Saved what you’re looking for.' };
}
