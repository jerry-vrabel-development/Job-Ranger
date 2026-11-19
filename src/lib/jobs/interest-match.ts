/**
 * Jobs by interest. A job matches an interest when its company is tagged with
 * it, or when one of its keywords is a whole word (or phrase) in the job's
 * title or team. The same rule runs twice: in SQL, to filter before the list
 * limit and count truly, and here, to say in words why each job matched. Both
 * use the separators below, so they can't disagree.
 */

export interface InterestMatch {
	readonly id: number;
	readonly name: string;
	readonly keywords: readonly string[];
	/** Board keys ("greenhouse:civic") of the companies tagged with it. */
	readonly boards: readonly string[];
}

/**
 * Characters that end a word in a title. Not "+#.&'-", which keywords may
 * hold (C++, C#, .NET, R&D, full-stack). Code points, so SQL can use char().
 */
export const SEPARATORS: readonly number[] = [
	...',/():;|!?"[]{}<>·•'.split('').map((c) => c.charCodeAt(0)),
	9, // tab
	10, // newline
	0x2013, // en dash
	0x2014 // em dash
];

/**
 * A title made ready for whole-word matching: separators become spaces, and
 * it is padded with a space each side. Only A–Z is lowercased, as SQLite's
 * lower() does, so the two always agree.
 */
export function normalize(text: string): string {
	let out = text.replace(/[A-Z]/g, (c) => c.toLowerCase());
	for (const code of SEPARATORS) out = out.replaceAll(String.fromCodePoint(code), ' ');
	return ` ${out} `;
}

/** The same as normalize, as SQL over a column. */
export function normalizeSql(column: string): string {
	const replaced = SEPARATORS.reduce(
		(inner, code) => `replace(${inner}, char(${String(code)}), ' ')`,
		`lower(${column})`
	);
	return `(' ' || ${replaced} || ' ')`;
}

function has(text: string | null, keyword: string): boolean {
	return text !== null && normalize(text).includes(` ${keyword} `);
}

/** Why a job is under an interest, in words; null if it isn't. */
export function whyMatched(
	interest: InterestMatch,
	job: { source: string; board: string; title: string; department: string | null }
): string | null {
	if (interest.boards.includes(`${job.source}:${job.board}`)) {
		return `${interest.name}: company tag`;
	}
	for (const keyword of interest.keywords) {
		if (has(job.title, keyword)) return `${interest.name}: title has “${keyword}”`;
		if (has(job.department, keyword)) return `${interest.name}: team has “${keyword}”`;
	}
	return null;
}
