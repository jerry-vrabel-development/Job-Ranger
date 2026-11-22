/**
 * Ghost-job warning (design note 0005, part 1): a posting open a long time,
 * or reposted again and again, is flagged with the facts behind it. Plain
 * code, so the same posting always gets the same answer. A warning, not a
 * verdict: the job stays on the list.
 */

/** Open this many days or more is flagged. */
export const GHOST_DAYS = 60;
/** Reposted (closed, then back on the board) this many times or more is flagged. */
export const GHOST_REPOSTS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface GhostInput {
	/** When the board says the job was first published, if it says. */
	readonly postedAt: string | null;
	/** When Job Ranger first saw it. */
	readonly firstSeenAt: string;
	readonly reopenCount: number;
}

export interface Ghost {
	readonly days: number;
	/** The date "open since" counts from, and whose date it is. */
	readonly since: string;
	readonly from: 'board' | 'job-ranger';
	readonly reposts: number;
}

const day = (iso: string) => Math.floor(Date.parse(iso) / DAY_MS);

/** The facts, and whether they add up to a warning: null when they don't. */
export function ghostSignal(posting: GhostInput, now: string): Ghost | null {
	// The earlier of the board's date and the first sighting, so a board that resets its
	// date on repost can't hide a job's age. A date in the future isn't believed.
	const at = posting.postedAt === null ? Number.NaN : Date.parse(posting.postedAt);
	const posted =
		posting.postedAt !== null &&
		!Number.isNaN(at) &&
		at < Date.parse(posting.firstSeenAt) &&
		at <= Date.parse(now)
			? posting.postedAt
			: null;
	const since = posted ?? posting.firstSeenAt;
	const days = Math.max(0, day(now) - day(since));
	const reposts = Math.max(0, posting.reopenCount);
	if (days < GHOST_DAYS && reposts < GHOST_REPOSTS) return null;
	return { days, since, from: posted === null ? 'job-ranger' : 'board', reposts };
}

const SINCE = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

function times(n: number): string {
	if (n === 1) return 'once';
	if (n === 2) return 'twice';
	return `${String(n)} times`;
}

/** The warning in words, facts first. */
export function ghostWords(ghost: Ghost): string {
	const whose = ghost.from === 'board' ? 'the board’s date' : 'when Job Ranger first saw it';
	const facts = [
		`open ${String(ghost.days)} ${ghost.days === 1 ? 'day' : 'days'} (since ${SINCE.format(new Date(ghost.since))}, ${whose})`,
		...(ghost.reposts > 0 ? [`reposted ${times(ghost.reposts)}`] : [])
	].join(', ');
	return `${facts.charAt(0).toUpperCase()}${facts.slice(1)}. Long-open or reposted jobs are sometimes never filled. A warning, not a verdict.`;
}
