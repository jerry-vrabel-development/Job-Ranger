/**
 * Pay missing where the law may require it (design note 0005, part 2): a
 * posting with no pay, from a board that lists pay, whose location names a
 * state with a pay-range-in-postings law in effect. Information, not legal
 * advice: whether the law covers this employer (its size, where the work is
 * done) is for the reader to judge, so the words say who the law covers.
 */
import { SOURCE_LISTS_PAY, type Pay, type Source } from '#lib/jobs/posting.ts';
import { PAY_LAWS, type PayLaw } from './pay-laws.ts';

export interface PayInput {
	readonly source: Source;
	readonly location: string;
	readonly pay: Pay | null;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// DC first, so "Washington, DC" is never read as Washington state.
const DC = /\bD\.\s?C\.?(?![a-z])|,\s*DC\b|\bDistrict of Columbia\b|\bWashington\s+DC\b/i;

function named(segment: string, law: PayLaw): boolean {
	if (law.code === 'DC') return DC.test(segment);
	if (law.code === 'WA' && DC.test(segment)) return false;
	// "Chicago, IL", "Austin, TX, US": the code after a comma, in capitals.
	if (new RegExp(`,\\s*${law.code}(?![A-Za-z])`).test(segment)) return true;
	// The full name, but not inside another ("West Virginia", "New Jersey City" is fine).
	const name = law.code === 'VA' ? '(?<!West\\s)Virginia' : escape(law.name);
	return new RegExp(`(?<![A-Za-z])${name}(?![A-Za-z])`, 'i').test(segment);
}

/** The pay laws in effect today for the states a location names, in the list's order. */
export function lawsFor(location: string, now: string): PayLaw[] {
	const today = now.slice(0, 10);
	const segments = location.split(/[;|/]|\s+or\s+/i);
	return PAY_LAWS.filter(
		(law) => law.effective <= today && segments.some((segment) => named(segment, law))
	);
}

/** The laws a posting without pay may fall under, or null when there's nothing to flag. */
export function paySignal(posting: PayInput, now: string): PayLaw[] | null {
	// Greenhouse's list has no pay at all, so its jobs can't be judged from the list.
	if (posting.pay !== null || !SOURCE_LISTS_PAY[posting.source]) return null;
	const laws = lawsFor(posting.location, now);
	return laws.length === 0 ? null : laws;
}

/** "employers with 15 or more employees", "any employer". */
export function whoItCovers(law: PayLaw): string {
	return law.minEmployees <= 1
		? 'any employer'
		: `employers with ${String(law.minEmployees)} or more employees`;
}
