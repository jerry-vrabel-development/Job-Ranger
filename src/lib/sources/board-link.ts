/**
 * Reads a pasted job-board link into a source and a board name, so a company
 * can be added from the app. Only the board name is taken from the link: the
 * fetch always goes to the source's own API (see each adapter's boardUrl), so
 * a pasted link can never send the Worker somewhere it chooses.
 */
import { SOURCE_NAMES, type Source } from '#lib/jobs/posting.ts';

/** A board name as stored: lowercase letters, digits, spaces, dots, dashes, underscores. */
const TOKEN = /^[a-z0-9][a-z0-9 ._-]{0,99}$/;

export function isToken(value: unknown): value is string {
	return typeof value === 'string' && TOKEN.test(value);
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

const EXAMPLE = 'job-boards.greenhouse.io/example or jobs.ashbyhq.com/example';

const GREENHOUSE_BOARD_HOSTS = new Set(['boards.greenhouse.io', 'job-boards.greenhouse.io']);

function fail(message: string): BoardLink {
	return { ok: false, message };
}

function segments(url: URL): string[] {
	return url.pathname.split('/').filter((part) => part !== '');
}

/** The board name from one path segment, or null if it isn't a usable name. */
function tokenFrom(raw: string | undefined | null): string | null {
	if (raw === undefined || raw === null) return null;
	let decoded: string;
	try {
		decoded = decodeURIComponent(raw);
	} catch {
		return null;
	}
	const token = decoded.trim().toLowerCase();
	return TOKEN.test(token) ? token : null;
}

function found(source: Source, raw: string | undefined | null): BoardLink {
	const token = tokenFrom(raw);
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
	if (host.endsWith('.greenhouse.io') || host.endsWith('.ashbyhq.com')) {
		return fail(`Job Ranger can't read boards on ${host} yet. Try a link like ${EXAMPLE}.`);
	}
	return fail(
		`Job Ranger reads Ashby and Greenhouse boards, and that link is on ${host}. If the company's careers page has a link to jobs.ashbyhq.com or job-boards.greenhouse.io, paste that one.`
	);
}
