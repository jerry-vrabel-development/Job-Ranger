/**
 * Answer bank words and limits shared by the server and the Answers page
 * (design note 0004).
 */

/** Question types, in the order most forms ask them. */
export const QUESTIONS = [
	'work_authorization',
	'start_date',
	'location',
	'pay',
	'how_heard',
	'about_me',
	'why_company',
	'why_role',
	'strengths',
	'challenge',
	'mistake',
	'leadership',
	'ai_use',
	'other'
] as const;
export type Question = (typeof QUESTIONS)[number];

export const QUESTION_LABELS: Readonly<Record<Question, string>> = {
	work_authorization: 'Work authorization',
	start_date: 'Start date and notice',
	location: 'Location, remote or relocation',
	pay: 'Pay expectations',
	how_heard: 'How you heard about the role',
	about_me: 'About you, your story',
	why_company: 'Why this company',
	why_role: 'Why this role',
	strengths: 'Strengths',
	challenge: 'A challenge or conflict you handled',
	mistake: 'A mistake and what you learned',
	leadership: 'Leading or mentoring',
	ai_use: 'How you use AI tools',
	other: 'Other'
};

export const ORIGINS = ['own', 'together', 'ai_edited'] as const;
export type Origin = (typeof ORIGINS)[number];

export const ORIGIN_LABELS: Readonly<Record<Origin, string>> = {
	own: 'My own words',
	together: 'Written together',
	ai_edited: 'AI draft, edited by me'
};

export const LABEL_MAX = 80;
export const TEXT_MAX = 5000;
export const NOTES_MAX = 2000;

/** Words in an answer, as a form's word limit would count them. */
export function wordCount(text: string): number {
	const words = text.trim().split(/\s+/);
	return words[0] === '' ? 0 : words.length;
}
