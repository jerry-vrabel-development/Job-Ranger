import { beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_PREFERENCES } from '#lib/preferences.ts';
import { getPreferences, savePreferences } from './preferences.ts';
import { migratedDb } from './test-db.ts';

let db: D1Database;

beforeEach(async () => {
	db = await migratedDb();
	await db.prepare('DELETE FROM preferences').run();
});

describe('what you’re looking for', () => {
	it('starts empty, saves, and saves again over the same row', async () => {
		expect(await getPreferences(db)).toEqual(EMPTY_PREFERENCES);
		const mine = {
			workplaces: ['remote', 'hybrid'],
			area: 'Chicago area',
			levels: ['senior'],
			payFloor: 130000,
			lookingFor: 'Drones or music.'
		} as const;
		expect(await savePreferences(db, mine)).toEqual({
			ok: true,
			message: 'Saved what you’re looking for.'
		});
		expect(await getPreferences(db)).toEqual(mine);
		await savePreferences(db, { ...mine, payFloor: null, levels: [] });
		expect(await getPreferences(db)).toEqual({ ...mine, payFloor: null, levels: [] });
		expect(await db.prepare('SELECT COUNT(*) AS n FROM preferences').first()).toEqual({ n: 1 });
	});

	it('drops stored words it no longer knows', async () => {
		await db
			.prepare(
				`INSERT INTO preferences (id, workplaces, levels) VALUES (1, '["remote","moon"]', '["guru","lead"]')`
			)
			.run();
		expect(await getPreferences(db)).toMatchObject({ workplaces: ['remote'], levels: ['lead'] });
	});
});
