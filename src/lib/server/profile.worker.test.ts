import { beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_PROFILE, getProfile, saveProfile } from './profile.ts';
import { migratedDb } from './test-db.ts';

let db: D1Database;

beforeEach(async () => {
	db = await migratedDb();
	await db.prepare('DELETE FROM profile').run();
});

describe('your details', () => {
	it('starts empty, saves, and saves again over the same row', async () => {
		expect(await getProfile(db)).toEqual(EMPTY_PROFILE);
		const me = { name: 'Jane', headline: 'Dev', email: 'j@x.co', phone: '1', location: 'Chicago' };
		expect(await saveProfile(db, me)).toEqual({ ok: true, message: 'Saved your details.' });
		await saveProfile(db, { ...me, phone: '' });
		expect(await getProfile(db)).toEqual({ ...me, phone: '' });
		expect(await db.prepare('SELECT COUNT(*) AS n FROM profile').first()).toEqual({ n: 1 });
	});
});
