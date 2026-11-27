/**
 * Reading grade (Flesch–Kincaid), for "why it fits" (design notes 0001 and
 * 0008: aim for grade 8 or under). An estimate: syllables are counted by
 * vowel groups, which is good enough to flag hard text, not to grade prose
 * (a silent "e" mid-word, as in "TypeScript", counts as a syllable).
 */

/** Syllables in one word, by vowel groups, with a silent final "e" dropped; at least 1. */
export function syllables(word: string): number {
	const letters = word.toLowerCase().replace(/[^a-z]/g, '');
	if (letters === '') return 0;
	const trimmed =
		letters.length > 2
			? letters.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, '')
			: letters;
	const groups = trimmed.replace(/^y/, '').match(/[aeiouy]+/g);
	return Math.max(1, groups?.length ?? 0);
}

/** Flesch–Kincaid grade of a text; 0 for a text with no words. Rounded to one decimal. */
export function gradeLevel(text: string): number {
	const words = text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
	if (words.length === 0) return 0;
	const sentences = Math.max(1, (text.match(/[.!?]+(?=\s|$)/g) ?? []).length);
	const total = words.reduce((sum, word) => sum + syllables(word), 0);
	const grade = 0.39 * (words.length / sentences) + 11.8 * (total / words.length) - 15.59;
	return Math.round(Math.max(0, grade) * 10) / 10;
}
