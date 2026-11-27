/**
 * Breezy HR's public job board feed: one GET per board, no key, at
 * https://{company}.breezy.hr/json (the feed the company's own careers page
 * is built from).
 *
 * Unlike Ashby, Greenhouse and Lever, Breezy doesn't document this feed, so
 * every field is read defensively: a field we can't read is left empty, never
 * guessed, and a response that isn't a list of jobs fails loudly as "the
 * board's format changed".
 *
 * The board name is the company's subdomain. board-link.ts only accepts a
 * plain DNS label for it, and boardUrl refuses anything else, so the request
 * can only ever go to a breezy.hr address.
 */
import {
	cleanText,
	httpsUrl,
	isoDate,
	withText,
	type FetchedPosting,
	type Pay
} from '#lib/jobs/posting.ts';
import { workplaceFrom } from './greenhouse.ts';
import { noneSkipped, SourceFormatError, type BoardResult, type JobSource } from './source.ts';

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** A field that is either text or an object with a `name` (Breezy uses both shapes). */
function named(value: unknown, maxLength = 120): string | null {
	return isObject(value) ? cleanText(value['name'], maxLength) : cleanText(value, maxLength);
}

/** Where the job is, as Breezy says it: its own label, else city, state, country. */
function locationOf(value: unknown): string {
	if (!isObject(value)) return cleanText(value, 300) ?? 'Location not given';
	const label = cleanText(value['name'], 300);
	if (label) return label;
	const parts = [
		cleanText(value['city'], 100),
		named(value['state'], 100),
		named(value['country'], 100)
	];
	return cleanText(parts.filter((part) => part !== null).join(', '), 300) ?? 'Location not given';
}

function remoteFlag(value: unknown): boolean {
	return isObject(value) && value['is_remote'] === true;
}

/** Breezy's salary is a line of text when the employer shows one; kept exactly as written. */
function salaryOf(value: unknown): Pay | null {
	const summary = cleanText(value, 120);
	return summary ? { summary, min: null, max: null, currency: null, interval: null } : null;
}

export const breezy: JobSource = {
	source: 'breezy',

	boardUrl(token) {
		if (!SUBDOMAIN.test(token)) throw new SourceFormatError('Not a Breezy board name');
		return `https://${token}.breezy.hr/json`;
	},

	parse(body, board): BoardResult {
		if (!Array.isArray(body)) throw new SourceFormatError('Breezy response is not a list of jobs');

		const skipped = noneSkipped();
		const postings: FetchedPosting[] = [];
		let companyName: string | null = null;
		for (const job of body) {
			if (companyName === null && isObject(job)) companyName = named(job['company'], 200);
			const id = isObject(job)
				? (cleanText(job['id'], 100) ?? cleanText(job['friendly_id'], 100))
				: null;
			if (!isObject(job) || !id) {
				skipped['missing-id'] += 1;
				continue;
			}
			const title = cleanText(job['name']);
			if (!title) {
				skipped['missing-title'] += 1;
				continue;
			}
			const url = httpsUrl(job['url']);
			if (!url) {
				skipped['no-apply-link'] += 1;
				continue;
			}
			const location = locationOf(job['location']);
			// Breezy's feed has no description: no text to store or score.
			postings.push(
				withText(
					{
						source: 'breezy',
						board: board.token,
						id,
						company: board.company,
						title,
						location,
						workplace: remoteFlag(job['location']) ? 'remote' : workplaceFrom(location),
						employmentType: named(job['type'], 60),
						department: named(job['department']),
						applyUrl: url,
						jobUrl: url,
						postedAt: isoDate(job['published_date']),
						pay: salaryOf(job['salary'])
					},
					''
				)
			);
		}
		return { postings, skipped, companyName };
	}
};
