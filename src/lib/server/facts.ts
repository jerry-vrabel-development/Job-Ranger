/**
 * The fact bank (design note 0004): everything true about my work. Resumes,
 * cover letters and answers will be built only from confirmed facts, so a
 * fact pasted in starts unconfirmed and waits under "To check". Like the other
 * pages, every answer is a plain sentence, and nothing here throws for a
 * person's mistake.
 */
import {
	EXPERIENCES,
	KINDS,
	ORGANIZATION_MAX,
	PASTE_MAX,
	PERIOD_MAX,
	shortText,
	TEXT_MAX,
	type Experience,
	type Kind
} from '#lib/facts.ts';
import { count, StoredDataError, text } from './db.ts';

export { EXPERIENCE_LABELS, KIND_LABELS } from '#lib/facts.ts';

export interface FactInput {
	readonly kind: Kind;
	readonly experience: Experience;
	readonly organization: string;
	readonly period: string;
	readonly text: string;
}

export interface Fact extends FactInput {
	readonly id: number;
	readonly source: 'typed' | 'pasted' | 'gap';
	readonly confirmed: boolean;
	readonly retired: boolean;
}

export type Field = 'kind' | 'experience' | 'organization' | 'period' | 'text';

export type Checked =
	| { readonly ok: true; readonly input: FactInput }
	| { readonly ok: false; readonly field: Field; readonly message: string };

const oneLine = (value: string) => value.trim().replace(/\s+/g, ' ');

function isKind(value: string): value is Kind {
	return (KINDS as readonly string[]).includes(value);
}

function isExperience(value: string): value is Experience {
	return (EXPERIENCES as readonly string[]).includes(value);
}

/** Checks one fact's fields, as typed into a form or read from a pasted line. */
export function checkFact(values: Record<Field, string>): Checked {
	const kind = values.kind.trim().toLowerCase();
	if (!isKind(kind)) {
		return {
			ok: false,
			field: 'kind',
			message: `Choose what kind of fact this is (${KINDS.join(', ')}).`
		};
	}
	const experience = values.experience
		.trim()
		.toLowerCase()
		.replace(/^hobby$/, 'side');
	if (!isExperience(experience)) {
		return {
			ok: false,
			field: 'experience',
			message: 'Choose professional, side (a side project or hobby) or learning.'
		};
	}
	const organization = oneLine(values.organization);
	if (organization.length > ORGANIZATION_MAX) {
		return {
			ok: false,
			field: 'organization',
			message: `Keep where under ${String(ORGANIZATION_MAX)} characters.`
		};
	}
	const period = oneLine(values.period);
	if (period.length > PERIOD_MAX) {
		return {
			ok: false,
			field: 'period',
			message: `Keep when under ${String(PERIOD_MAX)} characters, like “2018–2020”.`
		};
	}
	const fact = oneLine(values.text);
	if (fact === '') return { ok: false, field: 'text', message: 'Write the fact itself.' };
	if (fact.length > TEXT_MAX) {
		return {
			ok: false,
			field: 'text',
			message: `Keep a fact under ${String(TEXT_MAX)} characters; split a long one in two.`
		};
	}
	return { ok: true, input: { kind, experience, organization, period, text: fact } };
}

export type Parsed =
	| { readonly ok: true; readonly facts: readonly FactInput[] }
	| { readonly ok: false; readonly message: string };

/**
 * Facts pasted one per line: `kind | experience | where | when | the fact`.
 * Blank lines and lines starting with # are skipped. Nothing is added unless
 * every line reads, so a paste never half-lands.
 */
export function parsePaste(pasted: string): Parsed {
	const facts: FactInput[] = [];
	const problems: string[] = [];
	const lines = pasted.split(/\r?\n/);
	lines.forEach((line, index) => {
		if (line.trim() === '' || line.trim().startsWith('#')) return;
		const parts = line.split('|');
		if (parts.length < 5) {
			problems.push(`Line ${String(index + 1)} needs five parts separated by |.`);
			return;
		}
		// Five or more parts, checked just above; the fact itself may hold |.
		const [kind, experience, organization, period, ...rest] = parts as [
			string,
			string,
			string,
			string,
			...string[]
		];
		const checked = checkFact({ kind, experience, organization, period, text: rest.join('|') });
		if (checked.ok) facts.push(checked.input);
		else problems.push(`Line ${String(index + 1)}: ${checked.message}`);
	});
	if (problems.length > 0) {
		const shown = problems.slice(0, 5).join(' ');
		const more = problems.length > 5 ? ` And ${String(problems.length - 5)} more.` : '';
		return { ok: false, message: `Nothing was added. ${shown}${more}` };
	}
	if (facts.length === 0) return { ok: false, message: 'Paste at least one fact.' };
	if (facts.length > PASTE_MAX) {
		return { ok: false, message: `Paste up to ${String(PASTE_MAX)} facts at a time.` };
	}
	return { ok: true, facts };
}

type Row = Record<string, unknown>;

function factOf(row: Row): Fact {
	const kind = text(row, 'kind');
	const experience = text(row, 'experience');
	const source = text(row, 'source');
	if (!isKind(kind) || !isExperience(experience)) {
		throw new StoredDataError('fact kind or experience is not one we know');
	}
	if (source !== 'typed' && source !== 'pasted' && source !== 'gap') {
		throw new StoredDataError('fact source is not one we know');
	}
	return {
		id: count(row, 'id'),
		kind,
		experience,
		organization: text(row, 'organization'),
		period: text(row, 'period'),
		text: text(row, 'text'),
		source,
		confirmed: row['confirmed_at'] !== null,
		retired: row['retired_at'] !== null
	};
}

/** Every fact, in kind order (roles first), then by where and when it was added. */
export async function listFacts(db: D1Database): Promise<Fact[]> {
	const order = KINDS.map((kind, i) => `WHEN '${kind}' THEN ${String(i)}`).join(' ');
	const { results } = await db
		.prepare(`SELECT * FROM facts ORDER BY CASE kind ${order} END, organization, id`)
		.all<Row>();
	return results.map(factOf);
}

export interface Result {
	readonly ok: boolean;
	readonly message: string;
}

const GONE: Result = { ok: false, message: 'That fact is no longer in your bank.' };

/** Adds a fact typed in by hand: my own statement, so it is confirmed. */
export async function addFact(db: D1Database, input: FactInput): Promise<Result> {
	await db
		.prepare(
			`INSERT INTO facts (kind, experience, organization, period, text, source, confirmed_at)
			 VALUES (?1, ?2, ?3, ?4, ?5, 'typed', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
		)
		.bind(input.kind, input.experience, input.organization, input.period, input.text)
		.run();
	return { ok: true, message: `Added “${shortText(input.text)}”.` };
}

/** Adds pasted facts, unconfirmed. A fact already in the bank (same words, any case) is skipped. */
export async function pasteFacts(db: D1Database, facts: readonly FactInput[]): Promise<Result> {
	const existing = new Set(
		(await db.prepare('SELECT lower(text) AS t FROM facts').all<Row>()).results.map((row) =>
			text(row, 't')
		)
	);
	const fresh: FactInput[] = [];
	for (const fact of facts) {
		const key = fact.text.toLowerCase();
		if (existing.has(key)) continue;
		existing.add(key);
		fresh.push(fact);
	}
	if (fresh.length > 0) {
		const insert = db.prepare(
			`INSERT INTO facts (kind, experience, organization, period, text, source)
			 VALUES (?1, ?2, ?3, ?4, ?5, 'pasted')`
		);
		await db.batch(
			fresh.map((f) => insert.bind(f.kind, f.experience, f.organization, f.period, f.text))
		);
	}
	const skipped = facts.length - fresh.length;
	const added = `Added ${String(fresh.length)} ${fresh.length === 1 ? 'fact' : 'facts'} to check`;
	const already =
		skipped === 0
			? ''
			: `; ${String(skipped)} ${skipped === 1 ? 'was' : 'were'} already in your bank`;
	return { ok: true, message: `${added}${already}.` };
}

/** Saves a fact's fields. Editing doesn't confirm it; Confirm does. */
export async function updateFact(db: D1Database, id: number, input: FactInput): Promise<Result> {
	const row = await db
		.prepare(
			`UPDATE facts SET kind = ?1, experience = ?2, organization = ?3, period = ?4, text = ?5,
			 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?6 RETURNING id`
		)
		.bind(input.kind, input.experience, input.organization, input.period, input.text, id)
		.first<Row>();
	return row === null ? GONE : { ok: true, message: `Saved “${shortText(input.text)}”.` };
}

async function stamp(
	db: D1Database,
	id: number,
	set: string,
	say: (fact: string) => string
): Promise<Result> {
	const row = await db
		.prepare(
			`UPDATE facts SET ${set}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
			 WHERE id = ?1 RETURNING text`
		)
		.bind(id)
		.first<Row>();
	return row === null ? GONE : { ok: true, message: say(shortText(text(row, 'text'))) };
}

export const confirmFact = (db: D1Database, id: number) =>
	stamp(
		db,
		id,
		`confirmed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
		(fact) => `Confirmed “${fact}”.`
	);

export const retireFact = (db: D1Database, id: number) =>
	stamp(
		db,
		id,
		`retired_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
		(fact) => `Retired “${fact}”. It won't be used, and Restore brings it back.`
	);

export const restoreFact = (db: D1Database, id: number) =>
	stamp(db, id, 'retired_at = NULL', (fact) => `Restored “${fact}”.`);

export async function removeFact(db: D1Database, id: number): Promise<Result> {
	const row = await db
		.prepare('DELETE FROM facts WHERE id = ?1 RETURNING text')
		.bind(id)
		.first<Row>();
	return row === null ? GONE : { ok: true, message: `Removed “${shortText(text(row, 'text'))}”.` };
}

/** A fact id from a form, or null. */
export function parseId(value: unknown): number | null {
	if (typeof value !== 'string' || !/^[1-9][0-9]{0,15}$/.test(value)) return null;
	const id = Number(value);
	return Number.isSafeInteger(id) ? id : null;
}
