/**
 * The site's name and the words used about it, in one place, so the page,
 * the tab title and the tests agree.
 */
export const SITE = {
	name: 'Job Ranger',
	description:
		'Finds and ranks jobs against your own rules, tracks every application, and flags scams, ghost jobs and missing pay, with the evidence.',
	repository: 'https://github.com/jerry-vrabel-development/Job-Ranger',
	designNote:
		'https://github.com/jerry-vrabel-development/Job-Ranger/blob/dev/docs/design/0001-job-ranger.md'
} as const;

/** A page's tab title: the page first, then the site, so tabs stay readable. */
export function pageTitle(page?: string): string {
	const name = page?.trim();
	return name ? `${name} · ${SITE.name}` : SITE.name;
}
