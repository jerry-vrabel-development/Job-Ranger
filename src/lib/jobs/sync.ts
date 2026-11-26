/**
 * Dedupe and freshness for one board, as a pure plan: given what is stored
 * and what the board shows today, what to insert, update, touch and close.
 * The database layer writes the plan and nothing else, so the rules live
 * here, where they are tested (including property tests).
 */
import type { Pay, Posting } from './posting.ts';

/** A posting with its history. Dates are ISO 8601. */
export interface StoredPosting extends Posting {
	readonly firstSeenAt: string;
	readonly lastSeenAt: string;
	/** When it stopped appearing on its board, or null while it's open. */
	readonly closedAt: string | null;
	/** How many times it came back after closing (a ghost-job signal for later). */
	readonly reopenCount: number;
	/** When I marked it seen. A seen posting never shows as new again. */
	readonly seenAt: string | null;
}

export interface SyncPlan {
	/** First time on this board. */
	readonly insert: readonly StoredPosting[];
	/** Already stored, and its details changed or it came back after closing. */
	readonly update: readonly StoredPosting[];
	/** Still open and unchanged: only the last-seen date moves. */
	readonly touch: readonly string[];
	/** Open yesterday, gone today. */
	readonly close: readonly string[];
}

function samePay(a: Pay | null, b: Pay | null): boolean {
	if (a === null || b === null) return a === b;
	return (
		a.summary === b.summary &&
		a.min === b.min &&
		a.max === b.max &&
		a.currency === b.currency &&
		a.interval === b.interval
	);
}

/** True when everything the board says about a posting is the same. */
export function sameDetails(a: Posting, b: Posting): boolean {
	return (
		a.company === b.company &&
		a.title === b.title &&
		a.location === b.location &&
		a.workplace === b.workplace &&
		a.employmentType === b.employmentType &&
		a.department === b.department &&
		a.applyUrl === b.applyUrl &&
		a.jobUrl === b.jobUrl &&
		a.postedAt === b.postedAt &&
		a.textHash === b.textHash &&
		samePay(a.pay, b.pay)
	);
}

/** The board's details, without any history fields a caller may have passed in. */
function details(posting: Posting): Posting {
	return {
		source: posting.source,
		board: posting.board,
		id: posting.id,
		company: posting.company,
		title: posting.title,
		location: posting.location,
		workplace: posting.workplace,
		employmentType: posting.employmentType,
		department: posting.department,
		applyUrl: posting.applyUrl,
		jobUrl: posting.jobUrl,
		postedAt: posting.postedAt,
		pay: posting.pay,
		textHash: posting.textHash
	};
}

/**
 * Plans one board's sync. `existing` is everything stored for the board,
 * open or closed; `incoming` is what the board lists now. A posting listed
 * twice in one response counts once (the first wins).
 */
export function planSync(
	existing: readonly StoredPosting[],
	incoming: readonly Posting[],
	now: string
): SyncPlan {
	const stored = new Map(existing.map((posting) => [posting.id, posting]));
	const seenToday = new Set<string>();
	const insert: StoredPosting[] = [];
	const update: StoredPosting[] = [];
	const touch: string[] = [];

	for (const posting of incoming) {
		if (seenToday.has(posting.id)) continue;
		seenToday.add(posting.id);

		const before = stored.get(posting.id);
		if (!before) {
			insert.push({
				...details(posting),
				firstSeenAt: now,
				lastSeenAt: now,
				closedAt: null,
				reopenCount: 0,
				seenAt: null
			});
			continue;
		}
		const reopened = before.closedAt !== null;
		if (!reopened && sameDetails(before, posting)) {
			touch.push(posting.id);
			continue;
		}
		update.push({
			...details(posting),
			firstSeenAt: before.firstSeenAt,
			lastSeenAt: now,
			closedAt: null,
			reopenCount: before.reopenCount + (reopened ? 1 : 0),
			seenAt: before.seenAt
		});
	}

	const close = existing
		.filter((posting) => posting.closedAt === null && !seenToday.has(posting.id))
		.map((posting) => posting.id);

	return { insert, update, touch, close };
}
