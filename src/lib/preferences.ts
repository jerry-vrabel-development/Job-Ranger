/**
 * What I'm looking for (design note 0008, step 3): words, limits and checks
 * shared by the server and the Facts page, and the plain sentences the
 * scorer is given. Every preference is optional; an empty one is left out of
 * the prompt, so it's "not a factor".
 */
import type { Preference } from '#lib/scoring/score.ts';

export const WORKPLACES = ['remote', 'hybrid', 'on-site'] as const;
export type WorkplaceWanted = (typeof WORKPLACES)[number];

export const WORKPLACE_LABELS: Readonly<Record<WorkplaceWanted, string>> = {
	remote: 'Remote',
	hybrid: 'Hybrid',
	'on-site': 'On site'
};

export const LEVELS = ['junior', 'mid', 'senior', 'staff', 'principal', 'lead', 'manager'] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_LABELS: Readonly<Record<Level, string>> = {
	junior: 'Junior',
	mid: 'Mid-level',
	senior: 'Senior',
	staff: 'Staff',
	principal: 'Principal',
	lead: 'Lead',
	manager: 'Manager'
};

export const AREA_MAX = 100;
export const LOOKING_FOR_MAX = 600;
export const PAY_FLOOR_MAX = 10_000_000;

export interface Preferences {
	readonly workplaces: readonly WorkplaceWanted[];
	/** Where hybrid and on-site jobs should be: "Chicago area". */
	readonly area: string;
	readonly levels: readonly Level[];
	/** US dollars a year; null when not set. */
	readonly payFloor: number | null;
	readonly lookingFor: string;
}

export const EMPTY_PREFERENCES: Preferences = {
	workplaces: [],
	area: '',
	levels: [],
	payFloor: null,
	lookingFor: ''
};

export type PreferenceField = 'area' | 'payFloor' | 'lookingFor';

/** What a form sent, before checking. */
export interface PreferenceValues {
	readonly workplaces: readonly string[];
	readonly area: string;
	readonly levels: readonly string[];
	readonly payFloor: string;
	readonly lookingFor: string;
}

export type CheckedPreferences =
	| { readonly ok: true; readonly preferences: Preferences }
	| { readonly ok: false; readonly field: PreferenceField; readonly message: string };

/** A yearly amount as people type it: 120000, 120,000, $120,000 or 120k. Null if it isn't one. */
export function parsePay(value: string): number | null {
	const match = /^\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*(k)?$/i.exec(value.trim());
	if (match === null) return null;
	const amount = Number(String(match[1]).replaceAll(',', '')) * (match[2] === undefined ? 1 : 1000);
	return amount >= 1 && amount <= PAY_FLOOR_MAX ? amount : null;
}

export function checkPreferences(values: PreferenceValues): CheckedPreferences {
	const tidy = (value: string) => value.trim().replace(/\s+/g, ' ');
	const area = tidy(values.area);
	const lookingFor = values.lookingFor.trim().replace(/[ \t]+/g, ' ');
	if (area.length > AREA_MAX) {
		return {
			ok: false,
			field: 'area',
			message: `Keep the area under ${String(AREA_MAX)} characters.`
		};
	}
	if (lookingFor.length > LOOKING_FOR_MAX) {
		return {
			ok: false,
			field: 'lookingFor',
			message: `Keep this under ${String(LOOKING_FOR_MAX)} characters.`
		};
	}
	let payFloor: number | null = null;
	if (values.payFloor.trim() !== '') {
		payFloor = parsePay(values.payFloor);
		if (payFloor === null) {
			return {
				ok: false,
				field: 'payFloor',
				message: 'Enter a yearly amount in US dollars, like 120000 or $120k.'
			};
		}
	}
	return {
		ok: true,
		preferences: {
			workplaces: WORKPLACES.filter((w) => values.workplaces.includes(w)),
			area,
			levels: LEVELS.filter((l) => values.levels.includes(l)),
			payFloor,
			lookingFor
		}
	};
}

function list(words: readonly string[]): string {
	if (words.length <= 2) return words.join(' or ');
	return `${words.slice(0, -1).join(', ')} or ${words.slice(-1).join('')}`;
}

/** Whole dollars with commas: $120,000. */
export function wholeDollars(amount: number): string {
	return `$${amount.toLocaleString('en-US')}`;
}

/** My preferences as plain sentences for the scorer; one left empty is left out. */
export function forScoring(preferences: Preferences): Partial<Record<Preference, string>> {
	const out: Partial<Record<Preference, string>> = {};
	const { workplaces, area, levels, payFloor, lookingFor } = preferences;
	if (workplaces.length > 0) {
		const where = area === '' ? '' : ` in ${area}`;
		const remote = workplaces.includes('remote') ? ['Remote'] : [];
		const local = workplaces
			.filter((w) => w !== 'remote')
			.map((w) => WORKPLACE_LABELS[w].toLowerCase());
		const parts = [...remote, ...(local.length > 0 ? [`${list(local)}${where}`] : [])];
		const sentence = parts.join(', or ');
		out.where = sentence.charAt(0).toUpperCase() + sentence.slice(1);
	}
	if (levels.length > 0) out.level = list(levels.map((l) => LEVEL_LABELS[l]));
	if (payFloor !== null) out.pay = `At least ${wholeDollars(payFloor)} a year`;
	if (lookingFor !== '') out.looking_for = lookingFor;
	return out;
}
