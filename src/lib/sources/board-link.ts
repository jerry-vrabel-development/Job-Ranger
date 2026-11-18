/**
 * Reads a pasted job-board link into a source and a board name, so a company
 * can be added from the app. Only the board name is taken from the link: the
 * fetch always goes to the source's own API (see each adapter's boardUrl), so
 * a pasted link can never send the Worker somewhere it chooses.
 */
import { SOURCE_NAMES, type Source } from '#lib/jobs/posting.ts';

/** A board name as stored: letters, digits, spaces, dots, dashes, underscores. */
const TOKEN = /^[a-z0-9][a-z0-9 ._-]{0,99}$/;
const CASED_TOKEN = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,99}$/;

/**
 * Sources whose board names are case-sensitive: Lever answers for
 * "BluesInc" but not "bluesinc". The others ignore case, so their names are
 * kept lowercase, and one board can't be added twice in different cases.
 */
const KEEPS_CASE: ReadonlySet<Source> = new Set(['lever']);

/** Whether a value is a board name as stored for `source` (lowercase unless the source keeps case). */
export function isToken(value: unknown, source?: Source): value is string {
	const pattern = source !== undefined && KEEPS_CASE.has(source) ? CASED_TOKEN : TOKEN;
	return typeof value === 'string' && pattern.test(value);
}

/** A starting name made from a board name: "civic-roundtable" becomes "Civic Roundtable". */
export function nameFromToken(token: string): string {
	return token
		.split(/[\s._-]+/)
		.filter((word) => word !== '')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

export type BoardLink =
	| { readonly ok: true; readonly source: Source; readonly token: string }
	| { readonly ok: false; readonly message: string };

const EXAMPLE =
	'job-boards.greenhouse.io/example, jobs.ashbyhq.com/example or jobs.lever.co/example';

const GREENHOUSE_BOARD_HOSTS = new Set(['boards.greenhouse.io', 'job-boards.greenhouse.io']);

function fail(message: string): BoardLink {
	return { ok: false, message };
}

function segments(url: URL): string[] {
	return url.pathname.split('/').filter((part) => part !== '');
}

/** The board name from one path segment, as stored for `source`, or null if it isn't usable. */
function tokenFrom(source: Source, raw: string | undefined | null): string | null {
	if (raw === undefined || raw === null) return null;
	let decoded: string;
	try {
		decoded = decodeURIComponent(raw);
	} catch {
		return null;
	}
	const trimmed = decoded.trim();
	const token = KEEPS_CASE.has(source) ? trimmed : trimmed.toLowerCase();
	return isToken(token, source) ? token : null;
}

function found(source: Source, raw: string | undefined | null): BoardLink {
	const token = tokenFrom(source, raw);
	if (token === null) {
		return fail(
			`That ${SOURCE_NAMES[source]} link doesn't name a board. It should look like ${EXAMPLE}.`
		);
	}
	return { ok: true, source, token };
}

export function parseBoardLink(input: string): BoardLink {
	const text = input.trim();
	if (text === '') return fail(`Paste a job board link, like ${EXAMPLE}.`);
	if (text.length > 2000) return fail('That link is too long to be a job board link.');

	let url: URL;
	try {
		url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
	} catch {
		return fail(`That doesn't look like a link. Paste a job board link, like ${EXAMPLE}.`);
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') {
		return fail(`That doesn't look like a web link. Paste a job board link, like ${EXAMPLE}.`);
	}

	const host = url.hostname.toLowerCase();
	const parts = segments(url);

	if (host === 'jobs.ashbyhq.com') return found('ashby', parts[0]);
	if (host === 'api.ashbyhq.com' && parts[0] === 'posting-api' && parts[1] === 'job-board') {
		return found('ashby', parts[2]);
	}
	if (GREENHOUSE_BOARD_HOSTS.has(host)) {
		// The embedded board names the company in its query: /embed/job_board?for=example
		if (parts[0] === 'embed') return found('greenhouse', url.searchParams.get('for'));
		return found('greenhouse', parts[0]);
	}
	if (host === 'boards-api.greenhouse.io' && parts[0] === 'v1' && parts[1] === 'boards') {
		return found('greenhouse', parts[2]);
	}
	if (host === 'jobs.lever.co') return found('lever', parts[0]);
	if (host === 'api.lever.co' && parts[0] === 'v0' && parts[1] === 'postings') {
		return found('lever', parts[2]);
	}
	if (
		host.endsWith('.greenhouse.io') ||
		host.endsWith('.ashbyhq.com') ||
		host.endsWith('.lever.co')
	) {
		return fail(`Job Ranger can't read boards on ${host} yet. Try a link like ${EXAMPLE}.`);
	}
	return fail(
		`Job Ranger reads Ashby, Greenhouse and Lever boards, and that link is on ${host}. If the company's careers page has a link to jobs.ashbyhq.com, job-boards.greenhouse.io or jobs.lever.co, paste that one.`
	);
}
