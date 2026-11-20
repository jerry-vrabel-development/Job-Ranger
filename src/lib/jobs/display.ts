/**
 * Words for the job list, in one place so the page and its tests agree.
 * Everything is said in words: nothing relies on color or icons alone.
 */
import { SOURCE_LISTS_PAY, type Workplace } from './posting.ts';
import type { StoredPosting } from './sync.ts';

const WORKPLACE_WORDS: Readonly<Record<Workplace, string>> = {
	remote: 'Remote',
	hybrid: 'Hybrid',
	'on-site': 'On site',
	unknown: 'Workplace not stated'
};

export function workplaceLabel(workplace: Workplace): string {
	return WORKPLACE_WORDS[workplace];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Posted today", "Posted 3 days ago". Days are counted in UTC, the boards' own dates. */
export function postedLabel(postedAt: string | null, now: string): string {
	if (!postedAt) return 'Posting date not given';
	const day = (iso: string) => Math.floor(Date.parse(iso) / DAY_MS);
	const days = day(now) - day(postedAt);
	if (days <= 0) return 'Posted today';
	if (days === 1) return 'Posted yesterday';
	return `Posted ${String(days)} days ago`;
}

/** What the list page sends to the browser: only what a card shows. */
export interface JobCard {
	readonly key: string;
	readonly source: StoredPosting['source'];
	readonly board: string;
	readonly id: string;
	readonly title: string;
	readonly company: string;
	readonly isNew: boolean;
	readonly where: string;
	readonly pay: string;
	readonly employmentType: string | null;
	readonly department: string | null;
	readonly posted: string;
	readonly postedAt: string | null;
	readonly applyUrl: string;
	readonly jobUrl: string | null;
}

export function toJobCard(posting: StoredPosting, now: string): JobCard {
	return {
		key: `${posting.source}:${posting.board}:${posting.id}`,
		source: posting.source,
		board: posting.board,
		id: posting.id,
		title: posting.title,
		company: posting.company,
		isNew: posting.seenAt === null,
		where: `${posting.location} · ${workplaceLabel(posting.workplace)}`,
		pay:
			posting.pay?.summary ??
			(SOURCE_LISTS_PAY[posting.source] ? 'Pay not posted' : 'See the posting for pay'),
		employmentType: posting.employmentType,
		department: posting.department,
		posted: postedLabel(posting.postedAt, now),
		postedAt: posting.postedAt,
		applyUrl: posting.applyUrl,
		jobUrl: posting.jobUrl
	};
}

/** "1 open job", "12 open jobs". */
export function countLabel(count: number, singular: string, pluralWord = `${singular}s`): string {
	return `${String(count)} ${count === 1 ? singular : pluralWord}`;
}

const CHECKED = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

/** "Nov 17, 2026", or "Not checked yet". The same on the server and in the browser. */
export function checkedLabel(iso: string | null): string {
	return iso ? CHECKED.format(new Date(iso)) : 'Not checked yet';
}

/** The most recent of some ISO dates, or null. */
export function latest(dates: readonly (string | null)[]): string | null {
	return dates.reduce<string | null>(
		(best, date) => (date && (!best || date > best) ? date : best),
		null
	);
}

/** Dates I act on (applying) are shown in my own time zone. */
export const TIME_ZONE = 'America/Chicago';

/** "Nov 20, 2026", in my time zone. */
export function dateLabel(iso: string): string {
	return new Date(iso).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: TIME_ZONE
	});
}
