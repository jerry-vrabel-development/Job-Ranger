/**
 * Pay missing where the law may require it (design note 0005, part 2): a
 * posting with no pay, from a board that lists pay, whose location names a
 * state with a pay-range-in-postings law in effect. Information, not legal
 * advice: whether the law covers this employer (its size, where the work is
 * done) is for the reader to judge, so the words say who the law covers.
 */
import { SOURCE_LISTS_PAY, type Pay, type Source } from '#lib/jobs/posting.ts';
import { namesState, segmentsOf } from '#lib/geo/states.ts';
import { PAY_LAWS, type PayLaw } from './pay-laws.ts';

export interface PayInput {
	readonly source: Source;
	readonly location: string;
	readonly pay: Pay | null;
}

/** The pay laws in effect today for the states a location names, in the list's order. */
export function lawsFor(location: string, now: string): PayLaw[] {
	const today = now.slice(0, 10);
	const segments = segmentsOf(location);
	return PAY_LAWS.filter(
		(law) => law.effective <= today && segments.some((segment) => namesState(segment, law))
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
