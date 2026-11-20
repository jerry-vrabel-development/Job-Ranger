/**
 * Interests (design note 0003): what the job search is about, in your own
 * words. Each has a name, an optional note, keywords, and the companies
 * tagged with it. Like the Companies page, every answer is a plain sentence,
 * and nothing here throws for a person's mistake.
 */
import { isSource, type Source } from '#lib/jobs/posting.ts';
import { isToken } from '#lib/sources/board-link.ts';
import { count, rowsOf, StoredDataError, text } from './db.ts';

export const NAME_MAX = 60;
export const NOTE_MAX = 300;
export const KEYWORD_MAX = 40;
export const KEYWORDS_MAX = 20;

/** A keyword: letters, digits, spaces and a few joiners (c++, c#, .net, e-bike). */
const KEYWORD = /^\.?[\p{L}\p{N}][\p{L}\p{N} +#.&'-]*$/u;

export interface Interest {
	readonly id: number;
	readonly name: string;
	readonly note: string;
	readonly keywords: readonly string[];
	readonly paused: boolean;
	/** Tagged companies, by board key ("greenhouse:splice"), with their names. */
	readonly companies: readonly { readonly key: string; readonly company: string }[];
}

export interface InterestInput {
	readonly name: string;
	readonly note: string;
	readonly keywords: readonly string[];
}

export type Field = 'name' | 'note' | 'keywords';

export type Checked =
	| { readonly ok: true; readonly input: InterestInput }
	| { readonly ok: false; readonly field: Field; readonly message: string };

/** Keywords from a comma-separated box: trimmed, lowercased, de-duplicated. */
export function parseKeywords(
	text: string
): { ok: true; keywords: string[] } | { ok: false; message: string } {
	const keywords: string[] = [];
	for (const raw of text.split(/[,\n]/)) {
		const keyword = raw.trim().replace(/\s+/g, ' ').toLowerCase();
		if (keyword === '' || keywords.includes(keyword)) continue;
		if (keyword.length > KEYWORD_MAX) {
			return {
				ok: false,
				message: `Keep each keyword under ${String(KEYWORD_MAX)} characters ("${keyword.slice(0, 20)}…" is longer).`
			};
		}
		if (!KEYWORD.test(keyword)) {
			return {
				ok: false,
				message: `"${keyword}" can't be a keyword. Use letters, digits and spaces (c++, c#, .net and e-bike are fine).`
			};
		}
		keywords.push(keyword);
	}
	if (keywords.length > KEYWORDS_MAX) {
		return { ok: false, message: `Use up to ${String(KEYWORDS_MAX)} keywords.` };
	}
	return { ok: true, keywords };
}

/** Checks what was typed into an interest form. */
export function checkInput(name: string, note: string, keywords: string): Checked {
	const cleanName = name.trim().replace(/\s+/g, ' ');
	if (cleanName === '') return { ok: false, field: 'name', message: 'Give the interest a name.' };
	if (cleanName.length > NAME_MAX) {
		return {
			ok: false,
			field: 'name',
			message: `Keep the name under ${String(NAME_MAX)} characters.`
		};
	}
	const cleanNote = note.trim().replace(/\s+/g, ' ');
	if (cleanNote.length > NOTE_MAX) {
		return {
			ok: false,
			field: 'note',
			message: `Keep the note under ${String(NOTE_MAX)} characters.`
		};
	}
	const parsed = parseKeywords(keywords);
	if (!parsed.ok) return { ok: false, field: 'keywords', message: parsed.message };
	return { ok: true, input: { name: cleanName, note: cleanNote, keywords: parsed.keywords } };
}

type Row = Record<string, unknown>;

function keywordsOf(value: string): string[] {
	const parsed: unknown = JSON.parse(value);
	if (!Array.isArray(parsed) || !parsed.every((word) => typeof word === 'string')) {
		throw new StoredDataError('keywords is not a list of words');
	}
	return parsed;
}

/** Every interest, by name, with its tagged companies (paused companies included). */
export async function listInterests(db: D1Database): Promise<Interest[]> {
	const [interests, tags] = await db.batch<Row>([
		db.prepare('SELECT id, name, note, keywords, paused FROM interests ORDER BY name'),
		db.prepare(
			`SELECT t.interest_id, t.source, t.board, b.company
			 FROM board_interests t JOIN boards b ON b.source = t.source AND b.token = t.board
			 ORDER BY b.company`
		)
	]);
	const byInterest = new Map<number, { key: string; company: string }[]>();
	for (const tag of rowsOf(tags)) {
		const id = count(tag, 'interest_id');
		const list = byInterest.get(id) ?? [];
		list.push({
			key: `${String(tag['source'])}:${String(tag['board'])}`,
			company: String(tag['company'])
		});
		byInterest.set(id, list);
	}
	return rowsOf(interests).map((row) => {
		const id = count(row, 'id');
		return {
			id,
			name: text(row, 'name'),
			note: text(row, 'note'),
			keywords: keywordsOf(text(row, 'keywords')),
			paused: row['paused'] === 1,
			companies: byInterest.get(id) ?? []
		};
	});
}

export interface Result {
	readonly ok: boolean;
	readonly message: string;
}

const GONE: Result = { ok: false, message: 'That interest is no longer on your list.' };

function isNameTaken(error: unknown): boolean {
	return error instanceof Error && /UNIQUE/i.test(error.message);
}

export async function createInterest(db: D1Database, input: InterestInput): Promise<Result> {
	try {
		await db
			.prepare('INSERT INTO interests (name, note, keywords) VALUES (?1, ?2, ?3)')
			.bind(input.name, input.note, JSON.stringify(input.keywords))
			.run();
	} catch (error) {
		if (isNameTaken(error)) {
			return { ok: false, message: `You already have an interest called ${input.name}.` };
		}
		throw error;
	}
	return {
		ok: true,
		message: `Added ${input.name}. Tag companies with it from its Edit form.`
	};
}

/** A board key from a form ("greenhouse:splice"), or null if it isn't one. */
export function parseBoardKey(value: unknown): { source: Source; token: string } | null {
	if (typeof value !== 'string') return null;
	const colon = value.indexOf(':');
	const source = value.slice(0, colon);
	const token = value.slice(colon + 1);
	if (colon === -1 || !isSource(source) || !isToken(token, source)) return null;
	return { source, token };
}

/**
 * Saves an interest's name, note and keywords, and replaces its company tags
 * with `boards`, in one transaction. Board keys for companies that aren't on
 * the list are ignored.
 */
export async function updateInterest(
	db: D1Database,
	id: number,
	input: InterestInput,
	boards: readonly { source: Source; token: string }[]
): Promise<Result> {
	const tag = db.prepare(
		`INSERT INTO board_interests (source, board, interest_id)
		 SELECT source, token, ?3 FROM boards WHERE source = ?1 AND token = ?2
		 ON CONFLICT DO NOTHING`
	);
	let updated;
	try {
		[updated] = await db.batch<Row>([
			db
				.prepare(
					`UPDATE interests SET name = ?1, note = ?2, keywords = ?3,
					 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?4 RETURNING id`
				)
				.bind(input.name, input.note, JSON.stringify(input.keywords), id),
			db.prepare('DELETE FROM board_interests WHERE interest_id = ?1').bind(id),
			...boards.map((board) => tag.bind(board.source, board.token, id))
		]);
	} catch (error) {
		if (isNameTaken(error)) {
			return { ok: false, message: `You already have an interest called ${input.name}.` };
		}
		throw error;
	}
	if (rowsOf(updated).length === 0) return GONE;
	return { ok: true, message: `Saved ${input.name}.` };
}

export async function setInterestPaused(
	db: D1Database,
	id: number,
	paused: boolean
): Promise<Result> {
	const row = await db
		.prepare('UPDATE interests SET paused = ?1 WHERE id = ?2 RETURNING name')
		.bind(paused ? 1 : 0, id)
		.first<Row>();
	if (row === null) return GONE;
	const name = String(row['name']);
	return paused
		? { ok: true, message: `Paused ${name}. It's hidden from the Jobs filters; its tags are kept.` }
		: { ok: true, message: `Resumed ${name}.` };
}

export async function removeInterest(db: D1Database, id: number): Promise<Result> {
	const [tagged, removed] = await db.batch<Row>([
		db.prepare('SELECT COUNT(*) AS n FROM board_interests WHERE interest_id = ?1').bind(id),
		db.prepare('DELETE FROM interests WHERE id = ?1 RETURNING name').bind(id)
	]);
	const row = rowsOf(removed)[0];
	if (row === undefined) return GONE;
	const n = count(rowsOf(tagged)[0], 'n');
	return {
		ok: true,
		message: `Removed ${String(row['name'])}. ${String(n)} ${n === 1 ? 'company was' : 'companies were'} tagged with it; the companies and their jobs stay.`
	};
}

export { parseId } from './db.ts';
