/**
 * The apply kit's plain-code checks (design note 0004, step 3): which kind of
 * question a form question is, and whether a posting forbids AI-written
 * answers. No model: rules anyone can read, and every guess shown so I can
 * overrule it.
 */
import type { Question } from '#lib/answers.ts';

/**
 * Question rules, most specific first: the first that matches wins. "Why
 * this role" is tried before "why this company", and pay before location
 * ("pay range for remote roles" is a pay question).
 */
const RULES: readonly (readonly [Question, RegExp])[] = [
	[
		'work_authorization',
		/authori[sz]ed to work|work authori[sz]ation|legally (?:authori[sz]ed|eligible)|eligible to work|right to work|sponsor/i
	],
	['pay', /salary|compensation|pay (?:range|expectation)|(?:desired|expected) (?:pay|rate)/i],
	['start_date', /start date|when (?:can|could|would) you start|notice period|earliest/i],
	[
		'location',
		/relocat|\bremote\b|where are you (?:located|based)|currently (?:located|based)|commut|time ?zone|in[- ]office|on[- ]?site|\bhybrid\b/i
	],
	['how_heard', /hear about|how did you (?:find|learn)|referr/i],
	['ai_use', /\bAI\b|artificial intelligence|\bLLMs?\b|chatgpt|copilot|generative/i],
	[
		'why_role',
		/why (?:this|the) (?:role|position|job)|interest(?:ed)? in (?:this|the) (?:role|position)/i
	],
	[
		'why_company',
		/why (?:do you want to )?(?:join|work (?:at|for|here)|us\b|our|this company)|what (?:excites|draws|attracts) you|interest(?:ed)? in (?:working|joining)/i
	],
	['strengths', /strength/i],
	['challenge', /challeng|conflict|difficult/i],
	['mistake', /mistake|failure|failed|learned from/i],
	['leadership', /leadership|mentor|led a team|managed a team|lead a team/i],
	['about_me', /tell us (?:a bit )?about yourself|introduce yourself|about you\b/i]
];

/** Which saved-answer type fits a form question, or null when none clearly does. */
export function matchQuestion(label: string): Question | null {
	for (const [question, rule] of RULES) if (rule.test(label)) return question;
	return null;
}

/** Greenhouse field names for the standard contact and file fields every form has. */
const BASIC_FIELDS = new Set([
	'first_name',
	'last_name',
	'preferred_name',
	'email',
	'phone',
	'resume',
	'resume_text',
	'cover_letter',
	'cover_letter_text'
]);

/** True for name, email, phone, resume and cover letter fields: no saved answer needed. */
export function isBasicField(names: readonly string[]): boolean {
	return names.length > 0 && names.every((name) => BASIC_FIELDS.has(name));
}

const AI_WORDS =
	/\bAI\b|artificial intelligence|chatgpt|\bGPT\b|\bLLMs?\b|generative|language models?/i;
const RULE_WORDS =
	/\bnot\b|\bno\b|n't|prohibit|forbid|disqualif|refrain|avoid|without|own words|written by you|yourself/i;

/**
 * The first sentence that looks like a rule against AI-written answers: it
 * mentions AI and a "not" kind of word. A guess, shown with its sentence so
 * I can say it isn't one.
 */
export function findAiRule(text: string): string | null {
	const sentences = text
		.replace(/\s+/g, ' ')
		.split(/(?<=[.!?])\s+/)
		.map((sentence) => sentence.trim());
	for (const sentence of sentences) {
		if (AI_WORDS.test(sentence) && RULE_WORDS.test(sentence)) {
			return sentence.length <= 500 ? sentence : `${sentence.slice(0, 497).trimEnd()}…`;
		}
	}
	return null;
}

const ENTITIES: Readonly<Record<string, string>> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	rsquo: '’',
	lsquo: '‘',
	rdquo: '”',
	ldquo: '“',
	mdash: '—',
	ndash: '–'
};

function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, name: string) => {
		if (name.startsWith('#')) {
			const code =
				name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
			return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
		}
		return ENTITIES[name.toLowerCase()] ?? whole;
	});
}

/**
 * Plain text from Greenhouse's posting content, which is HTML written as
 * entities ("&lt;p&gt;"). Only for reading sentences; never rendered as HTML.
 */
export function contentText(content: string): string {
	const html = decodeEntities(content);
	return decodeEntities(
		html.replace(/<\/(?:p|li|h[1-6]|div)>|<br\s*\/?>/gi, '. ').replace(/<[^>]*>/g, ' ')
	)
		.replace(/\s+/g, ' ')
		.replace(/(?:\s*\.\s*){2,}/g, '. ')
		.trim();
}
