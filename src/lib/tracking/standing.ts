/**
 * Where an application stands (design note 0006, part 2), worked out from
 * its dates each time, never stored: "No reply" after a set time, and
 * follow-up reminders at sensible intervals. Plain code with a fake clock in
 * its tests, so every rule here is checked to the day.
 */

export type Status = 'applied' | 'interviewing' | 'offer' | 'rejected' | 'withdrawn';

export const STATUSES: readonly Status[] = [
	'applied',
	'interviewing',
	'offer',
	'rejected',
	'withdrawn'
];

export const STATUS_WORDS: Readonly<Record<Status, string>> = {
	applied: 'Applied',
	interviewing: 'Interviewing',
	offer: 'Offer',
	rejected: 'Rejected',
	withdrawn: 'Withdrawn'
};

/** An application still at "applied" this many days on, with no change, has had no reply. */
export const NO_REPLY_DAYS = 30;
/** Follow up this many days after applying, and again after the second, if nothing has changed. */
export const FOLLOW_UP_DAYS: readonly [number, number] = [7, 14];

export interface Tracked {
	readonly status: Status;
	readonly appliedAt: string;
	/** When the status last changed, or null if it hasn't since applying. */
	readonly statusAt: string | null;
	readonly followedUpAt: string | null;
}

export type Group = 'follow-up' | 'waiting' | 'no-reply' | 'interviewing' | 'offer' | 'closed';

export interface Standing {
	readonly group: Group;
	/** Days since I applied, or since the status last changed. */
	readonly days: number;
	/** The line a page shows, in words. */
	readonly words: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const day = (iso: string) => Math.floor(Date.parse(iso) / DAY_MS);
const daysWord = (n: number) => `${String(n)} ${n === 1 ? 'day' : 'days'}`;

export function standing(app: Tracked, now: string): Standing {
	const since = app.statusAt ?? app.appliedAt;
	const days = Math.max(0, day(now) - day(since));
	switch (app.status) {
		case 'interviewing':
			return { group: 'interviewing', days, words: `Interviewing, for ${daysWord(days)}.` };
		case 'offer':
			return { group: 'offer', days, words: 'Offer.' };
		case 'rejected':
			return { group: 'closed', days, words: 'Rejected.' };
		case 'withdrawn':
			return { group: 'closed', days, words: 'Withdrawn.' };
		case 'applied':
			break;
	}
	if (days >= NO_REPLY_DAYS) {
		return {
			group: 'no-reply',
			days,
			words: `No reply in ${daysWord(days)}. You can stop waiting; if they write, change it here.`
		};
	}
	// A follow-up counts for the reminder it answers: one done on day 7 to 13 covers the first.
	const followed = app.followedUpAt === null ? null : day(app.followedUpAt) - day(app.appliedAt);
	const [first, second] = FOLLOW_UP_DAYS;
	const due =
		(days >= second && (followed === null || followed < second)) ||
		(days >= first && followed === null);
	if (due) {
		return {
			group: 'follow-up',
			days,
			words: `Applied ${daysWord(days)} ago with no reply: a good time to follow up.`
		};
	}
	return {
		group: 'waiting',
		days,
		words:
			app.followedUpAt === null
				? `Applied ${daysWord(days)} ago.`
				: `Applied ${daysWord(days)} ago; you followed up.`
	};
}

export function isStatus(value: unknown): value is Status {
	return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}
