import { beforeEach, describe, expect, it } from 'vitest';
import { StoredDataError } from './db.ts';
import { addAnswer, listAnswers, removeAnswer, updateAnswer, type AnswerInput } from './answers.ts';
import { migratedDb } from './test-db.ts';

const authorization: AnswerInput = {
	question: 'work_authorization',
	label: '',
	text: 'Yes. I am a US citizen and need no sponsorship.',
	origin: 'own',
	notes: ''
};
const story: AnswerInput = {
	question: 'about_me',
	label: '150 words',
	text: 'I started in tech as a recruiter.\n\nThen I learned to build.',
	origin: 'together',
	notes: 'From voice notes, Nov 20.'
};

let db: D1Database;

beforeEach(async () => {
	db = await migratedDb();
	await db.prepare('DELETE FROM answers').run();
});

describe('the answer bank', () => {
	it('saves answers and lists them in the order forms ask, paragraphs kept', async () => {
		expect(await addAnswer(db, story)).toEqual({ ok: true, message: 'Saved your answer.' });
		await addAnswer(db, authorization);
		await addAnswer(db, { ...story, label: '50 words', text: 'Recruiter turned builder.' });
		const answers = await listAnswers(db);
		expect(answers.map((a) => [a.question, a.label])).toEqual([
			['work_authorization', ''],
			['about_me', '150 words'],
			['about_me', '50 words']
		]);
		expect(answers[1]).toMatchObject(story);
	});

	it('saves an edit and removes an answer', async () => {
		await addAnswer(db, authorization);
		const [saved] = await listAnswers(db);
		if (!saved) throw new Error('no answer');
		expect(await updateAnswer(db, saved.id, { ...authorization, origin: 'ai_edited' })).toEqual({
			ok: true,
			message: 'Saved your changes.'
		});
		expect((await listAnswers(db))[0]?.origin).toBe('ai_edited');
		expect(await removeAnswer(db, saved.id)).toEqual({ ok: true, message: 'Removed the answer.' });
		expect(await listAnswers(db)).toEqual([]);
	});

	it('says when the answer is gone', async () => {
		const gone = { ok: false, message: 'That answer is no longer in your bank.' };
		expect(await updateAnswer(db, 999, authorization)).toEqual(gone);
		expect(await removeAnswer(db, 999)).toEqual(gone);
	});

	it('fails loudly on a stored question or origin it does not know', async () => {
		await addAnswer(db, authorization);
		await db.prepare('PRAGMA ignore_check_constraints = ON').run();
		for (const change of ["question = 'colour'", "origin = 'magic'"]) {
			await db.prepare(`UPDATE answers SET ${change}`).run();
			await expect(listAnswers(db)).rejects.toThrow(StoredDataError);
			await db.prepare("UPDATE answers SET question = 'pay', origin = 'own'").run();
		}
		await db.prepare('PRAGMA ignore_check_constraints = OFF').run();
		expect(await listAnswers(db)).toHaveLength(1);
	});
});
