import { beforeEach, describe, expect, it } from 'vitest';
import type { Board } from '#lib/jobs/posting.ts';
import { removeBoard, rowsOf, setPaused, StoredDataError } from './db.ts';
import {
	createInterest,
	listInterests,
	removeInterest,
	setInterestPaused,
	updateInterest,
	type InterestInput
} from './interests.ts';
import { addBoard, migratedDb } from './test-db.ts';

const zipline: Board = { source: 'greenhouse', token: 'flyzipline', company: 'Zipline' };
const blues: Board = { source: 'lever', token: 'BluesInc', company: 'Blues' };

const robotics: InterestInput = {
	name: 'Robotics',
	note: 'hardware that moves',
	keywords: ['robot', 'ros']
};

let db: D1Database;

beforeEach(async () => {
	db = await migratedDb();
	await db.batch([
		db.prepare('DELETE FROM board_interests'),
		db.prepare('DELETE FROM interests'),
		db.prepare('DELETE FROM postings'),
		db.prepare('DELETE FROM boards')
	]);
	await addBoard(db, zipline);
	await addBoard(db, blues);
});

const idOf = async (name: string) => {
	const found = (await listInterests(db)).find((interest) => interest.name === name);
	if (!found) throw new Error(`no interest ${name}`);
	return found.id;
};

describe('createInterest and listInterests', () => {
	it('adds an interest, and lists interests by name', async () => {
		expect(await createInterest(db, robotics)).toEqual({
			ok: true,
			message: 'Added Robotics. Tag companies with it from its Edit form.'
		});
		await createInterest(db, { name: 'Drones', note: '', keywords: [] });
		const list = await listInterests(db);
		expect(list.map((interest) => interest.name)).toEqual(['Drones', 'Robotics']);
		expect(list[1]).toMatchObject({
			name: 'Robotics',
			note: 'hardware that moves',
			keywords: ['robot', 'ros'],
			paused: false,
			companies: []
		});
	});

	it('refuses a name already used, in any case', async () => {
		await createInterest(db, robotics);
		expect(await createInterest(db, { ...robotics, name: 'ROBOTICS' })).toEqual({
			ok: false,
			message: 'You already have an interest called ROBOTICS.'
		});
	});

	it('lets other database errors through, rather than calling them a duplicate', async () => {
		await expect(createInterest(db, { ...robotics, note: 'x'.repeat(301) })).rejects.toThrow();
	});

	it('fails loudly on stored keywords that are not a list of words', async () => {
		await createInterest(db, robotics);
		await db.prepare(`UPDATE interests SET keywords = '[1, 2]'`).run();
		await expect(listInterests(db)).rejects.toThrow(StoredDataError);
	});
});

describe('updateInterest', () => {
	it('saves the fields and replaces the tags, ignoring companies not on the list', async () => {
		await createInterest(db, robotics);
		const id = await idOf('Robotics');
		const result = await updateInterest(db, id, { name: 'Robots', note: '', keywords: ['robot'] }, [
			{ source: 'greenhouse', token: 'flyzipline' },
			{ source: 'lever', token: 'BluesInc' },
			{ source: 'ashby', token: 'not-on-the-list' }
		]);
		expect(result).toEqual({ ok: true, message: 'Saved Robots.' });
		expect((await listInterests(db))[0]).toMatchObject({
			name: 'Robots',
			note: '',
			keywords: ['robot'],
			companies: [
				{ key: 'lever:BluesInc', company: 'Blues' },
				{ key: 'greenhouse:flyzipline', company: 'Zipline' }
			]
		});

		await updateInterest(db, id, robotics, [{ source: 'lever', token: 'BluesInc' }]);
		expect((await listInterests(db))[0]?.companies).toEqual([
			{ key: 'lever:BluesInc', company: 'Blues' }
		]);
	});

	it('refuses to rename onto another interest’s name', async () => {
		await createInterest(db, robotics);
		await createInterest(db, { name: 'Drones', note: '', keywords: [] });
		const id = await idOf('Drones');
		expect(await updateInterest(db, id, { ...robotics, name: 'robotics' }, [])).toEqual({
			ok: false,
			message: 'You already have an interest called robotics.'
		});
	});

	it('lets other database errors through', async () => {
		await createInterest(db, robotics);
		const id = await idOf('Robotics');
		await expect(
			updateInterest(db, id, { ...robotics, note: 'x'.repeat(301) }, [])
		).rejects.toThrow();
	});

	it('says when the interest is gone', async () => {
		expect(await updateInterest(db, 999, robotics, [])).toEqual({
			ok: false,
			message: 'That interest is no longer on your list.'
		});
	});
});

describe('setInterestPaused and removeInterest', () => {
	beforeEach(async () => {
		await createInterest(db, robotics);
		await updateInterest(db, await idOf('Robotics'), robotics, [
			{ source: 'greenhouse', token: 'flyzipline' }
		]);
	});

	it('pauses and resumes, keeping the tags', async () => {
		const id = await idOf('Robotics');
		expect(await setInterestPaused(db, id, true)).toEqual({
			ok: true,
			message: "Paused Robotics. It's hidden from the Jobs filters; its tags are kept."
		});
		expect((await listInterests(db))[0]).toMatchObject({
			paused: true,
			companies: [{ key: 'greenhouse:flyzipline' }]
		});
		expect(await setInterestPaused(db, id, false)).toEqual({
			ok: true,
			message: 'Resumed Robotics.'
		});
	});

	it('removes an interest and its tags, saying the companies stay', async () => {
		const id = await idOf('Robotics');
		expect(await removeInterest(db, id)).toEqual({
			ok: true,
			message: 'Removed Robotics. 1 company was tagged with it; the companies and their jobs stay.'
		});
		expect(await listInterests(db)).toEqual([]);
		expect(await db.prepare('SELECT COUNT(*) AS n FROM board_interests').first()).toEqual({ n: 0 });
		expect(await db.prepare('SELECT COUNT(*) AS n FROM boards').first()).toEqual({ n: 2 });
	});

	it('counts companies in the plural', async () => {
		const id = await idOf('Robotics');
		await updateInterest(db, id, robotics, [
			{ source: 'greenhouse', token: 'flyzipline' },
			{ source: 'lever', token: 'BluesInc' }
		]);
		expect((await removeInterest(db, id)).message).toMatch(/2 companies were tagged/);
	});

	it('says when the interest is gone', async () => {
		const gone = { ok: false, message: 'That interest is no longer on your list.' };
		expect(await setInterestPaused(db, 999, true)).toEqual(gone);
		expect(await removeInterest(db, 999)).toEqual(gone);
	});

	it('removing a company removes its tags; pausing it keeps them', async () => {
		await setPaused(db, 'greenhouse', 'flyzipline', true);
		expect((await listInterests(db))[0]?.companies).toHaveLength(1);
		await removeBoard(db, 'greenhouse', 'flyzipline');
		expect((await listInterests(db))[0]?.companies).toEqual([]);
		expect(await db.prepare('SELECT COUNT(*) AS n FROM board_interests').first()).toEqual({ n: 0 });
	});
});

describe('rowsOf', () => {
	it('reads a batch result, and fails loudly on a missing one', () => {
		expect(
			rowsOf({ results: [{ n: 1 }], success: true, meta: {} } as unknown as D1Result<
				Record<string, unknown>
			>)
		).toEqual([{ n: 1 }]);
		expect(() => rowsOf(undefined)).toThrow(StoredDataError);
	});
});
