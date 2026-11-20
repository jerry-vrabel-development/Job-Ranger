/**
 * Fact bank words and limits shared by the server and the Facts page
 * (design note 0004).
 */

export const KINDS = [
	'role',
	'accomplishment',
	'project',
	'skill',
	'education',
	'link',
	'other'
] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_LABELS: Readonly<Record<Kind, string>> = {
	role: 'Role',
	accomplishment: 'Accomplishment',
	project: 'Project',
	skill: 'Skill or tool',
	education: 'Education or training',
	link: 'Link',
	other: 'Other'
};

export const EXPERIENCES = ['professional', 'side', 'learning'] as const;
export type Experience = (typeof EXPERIENCES)[number];

export const EXPERIENCE_LABELS: Readonly<Record<Experience, string>> = {
	professional: 'Professional',
	side: 'Side project or hobby',
	learning: 'Learning now'
};

export const TEXT_MAX = 500;
export const ORGANIZATION_MAX = 100;
export const PERIOD_MAX = 40;
/** Most lines one paste may add. */
export const PASTE_MAX = 200;

/** A fact's opening words, for messages and button names. */
export function shortText(fact: string): string {
	return fact.length <= 60 ? fact : `${fact.slice(0, 57).trimEnd()}…`;
}
