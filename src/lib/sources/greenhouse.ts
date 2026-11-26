/**
 * Greenhouse's public Job Board API: one GET per board, no key.
 * https://docs.greenhouse.io/job-board.html
 *
 * Two honest limits of the list endpoint, handled here rather than papered
 * over:
 * - It doesn't include pay (only each job's own endpoint does), so `pay` is
 *   null and the card says "See the posting for pay".
 * - Its documented fields have only `updated_at`. We use `first_published`
 *   when the response has it, and otherwise leave the posted date empty
 *   rather than call an update date a posting date.
 *
 * Greenhouse's apply form is on the job's own page, so the apply link and the
 * posting link are the same URL.
 */
import {
	cleanText,
	httpsUrl,
	isoDate,
	postingText,
	withText,
	type FetchedPosting,
	type Workplace
} from '#lib/jobs/posting.ts';
import { contentText } from '#lib/kit/match.ts';
import { noneSkipped, SourceFormatError, type BoardResult, type JobSource } from './source.ts';

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Greenhouse has no workplace field; employers write it into the location name. */
export function workplaceFrom(location: string): Workplace {
	if (/\bhybrid\b/i.test(location)) return 'hybrid';
	if (/\bremote\b/i.test(location)) return 'remote';
	if (/\b(on[- ]?site|in[- ]office)\b/i.test(location)) return 'on-site';
	return 'unknown';
}

function firstName(list: unknown): string | null {
	if (!Array.isArray(list)) return null;
	for (const item of list) {
		const name = isObject(item) ? cleanText(item['name'], 120) : null;
		if (name) return name;
	}
	return null;
}

function jobId(value: unknown): string | null {
	if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
	return typeof value === 'string' ? cleanText(value, 100) : null;
}

export const greenhouse: JobSource = {
	source: 'greenhouse',

	boardUrl(token) {
		return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`;
	},

	parse(body, board): BoardResult {
		if (!isObject(body) || !Array.isArray(body['jobs'])) {
			throw new SourceFormatError('Greenhouse response has no jobs list');
		}

		const skipped = noneSkipped();
		const postings: FetchedPosting[] = [];
		let companyName: string | null = null;
		for (const job of body['jobs']) {
			if (companyName === null && isObject(job)) companyName = cleanText(job['company_name'], 200);
			const id = isObject(job) ? jobId(job['id']) : null;
			if (!isObject(job) || !id) {
				skipped['missing-id'] += 1;
				continue;
			}
			const title = cleanText(job['title']);
			if (!title) {
				skipped['missing-title'] += 1;
				continue;
			}
			const url = httpsUrl(job['absolute_url']);
			if (!url) {
				skipped['no-apply-link'] += 1;
				continue;
			}
			const location =
				(isObject(job['location']) ? cleanText(job['location']['name'], 300) : null) ??
				'Location not given';
			const content = job['content'];
			const text = postingText([typeof content === 'string' ? contentText(content) : null]);
			postings.push(
				withText(
					{
						source: 'greenhouse',
						board: board.token,
						id,
						company: board.company,
						title,
						location,
						workplace: workplaceFrom(location),
						employmentType: null,
						department: firstName(job['departments']),
						applyUrl: url,
						jobUrl: url,
						postedAt: isoDate(job['first_published']),
						pay: null
					},
					text
				)
			);
		}
		return { postings, skipped, companyName };
	}
};
