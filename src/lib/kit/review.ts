/**
 * Final review by code (design note 0004, step 5a): checks text I'm about to
 * use, whoever wrote it, and suggests. Nothing here changes the text. Each
 * suggestion says what it is in words, so it never relies on color.
 *
 * Unlike the draft checks in letter.ts, edited text carries no citations, so
 * numbers are checked against all my confirmed facts.
 */
import { wordCount } from '#lib/answers.ts';
import { NUMBER, normalizeNumber } from './letter.ts';

export type SuggestionLabel =
	| 'Wrong company'
	| 'Missing company'
	| 'Wrong role'
	| 'Too long'
	| 'Not in your facts'
	| 'Same as another application';

export interface Suggestion {
	readonly label: SuggestionLabel;
	readonly detail: string;
}

export interface ReviewContext {
	readonly company: string;
	readonly title: string;
	/** Other companies on my list. */
	readonly otherCompanies: readonly string[];
	/** Titles of other jobs I've prepared kits for or applied to. */
	readonly otherTitles: readonly string[];
	/** My confirmed facts' text and "when", where numbers are allowed to come from. */
	readonly facts: readonly string[];
	readonly maxWords: number;
	readonly maxChars: number;
	/** Must the text name this job's company ("why this company")? */
	readonly needsCompany: boolean;
	/** The same field as it went to other jobs: where it went, and the text. */
	readonly elsewhere: readonly { readonly where: string; readonly text: string }[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const names = (text: string, name: string) =>
	new RegExp(`(?<![\\w])${escape(name)}(?![\\w])`, 'i').test(text);
const tidy = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

/** The sentence a name or number appears in, so I can find the line to fix. */
function lineWith(text: string, found: string): string {
	const sentence = text
		.split(/(?<=[.!?])\s+/)
		.find((s) => s.toLowerCase().includes(found.toLowerCase()));
	const line = (sentence ?? text).trim();
	return line.length > 120 ? `${line.slice(0, 119).trimEnd()}…` : line;
}

/** Reviews text before I use it. Suggestions only, in a fixed order. */
export function review(text: string, context: ReviewContext): Suggestion[] {
	const suggestions: Suggestion[] = [];
	const lower = (s: string) => s.trim().toLowerCase();

	for (const company of new Set(context.otherCompanies.map((c) => c.trim()))) {
		if (company === '' || lower(company) === lower(context.company)) continue;
		if (names(text, company)) {
			suggestions.push({
				label: 'Wrong company',
				detail: `Names ${company}, not ${context.company}: “${lineWith(text, company)}”`
			});
		}
	}
	if (context.needsCompany && !names(text, context.company)) {
		suggestions.push({
			label: 'Missing company',
			detail: `Never names ${context.company}, and the question asks why them.`
		});
	}

	// One-word titles ("Engineer") would match ordinary words, so only longer ones count.
	for (const title of new Set(context.otherTitles.map((t) => t.trim()))) {
		if (title.split(/\s+/).length < 2 || lower(title) === lower(context.title)) continue;
		if (names(text, title)) {
			suggestions.push({
				label: 'Wrong role',
				detail: `Names “${title}”, another job’s title, not “${context.title}”.`
			});
		}
	}

	const words = wordCount(text);
	if (words > context.maxWords) {
		suggestions.push({
			label: 'Too long',
			detail: `${String(words)} words; keep it to ${String(context.maxWords)}.`
		});
	} else if (text.trim().length > context.maxChars) {
		suggestions.push({
			label: 'Too long',
			detail: `${String(text.trim().length)} characters; keep it under ${String(context.maxChars)}.`
		});
	}

	const known = new Set((context.facts.join(' ').match(NUMBER) ?? []).map(normalizeNumber));
	for (const number of new Set(text.match(NUMBER) ?? [])) {
		if (!known.has(normalizeNumber(number))) {
			suggestions.push({
				label: 'Not in your facts',
				detail: `The number ${number} isn’t in any confirmed fact: “${lineWith(text, number)}”`
			});
		}
	}

	const mine = tidy(text);
	for (const other of context.elsewhere) {
		if (mine !== '' && tidy(other.text) === mine) {
			suggestions.push({
				label: 'Same as another application',
				detail: `Word for word what ${other.where} got. Tailor a line to ${context.company}.`
			});
			break;
		}
	}
	return suggestions;
}

/** The status line after a review. */
export function reviewed(suggestions: readonly Suggestion[]): string {
	return suggestions.length === 0
		? 'Reviewed: nothing to fix in names, length or numbers. Tone and clarity are yours to judge.'
		: `Reviewed: ${String(suggestions.length)} ${suggestions.length === 1 ? 'thing' : 'things'} to look at. Nothing was changed.`;
}
