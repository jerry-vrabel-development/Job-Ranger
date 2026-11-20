import { beforeEach, describe, expect, it } from 'vitest';
import { StoredDataError } from './db.ts';
import {
	addFact,
	addGapFact,
	confirmFact,
	listFacts,
	pasteFacts,
	removeFact,
	restoreFact,
	retireFact,
	updateFact,
	type FactInput
} from './facts.ts';
import { migratedDb } from './test-db.ts';

const himss: FactInput = {
	kind: 'accomplishment',
	experience: 'professional',
	organization: 'HIMSS',
	period: '2018–2020',
	text: 'Led engineering for the enterprise digital platform.'
};
const role: FactInput = {
	kind: 'role',
	experience: 'professional',
	organization: 'HIMSS',
	period: '2018–2020',
	text: 'Lead Engineer, Enterprise Digital Platforms'
};
const svelte: FactInput = {
	kind: 'skill',
	experience: 'side',
	organization: 'Job Ranger',
	period: '2026',
	text: 'Svelte 5 and SvelteKit'
};

let db: D1Database;

beforeEach(async () => {
	db = await migratedDb();
	await db.prepare('DELETE FROM facts').run();
});

const only = async () => {
	const [fact] = await listFacts(db);
	if (!fact) throw new Error('no fact');
	return fact;
};

describe('adding facts', () => {
	it('confirms a fact typed in by hand', async () => {
		expect(await addFact(db, himss)).toEqual({
			ok: true,
			message: 'Added “Led engineering for the enterprise digital platform.”.'
		});
		expect(await only()).toMatchObject({
			...himss,
			source: 'typed',
			confirmed: true,
			retired: false
		});
	});

	it('leaves pasted facts unconfirmed, and skips ones already in the bank', async () => {
		await addFact(db, himss);
		expect(
			await pasteFacts(db, [
				{ ...himss, text: himss.text.toUpperCase() },
				role,
				svelte,
				{ ...svelte, organization: 'Elsewhere' }
			])
		).toEqual({
			ok: true,
			message: 'Added 2 facts to check; 2 were already in your bank.'
		});
		const facts = await listFacts(db);
		expect(facts.map((fact) => [fact.kind, fact.source, fact.confirmed])).toEqual([
			['role', 'pasted', false],
			['accomplishment', 'typed', true],
			['skill', 'pasted', false]
		]);
	});

	it('words one fact, and nothing new, in the singular', async () => {
		expect((await pasteFacts(db, [role])).message).toBe('Added 1 fact to check.');
		expect((await pasteFacts(db, [role])).message).toBe(
			'Added 0 facts to check; 1 was already in your bank.'
		);
	});
});

describe('changing facts', () => {
	beforeEach(async () => {
		await pasteFacts(db, [himss]);
	});

	it('saves an edit without confirming it', async () => {
		const { id } = await only();
		expect(await updateFact(db, id, { ...himss, period: 'Oct 2018–Jan 2020' })).toEqual({
			ok: true,
			message: 'Saved “Led engineering for the enterprise digital platform.”.'
		});
		expect(await only()).toMatchObject({ period: 'Oct 2018–Jan 2020', confirmed: false });
	});

	it('confirms, retires and restores, saying which fact', async () => {
		const { id } = await only();
		expect((await confirmFact(db, id)).message).toMatch(/^Confirmed “Led engineering/);
		expect(await only()).toMatchObject({ confirmed: true, retired: false });
		expect((await retireFact(db, id)).message).toMatch(/^Retired “.*Restore brings it back\.$/);
		expect(await only()).toMatchObject({ confirmed: true, retired: true });
		expect((await restoreFact(db, id)).message).toMatch(/^Restored “/);
		expect(await only()).toMatchObject({ retired: false });
	});

	it('removes a fact for good', async () => {
		const { id } = await only();
		expect((await removeFact(db, id)).message).toMatch(/^Removed “Led engineering/);
		expect(await listFacts(db)).toEqual([]);
	});

	it('says when the fact is gone', async () => {
		const gone = { ok: false, message: 'That fact is no longer in your bank.' };
		expect(await updateFact(db, 999, himss)).toEqual(gone);
		expect(await confirmFact(db, 999)).toEqual(gone);
		expect(await retireFact(db, 999)).toEqual(gone);
		expect(await restoreFact(db, 999)).toEqual(gone);
		expect(await removeFact(db, 999)).toEqual(gone);
	});
});

describe('reading facts', () => {
	it('fails loudly on a stored kind, experience or source it does not know', async () => {
		await addFact(db, himss);
		await db.prepare('PRAGMA ignore_check_constraints = ON').run();
		for (const change of ["kind = 'job'", "experience = 'expert'", "source = 'magic'"]) {
			await db.prepare(`UPDATE facts SET ${change}`).run();
			await expect(listFacts(db)).rejects.toThrow(StoredDataError);
			await db
				.prepare(
					"UPDATE facts SET kind = 'accomplishment', experience = 'professional', source = 'typed'"
				)
				.run();
		}
		await db.prepare('PRAGMA ignore_check_constraints = OFF').run();
		expect(await listFacts(db)).toHaveLength(1);
	});
});

describe('gap answers', () => {
	it('adds a confirmed skill from a gap question, labeled as I said', async () => {
		expect(await addGapFact(db, 'Kubernetes', 'learning')).toEqual({
			ok: true,
			message: 'Added Kubernetes to your facts (learning now). Add where and when on Facts.'
		});
		expect((await addGapFact(db, 'Go', 'side')).message).toMatch(/\(side project or hobby\)/);
		expect((await addGapFact(db, 'Rust', 'professional')).message).toMatch(/\(professional\)/);
		expect(await only()).toMatchObject({
			kind: 'skill',
			text: 'Kubernetes',
			experience: 'learning',
			source: 'gap',
			confirmed: true
		});
	});
});
