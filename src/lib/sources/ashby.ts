/**
 * Ashby's public job posting API: one GET per board, no key.
 * https://developers.ashbyhq.com/docs/public-job-posting-api
 *
 * Every field is validated here, because the response arrives as `unknown`.
 * The shape is checked loudly (a changed format throws); a single bad posting
 * is skipped and counted, so one odd job can't hide the rest of the board.
 */
import {
	cleanText,
	httpsUrl,
	isoDate,
	type Pay,
	type Posting,
	type Workplace
} from '#lib/jobs/posting.ts';
import { noneSkipped, SourceFormatError, type BoardResult, type JobSource } from './source.ts';

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const WORKPLACE: Readonly<Record<string, Workplace>> = {
	Remote: 'remote',
	Hybrid: 'hybrid',
	OnSite: 'on-site'
};

const EMPLOYMENT: Readonly<Record<string, string>> = {
	FullTime: 'Full time',
	PartTime: 'Part time',
	Intern: 'Internship',
	Contract: 'Contract',
	Temporary: 'Temporary'
};

function finite(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Pay as the employer posted it, or null when there's none to show. */
export function parseCompensation(value: unknown): Pay | null {
	if (!isObject(value)) return null;
	const summary =
		cleanText(value['scrapeableCompensationSalarySummary']) ??
		cleanText(value['compensationTierSummary']);
	const parts = Array.isArray(value['summaryComponents']) ? value['summaryComponents'] : [];
	const salary = parts.find(
		(part): part is Json => isObject(part) && part['compensationType'] === 'Salary'
	);
	const min = salary ? finite(salary['minValue']) : null;
	const max = salary ? finite(salary['maxValue']) : null;
	if (!summary && min === null && max === null) return null;
	const currency = salary ? cleanText(salary['currencyCode'], 10) : null;
	const interval = salary ? cleanText(salary['interval'], 30) : null;
	return {
		summary: summary ?? formatRange(min, max, currency),
		min,
		max,
		currency,
		interval
	};
}

function formatRange(min: number | null, max: number | null, currency: string | null): string {
	const unit = currency ? `${currency} ` : '';
	if (min !== null && max !== null && min !== max) return `${unit}${String(min)} – ${String(max)}`;
	return `${unit}${String(min ?? max)}`;
}

function locations(job: Json): string {
	const primary = cleanText(job['location'], 200);
	const secondary = Array.isArray(job['secondaryLocations'])
		? job['secondaryLocations']
				.map((entry) => (isObject(entry) ? cleanText(entry['location'], 200) : null))
				.filter((name): name is string => name !== null && name !== primary)
		: [];
	const all = [...(primary ? [primary] : []), ...secondary];
	return cleanText(all.join('; '), 300) ?? 'Location not given';
}

function team(job: Json): string | null {
	const department = cleanText(job['department'], 120);
	const name = cleanText(job['team'], 120);
	if (department && name && department !== name) return `${department} · ${name}`;
	return department ?? name;
}

export const ashby: JobSource = {
	source: 'ashby',

	boardUrl(token) {
		return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=true`;
	},

	parse(body, board): BoardResult {
		if (!isObject(body) || !Array.isArray(body['jobs'])) {
			throw new SourceFormatError('Ashby response has no jobs list');
		}
		const version = body['apiVersion'];
		if (version !== undefined && version !== '1') {
			throw new SourceFormatError(
				`Ashby API version ${JSON.stringify(version)} is not one we know`
			);
		}

		const skipped = noneSkipped();
		const postings: Posting[] = [];
		for (const job of body['jobs']) {
			const id = isObject(job) ? cleanText(job['id'], 100) : null;
			if (!isObject(job) || !id) {
				skipped['missing-id'] += 1;
				continue;
			}
			// Unlisted jobs are meant to be reached only by a direct link.
			if (job['isListed'] === false) {
				skipped.unlisted += 1;
				continue;
			}
			const title = cleanText(job['title']);
			if (!title) {
				skipped['missing-title'] += 1;
				continue;
			}
			const applyUrl = httpsUrl(job['applyUrl']);
			if (!applyUrl) {
				skipped['no-apply-link'] += 1;
				continue;
			}
			const workplaceType = job['workplaceType'];
			postings.push({
				source: 'ashby',
				board: board.token,
				id,
				company: board.company,
				title,
				location: locations(job),
				workplace:
					(typeof workplaceType === 'string' ? WORKPLACE[workplaceType] : undefined) ?? 'unknown',
				employmentType:
					typeof job['employmentType'] === 'string'
						? (EMPLOYMENT[job['employmentType']] ?? cleanText(job['employmentType'], 60))
						: null,
				department: team(job),
				applyUrl,
				jobUrl: httpsUrl(job['jobUrl']),
				postedAt: isoDate(job['publishedAt']),
				pay: parseCompensation(job['compensation'])
			});
		}
		return { postings, skipped };
	}
};
