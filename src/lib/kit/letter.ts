/**
 * Cover letter drafts (design note 0004, step 4). The model writes; code
 * checks. Every sentence must name the facts it uses, and the checks here
 * flag anything that isn't backed by them. The greeting and my name are
 * added by code, so my name and contact details never go to the model.
 */
import { wordCount } from '#lib/answers.ts';
import type { Question } from '#lib/answers.ts';
import type { Experience, Kind } from '#lib/facts.ts';

export type LetterKind = 'letter_full' | 'letter_short';
/** What a draft is for: a letter of either length, one answer, or the resume's summary. */
export type DraftKind = LetterKind | 'answer' | 'summary';

/**
 * Question types facts can answer. Work authorization, start date,
 * location, pay and "how did you hear" are about my situation, not my
 * experience, so no model guesses at them.
 */
export const DRAFTABLE: readonly Question[] = [
	'about_me',
	'why_company',
	'why_role',
	'strengths',
	'challenge',
	'mistake',
	'leadership',
	'ai_use',
	'other'
];

/** True when a question (of this type, or unmatched) may be drafted from facts. */
export function draftable(type: Question | null): boolean {
	return type === null || DRAFTABLE.includes(type);
}

export interface Sentence {
	readonly text: string;
	/** Ids of the facts the sentence uses; empty only for framing (opening, closing). */
	readonly facts: readonly number[];
}

export type Paragraph = readonly Sentence[];

export interface LetterFact {
	readonly id: number;
	readonly kind: Kind;
	readonly experience: Experience;
	readonly organization: string;
	readonly period: string;
	readonly text: string;
}

export interface LetterJob {
	readonly title: string;
	readonly company: string;
	readonly department: string | null;
	readonly postingText: string;
}

export const LIMITS: Readonly<Record<DraftKind, { words: number; framing: number }>> = {
	letter_full: { words: 450, framing: 3 },
	letter_short: { words: 170, framing: 2 },
	answer: { words: 200, framing: 1 },
	// A summary is all claims: every sentence names its facts.
	summary: { words: 80, framing: 0 }
};

export const TOOL_NAME = 'write_letter';

/** The shape the model must fill: paragraphs of sentences, each naming its facts. */
export const LETTER_TOOL = {
	name: TOOL_NAME,
	description:
		'Return the cover letter as paragraphs of sentences, each listing the fact ids it uses.',
	input_schema: {
		type: 'object',
		properties: {
			paragraphs: {
				type: 'array',
				items: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							text: { type: 'string' },
							facts: { type: 'array', items: { type: 'integer' } }
						},
						required: ['text', 'facts']
					}
				}
			}
		},
		required: ['paragraphs']
	}
} as const;

export function systemPrompt(kind: LetterKind): string {
	const length =
		kind === 'letter_full'
			? 'Write 3 or 4 paragraphs, 250 to 400 words in all.'
			: 'Write 2 or 3 short paragraphs, under 150 words in all.';
	return [
		'You draft a cover letter for one job, for the person whose facts you are given.',
		'Use only the facts given. Every sentence must list, in `facts`, the ids of the facts it uses.',
		'A sentence may cite no facts only if it just frames the letter (naming the role, or closing); such a sentence makes no claims and has no numbers. Use at most two of them.',
		'Never add a skill, number, year, job title, employer or result that isn’t in the facts a sentence cites.',
		'Facts whose experience is "side" are side projects or hobbies, and "learning" ones are being learned now. Never present them as professional work or as years of experience.',
		'Write in the first person, plainly and specifically, like a person, not a brochure. Avoid “passionate”, “leverage”, “synergy”, “thrilled”, “excited to apply” and similar filler.',
		'Connect the facts to what this job asks for, using the posting when it is given.',
		'Do not write a greeting or a signature; they are added separately.',
		length,
		`Answer only by calling the ${TOOL_NAME} tool.`
	].join('\n');
}

export function answerSystemPrompt(): string {
	return [
		'You draft an answer to one question on a job application, for the person whose facts you are given.',
		'Use only the facts given. Every sentence must list, in `facts`, the ids of the facts it uses.',
		'At most one sentence may cite no facts, and only to frame the answer; it makes no claims and has no numbers.',
		'Never add a skill, number, year, job title, employer or result that isn’t in the facts a sentence cites.',
		'Facts whose experience is "side" are side projects or hobbies, and "learning" ones are being learned now. Never present them as professional work or as years of experience.',
		'Answer the question asked, directly, in the first person, plainly and specifically. Avoid filler like “passionate” or “leverage”.',
		'Write one or two short paragraphs, 50 to 150 words in all.',
		`Answer only by calling the ${TOOL_NAME} tool.`
	].join('\n');
}

export function summarySystemPrompt(): string {
	return [
		'You draft the summary at the top of a resume for one job, for the person whose facts you are given.',
		'Use only the facts given. Every sentence must list, in `facts`, the ids of the facts it uses. No sentence may cite no facts.',
		'Never add a skill, number, year, job title, employer or result that isn’t in the facts a sentence cites.',
		'Facts whose experience is "side" are side projects or hobbies, and "learning" ones are being learned now. Never present them as professional work or as years of experience.',
		'Lead with what fits this job best, using the posting when it is given.',
		'Write in resume style, without “I” and without naming the company you are applying to. Be plain and specific. Avoid “passionate”, “results-driven”, “leverage”, “synergy”, “seasoned” and similar filler.',
		'Write one paragraph of 2 or 3 sentences, 40 to 70 words in all.',
		`Answer only by calling the ${TOOL_NAME} tool.`
	].join('\n');
}

/** The job and the facts (and the question, for an answer), as the model sees them. No name or contact details. */
export function userPrompt(
	job: LetterJob,
	facts: readonly LetterFact[],
	question?: string
): string {
	return JSON.stringify({
		...(question === undefined ? {} : { question }),
		job: {
			title: job.title,
			company: job.company,
			team: job.department,
			posting: job.postingText.slice(0, 8000)
		},
		facts: facts.map(({ id, kind, experience, organization, period, text }) => ({
			id,
			kind,
			experience,
			where: organization,
			when: period,
			text
		}))
	});
}

/** The model's tool input as a letter, or null if it isn't the shape asked for. */
export function parseLetter(input: unknown): Paragraph[] | null {
	if (typeof input !== 'object' || input === null) return null;
	const paragraphs = (input as { paragraphs?: unknown }).paragraphs;
	if (!Array.isArray(paragraphs) || paragraphs.length === 0) return null;
	const letter: Paragraph[] = [];
	for (const paragraph of paragraphs) {
		if (!Array.isArray(paragraph) || paragraph.length === 0) return null;
		const sentences: Sentence[] = [];
		for (const sentence of paragraph) {
			if (typeof sentence !== 'object' || sentence === null) return null;
			const { text, facts } = sentence as { text?: unknown; facts?: unknown };
			if (typeof text !== 'string' || text.trim() === '') return null;
			if (!Array.isArray(facts) || !facts.every((id) => Number.isSafeInteger(id))) return null;
			sentences.push({
				text: text.trim().replace(/\s+/g, ' '),
				facts: [...new Set(facts as number[])]
			});
		}
		letter.push(sentences);
	}
	return letter;
}

export interface Problem {
	/** Paragraph and sentence numbers, from 0; -1 for the letter as a whole. */
	readonly paragraph: number;
	readonly sentence: number;
	readonly problem: string;
}

const NUMBER = /\d[\d,.]*\+?%?/g;
const PROFESSIONAL_WORDS =
	/\bprofessional(?:ly)?\b|\byears? of (?:experience|professional)\b|\bin production for clients\b|\bmy (?:day )?job\b|\bat work\b/i;

const normalizeNumber = (n: string) => n.replace(/[,]/g, '').replace(/\.$/, '');

/**
 * Code checks on a draft: every claim backed by a confirmed fact it cites,
 * numbers copied from those facts, the right company, side and learning facts
 * not dressed up as professional work, and the length.
 */
export function checkLetter(
	kind: DraftKind,
	letter: readonly Paragraph[],
	facts: readonly LetterFact[],
	job: LetterJob,
	otherCompanies: readonly string[],
	/** Letters must name the company; an answer only when it's asked why this company; a summary never. */
	needsCompany = kind === 'letter_full' || kind === 'letter_short'
): Problem[] {
	const byId = new Map(facts.map((fact) => [fact.id, fact]));
	const problems: Problem[] = [];
	let framing = 0;
	const lower = (s: string) => s.toLowerCase();
	const others = otherCompanies.filter(
		(company) => company.trim() !== '' && lower(company) !== lower(job.company)
	);

	letter.forEach((paragraph, p) => {
		paragraph.forEach((sentence, s) => {
			const flag = (problem: string) => problems.push({ paragraph: p, sentence: s, problem });
			const cited = sentence.facts.map((id) => byId.get(id));
			if (cited.some((fact) => fact === undefined)) {
				flag('Cites a fact that isn’t one of your confirmed facts.');
			}
			const known = cited.filter((fact): fact is LetterFact => fact !== undefined);
			const numbers = sentence.text.match(NUMBER) ?? [];
			if (sentence.facts.length === 0) {
				framing += 1;
				if (numbers.length > 0) flag('Has a number but cites no fact.');
				else if (framing > LIMITS[kind].framing) flag('Makes a claim without citing a fact.');
			} else {
				const source = known.map((fact) => `${fact.text} ${fact.period}`).join(' ');
				const sourceNumbers = new Set((source.match(NUMBER) ?? []).map(normalizeNumber));
				for (const number of numbers) {
					if (!sourceNumbers.has(normalizeNumber(number))) {
						flag(`The number ${number} isn’t in the facts it cites.`);
					}
				}
			}
			if (
				known.length > 0 &&
				known.every((fact) => fact.experience !== 'professional') &&
				PROFESSIONAL_WORDS.test(sentence.text)
			) {
				flag('Words a side project or something you’re learning as professional work.');
			}
			for (const company of others) {
				if (
					new RegExp(`\\b${company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(
						sentence.text
					)
				) {
					const citesIt = known.some(
						(fact) =>
							lower(fact.organization) === lower(company) ||
							lower(fact.text).includes(lower(company))
					);
					if (!citesIt) flag(`Names ${company}, another company on your list, not ${job.company}.`);
				}
			}
		});
	});

	const whole = letter
		.flat()
		.map((sentence) => sentence.text)
		.join(' ');
	if (needsCompany && !lower(whole).includes(lower(job.company))) {
		problems.push({ paragraph: -1, sentence: -1, problem: `Never names ${job.company}.` });
	}
	const words = wordCount(whole);
	if (words > LIMITS[kind].words) {
		problems.push({
			paragraph: -1,
			sentence: -1,
			problem: `${String(words)} words, over the ${String(LIMITS[kind].words)} this length allows.`
		});
	}
	return problems;
}

/** A draft's text, paragraphs kept, with no greeting, markers or name. */
export function plainText(letter: readonly Paragraph[]): string {
	return letter.map((paragraph) => paragraph.map((s) => s.text).join(' ')).join('\n\n');
}

/** The letter as plain text to paste: greeting and name added by code. */
export function letterText(letter: readonly Paragraph[], name: string): string {
	return `Dear hiring team,\n\n${plainText(letter)}\n\nSincerely,\n${name === '' ? '[Your name]' : name}`;
}
