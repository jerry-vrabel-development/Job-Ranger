/**
 * Lever's public Postings API: one GET per board, no key.
 * https://github.com/lever/postings-api
 *
 * The response is a JSON array of postings. Lever's apply form lives at the
 * posting's `applyUrl`; when a posting has none, its page (`hostedUrl`) is
 * where you apply, so that is the apply link. Lever doesn't name the company,
 * so the company name comes from you or from the link.
 *
 * Boards hosted in Lever's EU region answer on a different host and aren't
 * read yet (board-link.ts says so when one is pasted).
 */
import {
	cleanText,
	httpsUrl,
	known,
	postingText,
	withText,
	type FetchedPosting,
	type Pay,
	type Workplace
} from '#lib/jobs/posting.ts';
import { contentText } from '#lib/kit/match.ts';
import { noneSkipped, SourceFormatError, type BoardResult, type JobSource } from './source.ts';

type Json = Record<string, unknown>;

/**
 * A Lever posting's text: the opening, then each list (often the
 * requirements) with its heading, then the closing. Lists are HTML.
 */
function leverText(job: Json): string {
	const lists = Array.isArray(job['lists'])
		? job['lists'].flatMap((list) =>
				isObject(list)
					? [
							list['text'],
							typeof list['content'] === 'string' ? contentText(list['content']) : null
						]
					: []
			)
		: [];
	return postingText([job['descriptionPlain'], ...lists, job['additionalPlain']]);
}

function isObject(value: unknown): value is Json {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const WORKPLACE: Readonly<Record<string, Workplace>> = {
	remote: 'remote',
	hybrid: 'hybrid',
	onsite: 'on-site',
	'on-site': 'on-site'
};

function finite(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Lever's posting time is milliseconds since 1970. */
export function fromMillis(value: unknown): string | null {
	const ms = finite(value);
	if (ms === null || ms <= 0) return null;
	const date = new Date(ms);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** An amount in its currency, like "$150,000"; just the number if the currency is unknown. */
function money(amount: number, currency: string | null): string {
	if (currency) {
		try {
			return new Intl.NumberFormat('en-US', {
				style: 'currency',
				currency,
				maximumFractionDigits: 0
			}).format(amount);
		} catch {
			return `${currency} ${amount.toLocaleString('en-US')}`;
		}
	}
	return amount.toLocaleString('en-US');
}

/** "per-year-salary" becomes "per year", "per-hour-wage" "per hour"; an empty one is left out. */
function intervalWords(interval: string | null): string | null {
	if (!interval) return null;
	const words = interval
		.toLowerCase()
		.replace(/[-_]+/g, ' ')
		.replace(/\b(salary|wage)\b/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	return words === '' ? null : words;
}

/** Pay as the employer posted it, or null when there's none. */
export function parseSalary(value: unknown): Pay | null {
	if (!isObject(value)) return null;
	const min = finite(value['min']);
	const max = finite(value['max']);
	const [low, high] = [min, max].filter((amount): amount is number => amount !== null);
	if (low === undefined) return null;
	const currency = cleanText(value['currency'], 10);
	const interval = cleanText(value['interval'], 30);
	const range =
		high !== undefined && high !== low
			? `${money(low, currency)} – ${money(high, currency)}`
			: money(low, currency);
	const per = intervalWords(interval);
	return { summary: per ? `${range} ${per}` : range, min, max, currency, interval };
}

function locations(categories: Json): string {
	const all = Array.isArray(categories['allLocations'])
		? categories['allLocations']
				.map((name) => cleanText(name, 200))
				.filter((name): name is string => name !== null)
		: [];
	const joined = cleanText([...new Set(all)].join('; '), 300);
	return joined ?? cleanText(categories['location'], 300) ?? 'Location not given';
}

function team(categories: Json): string | null {
	const department = cleanText(categories['department'], 120);
	const name = cleanText(categories['team'], 120);
	if (department && name && department !== name) return `${department} · ${name}`;
	return department ?? name;
}

export const lever: JobSource = {
	source: 'lever',

	boardUrl(token) {
		return `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`;
	},

	parse(body, board): BoardResult {
		if (!Array.isArray(body)) throw new SourceFormatError('Lever response is not a list of jobs');

		const skipped = noneSkipped();
		const postings: FetchedPosting[] = [];
		for (const job of body) {
			const id = isObject(job) ? cleanText(job['id'], 100) : null;
			if (!isObject(job) || !id) {
				skipped['missing-id'] += 1;
				continue;
			}
			const title = cleanText(job['text']);
			if (!title) {
				skipped['missing-title'] += 1;
				continue;
			}
			const jobUrl = httpsUrl(job['hostedUrl']);
			const applyUrl = httpsUrl(job['applyUrl']) ?? jobUrl;
			if (!applyUrl) {
				skipped['no-apply-link'] += 1;
				continue;
			}
			const categories = isObject(job['categories']) ? job['categories'] : {};
			postings.push(
				withText(
					{
						source: 'lever',
						board: board.token,
						id,
						company: board.company,
						title,
						location: locations(categories),
						workplace:
							known(WORKPLACE, cleanText(job['workplaceType'], 30)?.toLowerCase()) ?? 'unknown',
						employmentType: cleanText(categories['commitment'], 60),
						department: team(categories),
						applyUrl,
						jobUrl,
						postedAt: fromMillis(job['createdAt']),
						pay: parseSalary(job['salaryRange'])
					},
					leverText(job)
				)
			);
		}
		return { postings, skipped };
	}
};
