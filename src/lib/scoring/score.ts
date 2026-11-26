/**
 * Scoring a job for fit (design note 0008). Plain functions: the prompt the
 * model sees, the shape it must answer in, and the code checks that decide
 * what reaches the page. The model's answer is a draft; a reason that can't
 * be traced to a confirmed fact, an interest, a preference or the posting's
 * own words is dropped, and a job with no reason left stays unscored.
 */
import type { LetterFact } from '#lib/kit/letter.ts';
import { gradeLevel } from './readability.ts';

/** Changes whenever the prompt or schema changes; scores and eval runs are kept per version. */
export const PROMPT_VERSION = '2026-11-26.1';

/** How much of the posting the model sees; the prompt says when it was cut. */
export const POSTING_MAX = 6000;

export type Score = 1 | 2 | 3 | 4 | 5;

export const SCORE_WORDS: Readonly<Record<Score, string>> = {
	5: 'Strong fit',
	4: 'Good fit',
	3: 'Maybe',
	2: 'Weak fit',
	1: 'Not a fit'
};

export const PREFERENCES = ['where', 'level', 'pay', 'looking_for'] as const;
export type Preference = (typeof PREFERENCES)[number];

export interface ScoringJob {
	readonly title: string;
	readonly company: string;
	readonly location: string;
	readonly workplace: string;
	readonly department: string | null;
	readonly postingText: string;
}

export interface ScoringInterest {
	readonly id: number;
	readonly name: string;
	readonly note: string;
	readonly keywords: readonly string[];
}

/** What the model is told about me: confirmed facts only, never contact details. */
export interface Profile {
	readonly facts: readonly LetterFact[];
	readonly interests: readonly ScoringInterest[];
	/** Only the preferences I've set; an empty string never reaches the model. */
	readonly preferences: Readonly<Partial<Record<Preference, string>>>;
}

export type Cite =
	| { readonly fact: number }
	| { readonly interest: number }
	| { readonly preference: Preference }
	| { readonly quote: string };

export interface Reason {
	readonly direction: 'for' | 'against';
	readonly text: string;
	readonly cites: readonly Cite[];
}

export interface Answer {
	readonly score: Score;
	readonly summary: string;
	readonly reasons: readonly Reason[];
}

export const TOOL_NAME = 'score_job';

const CITE_SCHEMA = {
	type: 'object',
	description: 'Exactly one of: a fact id, an interest id, a preference name, or a quote.',
	properties: {
		fact: { type: 'integer' },
		interest: { type: 'integer' },
		preference: { type: 'string', enum: [...PREFERENCES] },
		quote: { type: 'string', description: 'Words copied exactly from the posting.' }
	}
} as const;

/** The shape the model must fill. */
export const SCORE_TOOL = {
	name: TOOL_NAME,
	description: 'Score how well one job fits the person, with cited reasons.',
	schema: {
		type: 'object',
		properties: {
			score: { type: 'integer', minimum: 1, maximum: 5 },
			summary: { type: 'string' },
			reasons: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						direction: { type: 'string', enum: ['for', 'against'] },
						text: { type: 'string' },
						cites: { type: 'array', items: CITE_SCHEMA }
					},
					required: ['direction', 'text', 'cites']
				}
			}
		},
		required: ['score', 'summary', 'reasons']
	}
} as const;

export function systemPrompt(): string {
	return [
		'You judge how well one job fits one person, from the facts about them that you are given.',
		'Score from 1 to 5: 5 strong fit (they could do this job well and it matches what they want), 4 good fit, 3 maybe (a real mix, or the posting is unclear), 2 weak fit, 1 not a fit.',
		'Fit means worth their time to read and apply, not whether they would be hired.',
		'Give 2 to 6 reasons, for and against. Every reason must cite what it rests on: a fact id, an interest id, a preference name, or words copied exactly from the posting (a quote of at least two words).',
		'Use only what you are given. Never invent a fact, skill, year or employer.',
		'Facts whose experience is "side" are side projects or hobbies, and "learning" ones are being learned now. Weigh them as such, not as professional experience.',
		'Tell required skills apart from nice-to-have ones; a nice-to-have the person lacks is a small reason against at most.',
		'A preference the person has not set is not a factor.',
		'Write the summary as one plain sentence, and each reason as one short plain sentence, easy to read on a tired day. No filler.',
		`Answer only by calling the ${TOOL_NAME} tool.`
	].join('\n');
}

/** The job and my profile, as the model sees them. */
export function userPrompt(job: ScoringJob, profile: Profile): string {
	const cut = job.postingText.length > POSTING_MAX;
	return JSON.stringify({
		job: {
			title: job.title,
			company: job.company,
			location: job.location,
			workplace: job.workplace,
			team: job.department,
			posting: job.postingText.slice(0, POSTING_MAX),
			...(cut ? { note: `The posting was cut at ${String(POSTING_MAX)} characters.` } : {})
		},
		facts: profile.facts.map(({ id, kind, experience, organization, period, text }) => ({
			id,
			kind,
			experience,
			where: organization,
			when: period,
			text
		})),
		interests: profile.interests.map(({ id, name, note, keywords }) => ({
			id,
			name,
			note,
			keywords
		})),
		preferences: profile.preferences
	});
}

function parseCite(input: unknown): Cite | null {
	if (typeof input !== 'object' || input === null) return null;
	const entries = Object.entries(input).filter(
		([, value]) => value !== undefined && value !== null
	);
	if (entries.length !== 1) return null;
	const [key, value] = entries[0] as [string, unknown];
	if ((key === 'fact' || key === 'interest') && Number.isSafeInteger(value)) {
		return key === 'fact' ? { fact: value as number } : { interest: value as number };
	}
	if (key === 'preference' && PREFERENCES.includes(value as Preference)) {
		return { preference: value as Preference };
	}
	if (key === 'quote' && typeof value === 'string' && value.trim() !== '') {
		return { quote: value.trim() };
	}
	return null;
}

/**
 * The model's tool input as an answer, or null if it isn't the shape asked
 * for. A citation that isn't one of the four kinds is kept as null, so the
 * check can say it was dropped rather than the parse failing the whole answer.
 */
export interface ParsedReason extends Omit<Reason, 'cites'> {
	readonly cites: readonly (Cite | null)[];
}

export function parseAnswer(
	input: unknown
): (Omit<Answer, 'reasons'> & { readonly reasons: readonly ParsedReason[] }) | null {
	if (typeof input !== 'object' || input === null) return null;
	const { score, summary, reasons } = input as Record<string, unknown>;
	if (!Number.isInteger(score) || (score as number) < 1 || (score as number) > 5) return null;
	if (typeof summary !== 'string' || summary.trim() === '') return null;
	if (!Array.isArray(reasons)) return null;
	const parsed: ParsedReason[] = [];
	for (const reason of reasons) {
		if (typeof reason !== 'object' || reason === null) return null;
		const { direction, text, cites } = reason as Record<string, unknown>;
		if (direction !== 'for' && direction !== 'against') return null;
		if (typeof text !== 'string' || text.trim() === '') return null;
		if (!Array.isArray(cites)) return null;
		parsed.push({
			direction,
			text: text.trim().replace(/\s+/g, ' '),
			cites: cites.map(parseCite)
		});
	}
	return { score: score as Score, summary: summary.trim().replace(/\s+/g, ' '), reasons: parsed };
}

/**
 * Text made comparable for quotes: lowercase, one space between words, and
 * curly quotes and dashes made plain, so a quote copied from the posting
 * still matches it.
 */
export function comparable(text: string): string {
	return text
		.toLowerCase()
		.replace(/[‘’]/g, "'")
		.replace(/[“”]/g, '"')
		.replace(/[–—]/g, '-')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Why code dropped a citation or a reason; recorded with the score. */
export interface Drop {
	/** The reason's number, from 0. */
	readonly reason: number;
	readonly why: string;
}

export interface CheckedReason extends Reason {
	/** What each citation points at, in words, for the page. */
	readonly sources: readonly string[];
}

export type Checked =
	| {
			readonly ok: true;
			readonly score: Score;
			readonly word: string;
			readonly summary: string;
			readonly reasons: readonly CheckedReason[];
			readonly dropped: readonly Drop[];
			/** Reading grade of the summary and reasons together (0008: aim for 8 or under). */
			readonly grade: number;
	  }
	| { readonly ok: false; readonly why: string; readonly dropped: readonly Drop[] };

function shortQuote(quote: string): string {
	return quote.length <= 80 ? quote : `${quote.slice(0, 77).trimEnd()}…`;
}

/** The checks in 0008, section 3. */
export function checkAnswer(input: unknown, job: ScoringJob, profile: Profile): Checked {
	const answer = parseAnswer(input);
	if (answer === null) {
		return { ok: false, why: 'The model’s answer wasn’t in the shape asked for.', dropped: [] };
	}
	const facts = new Map(profile.facts.map((fact) => [fact.id, fact]));
	const interests = new Map(profile.interests.map((interest) => [interest.id, interest]));
	const posting = comparable(job.postingText.slice(0, POSTING_MAX));
	const dropped: Drop[] = [];
	const reasons: CheckedReason[] = [];
	answer.reasons.forEach((reason, index) => {
		const cites: Cite[] = [];
		const sources: string[] = [];
		const drop = (why: string) => dropped.push({ reason: index, why });
		for (const cite of reason.cites) {
			if (cite === null) {
				drop('A citation wasn’t a fact, an interest, a preference or a quote.');
			} else if ('fact' in cite) {
				const fact = facts.get(cite.fact);
				if (fact === undefined)
					drop(`Cited fact ${String(cite.fact)}, which isn’t a confirmed fact.`);
				else {
					cites.push(cite);
					sources.push(`Fact: ${fact.text}`);
				}
			} else if ('interest' in cite) {
				const interest = interests.get(cite.interest);
				if (interest === undefined)
					drop(`Cited interest ${String(cite.interest)}, which doesn’t exist.`);
				else {
					cites.push(cite);
					sources.push(`Interest: ${interest.name}`);
				}
			} else if ('preference' in cite) {
				const value = profile.preferences[cite.preference];
				if (value === undefined)
					drop(`Cited the preference “${cite.preference}”, which isn’t set.`);
				else {
					cites.push(cite);
					sources.push(`Preference: ${value}`);
				}
			} else if (cite.quote.split(/\s+/).length < 2) {
				drop(`Quoted “${shortQuote(cite.quote)}”, which is under two words.`);
			} else if (!posting.includes(comparable(cite.quote))) {
				drop(`Quoted “${shortQuote(cite.quote)}”, which isn’t in the posting.`);
			} else {
				cites.push(cite);
				sources.push(`Posting: “${shortQuote(cite.quote)}”`);
			}
		}
		if (cites.length === 0) drop('No citation could be checked, so the reason was dropped.');
		else reasons.push({ direction: reason.direction, text: reason.text, cites, sources });
	});
	if (reasons.length === 0) {
		return {
			ok: false,
			why: 'None of the model’s reasons could be traced, so it isn’t scored.',
			dropped
		};
	}
	return {
		ok: true,
		score: answer.score,
		word: SCORE_WORDS[answer.score],
		summary: answer.summary,
		reasons,
		dropped,
		grade: gradeLevel([answer.summary, ...reasons.map((r) => r.text)].join(' '))
	};
}
