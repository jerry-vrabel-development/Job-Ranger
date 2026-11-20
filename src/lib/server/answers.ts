/**
 * The answer bank (design note 0004): ready answers to the questions most
 * forms ask. Each is tagged by question type, so the apply kit can fill it
 * in, and by how it was written, so an answer in my own words can be reused
 * where a posting forbids AI and an edited AI draft can't.
 */
import {
	LABEL_MAX,
	NOTES_MAX,
	ORIGINS,
	QUESTIONS,
	TEXT_MAX,
	type Origin,
	type Question
} from '#lib/answers.ts';
import { count, StoredDataError, text } from './db.ts';

export interface AnswerInput {
	readonly question: Question;
	readonly label: string;
	readonly text: string;
	readonly origin: Origin;
	readonly notes: string;
}

export interface Answer extends AnswerInput {
	readonly id: number;
}

export type Field = 'question' | 'label' | 'text' | 'origin' | 'notes';

export type Checked =
	| { readonly ok: true; readonly input: AnswerInput }
	| { readonly ok: false; readonly field: Field; readonly message: string };

function isQuestion(value: string): value is Question {
	return (QUESTIONS as readonly string[]).includes(value);
}

function isOrigin(value: string): value is Origin {
	return (ORIGINS as readonly string[]).includes(value);
}

/** Tidies an answer's text: line breaks kept (answers have paragraphs), ends trimmed. */
function tidy(value: string): string {
	return value
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((line) => line.trimEnd())
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

export function checkAnswer(values: Record<Field, string>): Checked {
	const question = values.question.trim();
	if (!isQuestion(question)) {
		return { ok: false, field: 'question', message: 'Choose which question this answers.' };
	}
	const label = values.label.trim().replace(/\s+/g, ' ');
	if (label.length > LABEL_MAX) {
		return {
			ok: false,
			field: 'label',
			message: `Keep the name under ${String(LABEL_MAX)} characters, like “150 words”.`
		};
	}
	const answer = tidy(values.text);
	if (answer === '') return { ok: false, field: 'text', message: 'Write the answer itself.' };
	if (answer.length > TEXT_MAX) {
		return {
			ok: false,
			field: 'text',
			message: `Keep an answer under ${String(TEXT_MAX)} characters.`
		};
	}
	const origin = values.origin.trim();
	if (!isOrigin(origin)) {
		return { ok: false, field: 'origin', message: 'Say how this answer was written.' };
	}
	const notes = tidy(values.notes);
	if (notes.length > NOTES_MAX) {
		return {
			ok: false,
			field: 'notes',
			message: `Keep notes under ${String(NOTES_MAX)} characters.`
		};
	}
	return { ok: true, input: { question, label, text: answer, origin, notes } };
}

type Row = Record<string, unknown>;

function answerOf(row: Row): Answer {
	const question = text(row, 'question');
	const origin = text(row, 'origin');
	if (!isQuestion(question) || !isOrigin(origin)) {
		throw new StoredDataError('answer question or origin is not one we know');
	}
	return {
		id: count(row, 'id'),
		question,
		label: text(row, 'label'),
		text: text(row, 'text'),
		origin,
		notes: text(row, 'notes')
	};
}

/** Every answer, in question order, oldest first within a question. */
export async function listAnswers(db: D1Database): Promise<Answer[]> {
	const order = QUESTIONS.map((q, i) => `WHEN '${q}' THEN ${String(i)}`).join(' ');
	const { results } = await db
		.prepare(`SELECT * FROM answers ORDER BY CASE question ${order} END, id`)
		.all<Row>();
	return results.map(answerOf);
}

export interface Result {
	readonly ok: boolean;
	readonly message: string;
}

const GONE: Result = { ok: false, message: 'That answer is no longer in your bank.' };

export async function addAnswer(db: D1Database, input: AnswerInput): Promise<Result> {
	await db
		.prepare(
			'INSERT INTO answers (question, label, text, origin, notes) VALUES (?1, ?2, ?3, ?4, ?5)'
		)
		.bind(input.question, input.label, input.text, input.origin, input.notes)
		.run();
	return { ok: true, message: 'Saved your answer.' };
}

export async function updateAnswer(
	db: D1Database,
	id: number,
	input: AnswerInput
): Promise<Result> {
	const row = await db
		.prepare(
			`UPDATE answers SET question = ?1, label = ?2, text = ?3, origin = ?4, notes = ?5,
			 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?6 RETURNING id`
		)
		.bind(input.question, input.label, input.text, input.origin, input.notes, id)
		.first<Row>();
	return row === null ? GONE : { ok: true, message: 'Saved your changes.' };
}

export async function removeAnswer(db: D1Database, id: number): Promise<Result> {
	const row = await db
		.prepare('DELETE FROM answers WHERE id = ?1 RETURNING id')
		.bind(id)
		.first<Row>();
	return row === null ? GONE : { ok: true, message: 'Removed the answer.' };
}

export { parseId } from './db.ts';
