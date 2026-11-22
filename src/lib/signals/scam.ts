/**
 * Scam checks (design note 0005, part 3) on a posting's text: the patterns
 * job scams use, each flag quoting the sentence it found. Plain code. A flag
 * is a reason to look closer, not a verdict; real postings on employers' own
 * boards rarely trip these, which is why each pattern is narrow.
 */

export type ScamLabel =
	| 'Asks you to pay'
	| 'Check for equipment'
	| 'Free email address'
	| 'Chat-app contact'
	| 'Run their software';

export interface ScamFlag {
	readonly label: ScamLabel;
	/** What the pattern means, in words. */
	readonly why: string;
	/** The sentence it was found in, trimmed. */
	readonly quote: string;
}

interface Rule {
	readonly label: ScamLabel;
	readonly why: string;
	readonly patterns: readonly RegExp[];
}

const CHAT = '(?:whatsapp|telegram|signal|google hangouts|wickr|wechat)';

const RULES: readonly Rule[] = [
	{
		label: 'Asks you to pay',
		why: 'Real employers don’t charge you to start. A fee for training, a kit or a background check is a common scam.',
		patterns: [
			/\byou (?:will )?(?:need to|must|are required to|have to) (?:pay|purchase|buy)\b/i,
			/\b(?:registration|processing|onboarding|application|training|starter[- ]kit|background[- ]check) fee\b/i
		]
	},
	{
		label: 'Check for equipment',
		why: 'The fake-check scam: they send a check to buy equipment from “their vendor”, the check bounces, and the money you sent is gone.',
		patterns: [
			/\b(?:send|mail|deposit|cash)\b[^.!?]{0,40}\bchecks?\b[^.!?]{0,80}\b(?:equipment|supplies|vendor|office set ?up|software)\b/i,
			/\b(?:equipment|supplies|office set ?up)\b[^.!?]{0,80}\b(?:send|mail|deposit|cash)\b[^.!?]{0,40}\bchecks?\b/i,
			/\b(?:equipment|supplies|office set ?up)\b[^.!?]{0,80}\bchecks?\b[^.!?]{0,30}\b(?:send|sends|sent|mail|mailed|deposit)\b/i
		]
	},
	{
		label: 'Free email address',
		why: 'Recruiters for real companies write from the company’s own domain, not a free email service.',
		patterns: [
			/[\w.+-]+@(?:gmail|googlemail|yahoo|hotmail|outlook|live|aol|icloud|me|proton|protonmail|gmx|mail|yandex)\.(?:com|me|net|ru)\b/i
		]
	},
	{
		label: 'Chat-app contact',
		why: 'Scammers move you to a chat app, where there’s no company address and no record. Real interviews use the company’s own tools.',
		patterns: [
			new RegExp(
				`\\b(?:contact|reach|text|message|chat with|add|dm)\\s+(?:us|me|the recruiter|our (?:hr|recruiter|hiring manager|team))\\b[^.!?]{0,40}\\b(?:on|via|through|over)\\s+${CHAT}\\b`,
				'i'
			),
			new RegExp(
				`\\b(?:interview|screening|chat)\\b[^.!?]{0,40}\\b(?:on|via|over|through)\\s+${CHAT}\\b`,
				'i'
			),
			/\b(?:by|via) (?:text|sms) (?:message )?only\b/i
		]
	},
	{
		label: 'Run their software',
		why: 'Developer job scams ask you to install a “meeting app” or run their code, which steals passwords or crypto wallets. Use only the company’s known tools, and run strangers’ code in a throwaway sandbox if at all.',
		patterns: [
			/\b(?:download|install)\b[^.!?]{0,40}\b(?:meeting|video|conference|interview|call)\s+(?:app|software|client|tool)\b/i,
			/\b(?:clone|download)\b[^.!?]{0,60}\b(?:repo|repository)\b[^.!?]{0,60}\b(?:run|execute|npm (?:install|start)|start it)\b/i,
			/\b(?:connect|link)\b[^.!?]{0,30}\bwallet\b|\bmetamask\b|\bseed phrase\b/i
		]
	}
];

/** Sentences, roughly: split at sentence ends and line breaks. */
function sentences(text: string): string[] {
	return text
		.split(/(?<=[.!?])\s+|\n+/)
		.map((s) => s.replace(/\s+/g, ' ').trim())
		.filter((s) => s !== '');
}

const trim = (s: string) => (s.length > 160 ? `${s.slice(0, 159).trimEnd()}…` : s);

/** Each kind of flag at most once, with the first sentence that tripped it. */
export function scamSignals(text: string): ScamFlag[] {
	const all = sentences(text);
	const flags: ScamFlag[] = [];
	for (const rule of RULES) {
		const hit = all.find((sentence) => rule.patterns.some((pattern) => pattern.test(sentence)));
		if (hit !== undefined) flags.push({ label: rule.label, why: rule.why, quote: trim(hit) });
	}
	return flags;
}
