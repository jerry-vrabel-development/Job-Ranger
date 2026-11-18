import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isToken, nameFromToken, parseBoardLink } from './board-link.ts';

describe('parseBoardLink', () => {
	it.each([
		['https://jobs.ashbyhq.com/suno', 'ashby', 'suno'],
		['jobs.ashbyhq.com/suno', 'ashby', 'suno'],
		['  https://jobs.ashbyhq.com/Suno/  ', 'ashby', 'suno'],
		['https://jobs.ashbyhq.com/suno/0b6e2f1c-0000/application?utm_source=x', 'ashby', 'suno'],
		['https://jobs.ashbyhq.com/civic%20roundtable', 'ashby', 'civic roundtable'],
		['https://api.ashbyhq.com/posting-api/job-board/suno', 'ashby', 'suno'],
		['https://job-boards.greenhouse.io/splice', 'greenhouse', 'splice'],
		['https://job-boards.greenhouse.io/splice/jobs/4206440009', 'greenhouse', 'splice'],
		['http://boards.greenhouse.io/distrokid', 'greenhouse', 'distrokid'],
		['https://boards.greenhouse.io/embed/job_board?for=bitfocus', 'greenhouse', 'bitfocus'],
		['HTTPS://JOB-BOARDS.GREENHOUSE.IO/Splice', 'greenhouse', 'splice'],
		['https://boards-api.greenhouse.io/v1/boards/thedutchie/jobs', 'greenhouse', 'thedutchie'],
		['https://jobs.lever.co/skydio', 'lever', 'skydio'],
		// Lever's board names are case-sensitive, so they are kept as written.
		['jobs.lever.co/BluesInc/0f1e2d3c-aaaa-4bbb-8ccc-123456789abc/apply', 'lever', 'BluesInc'],
		['https://api.lever.co/v0/postings/BluesInc?mode=json', 'lever', 'BluesInc'],
		['https://community-solutions.breezy.hr/', 'breezy', 'community-solutions'],
		['swing-left.breezy.hr/p/6291cb2086e1-organizer', 'breezy', 'swing-left'],
		['https://SWING-LEFT.breezy.hr', 'breezy', 'swing-left'],
		['https://app.breezy.hr/json/community-solutions', 'breezy', 'community-solutions'],
		['https://app.breezy.hr/swing-left', 'breezy', 'swing-left'],
		['https://api.lever.co/v0/postings/skydio?mode=json', 'lever', 'skydio']
	] as const)('reads %s', (link, source, token) => {
		expect(parseBoardLink(link)).toEqual({ ok: true, source, token });
	});

	it.each([
		['', /^Paste a job board link/],
		['   ', /^Paste a job board link/],
		['not a link at all', /^That doesn't look like a link/],
		['ftp://jobs.ashbyhq.com/suno', /^That doesn't look like a web link/],
		['https://jobs.ashbyhq.com/', /^That Ashby link doesn't name a board/],
		['https://job-boards.greenhouse.io/', /^That Greenhouse link doesn't name a board/],
		['https://boards.greenhouse.io/embed/job_board', /^That Greenhouse link doesn't name a board/],
		['https://jobs.ashbyhq.com/%E0%A4%A', /^That Ashby link doesn't name a board/],
		['https://jobs.ashbyhq.com/bad!name', /^That Ashby link doesn't name a board/],
		['https://api.ashbyhq.com/other/suno', /can't read boards on api\.ashbyhq\.com yet/],
		['https://boards-api.greenhouse.io/v2/boards/x', /can't read boards on boards-api/],
		['https://job-boards.eu.greenhouse.io/splice', /can't read boards on job-boards\.eu/],
		['https://jobs.eu.lever.co/somecompany', /can't read boards on jobs\.eu\.lever\.co yet/],
		['https://api.lever.co/v1/postings/x', /can't read boards on api\.lever\.co yet/],
		['https://jobs.lever.co/', /^That Lever link doesn't name a board/],
		['https://a.b.breezy.hr/', /can't read boards on a\.b\.breezy\.hr yet/],
		['https://app.breezy.hr/json/bad_name', /^That Breezy link doesn't name a board/],
		['https://breezy.hr/careers', /that link is on breezy\.hr/],
		['https://www.splice.com/careers?gh_jid=123', /that link is on www\.splice\.com/],
		['https://jobs.ashbyhq.com.evil.example/suno', /that link is on jobs\.ashbyhq\.com\.evil/],
		[`https://jobs.ashbyhq.com/${'a'.repeat(2000)}`, /^That link is too long/]
	])('explains why %s is not a board link', (link, message) => {
		const parsed = parseBoardLink(link);
		expect(parsed.ok).toBe(false);
		if (!parsed.ok) expect(parsed.message).toMatch(message);
	});

	it('only ever reads a board on the known hosts, whatever link it is given', () => {
		const known = [
			'jobs.ashbyhq.com',
			'api.ashbyhq.com',
			'boards.greenhouse.io',
			'job-boards.greenhouse.io',
			'boards-api.greenhouse.io',
			'jobs.lever.co',
			'api.lever.co',
			'app.breezy.hr'
		];
		fc.assert(
			fc.property(fc.webUrl({ withQueryParameters: true, withFragments: true }), (link) => {
				const parsed = parseBoardLink(link);
				const host = new URL(link).hostname.toLowerCase();
				// Either it's refused, or it's on a known host with a valid board name.
				const knownHost = known.includes(host) || /^[^.]+\.breezy\.hr$/.test(host);
				expect(!parsed.ok || (knownHost && isToken(parsed.token, parsed.source))).toBe(true);
			})
		);
	});

	it('reads back any valid board name from a Greenhouse link', () => {
		const token = fc.stringMatching(/^[a-z0-9][a-z0-9._-]{0,40}$/);
		fc.assert(
			fc.property(token, (name) => {
				expect(parseBoardLink(`https://job-boards.greenhouse.io/${name}`)).toEqual({
					ok: true,
					source: 'greenhouse',
					token: name
				});
			})
		);
	});
});

describe('isToken', () => {
	it('accepts stored board names and nothing else', () => {
		expect(isToken('splice')).toBe(true);
		expect(isToken('civic roundtable')).toBe(true);
		expect(isToken('Splice')).toBe(false);
		expect(isToken('BluesInc', 'lever')).toBe(true);
		expect(isToken('BluesInc', 'greenhouse')).toBe(false);
		expect(isToken('-x', 'lever')).toBe(false);
		expect(isToken('community-solutions', 'breezy')).toBe(true);
		expect(isToken('a.b', 'breezy')).toBe(false);
		expect(isToken('a b', 'breezy')).toBe(false);
		expect(isToken('')).toBe(false);
		expect(isToken('-x')).toBe(false);
		expect(isToken('a/b')).toBe(false);
		expect(isToken('a'.repeat(101))).toBe(false);
		expect(isToken(7)).toBe(false);
		expect(isToken(null)).toBe(false);
	});
});

describe('nameFromToken', () => {
	it.each([
		['splice', 'Splice'],
		['civic roundtable', 'Civic Roundtable'],
		['veo-corporate_careers', 'Veo Corporate Careers'],
		['a..b', 'A B'],
		['4dx', '4dx']
	])('makes %s into %s', (token, name) => {
		expect(nameFromToken(token)).toBe(name);
	});
});
