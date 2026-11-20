/**
 * Picks and orders confirmed facts into a resume for one job (design note
 * 0004, step 3b). Plain code, no model: a fact ranks higher the more of the
 * job's words it shares (title words count most, then the team, then the
 * posting). It never writes or changes a fact; it only chooses.
 */
import type { Experience, Kind } from '#lib/facts.ts';
import { skillsIn, words } from './skills.ts';

export interface ResumeFact {
	readonly id: number;
	readonly kind: Kind;
	readonly experience: Experience;
	readonly organization: string;
	readonly period: string;
	readonly text: string;
}

export interface JobText {
	readonly title: string;
	readonly department: string | null;
	/** The posting's text and the form's questions, as far as the kit has them. */
	readonly text: string;
}

/** What a kit knows of a job's words: the posting's text and the form's questions. */
export function jobTextOf(
	posting: { readonly title: string; readonly department: string | null },
	kit: {
		readonly questions: readonly { readonly label: string }[];
		readonly pasted: readonly string[];
		readonly postingText: string;
	} | null
): JobText {
	const questions = kit === null ? [] : [...kit.questions.map((q) => q.label), ...kit.pasted];
	return {
		title: posting.title,
		department: posting.department,
		text: [kit?.postingText ?? '', ...questions].join(' ')
	};
}

export interface RoleSection {
	readonly role: ResumeFact;
	readonly accomplishments: readonly ResumeFact[];
}

export interface ProjectSection {
	readonly project: ResumeFact;
	readonly accomplishments: readonly ResumeFact[];
}

export interface Resume {
	readonly summary: readonly ResumeFact[];
	readonly roles: readonly RoleSection[];
	readonly projects: readonly ProjectSection[];
	readonly skills: readonly ResumeFact[];
	readonly education: readonly ResumeFact[];
	readonly links: readonly ResumeFact[];
	/** The job's words that the chosen facts share, most weight first. */
	readonly pickedFor: readonly string[];
	/** Skills the job names that no confirmed fact mentions. */
	readonly gaps: readonly string[];
}

export const PER_ROLE = 4;
export const PROJECTS = 3;
export const PER_PROJECT = 2;
export const SUMMARY = 2;

const STOP = new Set(
	`the and for with you your our are will that this from have has who what when where how all any can
	not but about into more than they them their its it's our we're you'll able work working team teams
	role roles job jobs years year experience including include etc new using use used based help helps
	across within while also other such each well very just like make makes made build building built
	senior junior lead staff principal remote hybrid full time part contract company
	engineer engineers engineering developer developers software`
		.split(/\s+/)
		.filter((word) => word !== '')
);

/** Word weights from the job: 3 for the title, 2 for the team, 1 for the rest. */
export function jobWords(job: JobText): Map<string, number> {
	const weights = new Map<string, number>();
	const add = (text: string, weight: number) => {
		for (const word of words(text).split(' ')) {
			if (word.length < 3 && !/^(ai|ui|ux|qa|go|ml|c#|r&d)$/.test(word)) continue;
			if (STOP.has(word) || /^[0-9]+$/.test(word)) continue;
			weights.set(word, Math.max(weights.get(word) ?? 0, weight));
		}
	};
	add(job.text, 1);
	add(job.department ?? '', 2);
	add(job.title, 3);
	return weights;
}

function score(fact: ResumeFact, weights: ReadonlyMap<string, number>): number {
	let total = 0;
	for (const word of new Set(words(`${fact.text} ${fact.organization}`).split(' '))) {
		total += weights.get(word) ?? 0;
	}
	return total;
}

/** Newest first, by the first four-digit year in "when"; undated last. */
function newestFirst(a: ResumeFact, b: ResumeFact): number {
	const year = (fact: ResumeFact) => {
		if (/present|now|current/i.test(fact.period)) return 9999;
		const years = fact.period.match(/\d{4}/g);
		return years ? Math.max(...years.map(Number)) : -1;
	};
	return year(b) - year(a) || a.id - b.id;
}

function best<T extends ResumeFact>(
	facts: readonly T[],
	weights: ReadonlyMap<string, number>,
	limit: number
): T[] {
	return facts
		.map((fact) => ({ fact, points: score(fact, weights) }))
		.sort((a, b) => b.points - a.points || a.fact.id - b.fact.id)
		.slice(0, limit)
		.map(({ fact }) => fact);
}

const sameOrg = (a: ResumeFact, b: ResumeFact) =>
	a.organization !== '' && a.organization.toLowerCase() === b.organization.toLowerCase();

/** Builds the resume from confirmed facts. */
export function buildResume(facts: readonly ResumeFact[], job: JobText): Resume {
	const weights = jobWords(job);
	const of = (kind: Kind) => facts.filter((fact) => fact.kind === kind);
	const accomplishments = of('accomplishment');

	const roles = of('role')
		.filter((role) => role.experience === 'professional')
		.sort(newestFirst)
		.map((role) => ({
			role,
			accomplishments: best(
				accomplishments.filter((a) => sameOrg(a, role)),
				weights,
				PER_ROLE
			)
		}));
	const projects = of('project')
		.map((project) => {
			const own = accomplishments.filter((a) => sameOrg(a, project));
			const points = score(project, weights) + own.reduce((sum, a) => sum + score(a, weights), 0);
			return { project, accomplishments: best(own, weights, PER_PROJECT), points };
		})
		.sort((a, b) => b.points - a.points || a.project.id - b.project.id)
		.slice(0, PROJECTS)
		.map(({ project, accomplishments: chosen }) => ({ project, accomplishments: chosen }));
	const summary = best(
		of('other').filter((fact) => fact.experience === 'professional'),
		weights,
		SUMMARY
	);
	const skills = best(of('skill'), weights, Number.POSITIVE_INFINITY);

	const chosen = [
		...summary,
		...roles.flatMap((r) => [r.role, ...r.accomplishments]),
		...projects.flatMap((p) => [p.project, ...p.accomplishments]),
		...skills
	];
	const shared = new Set(
		chosen.flatMap((fact) => words(`${fact.text} ${fact.organization}`).split(' '))
	);
	const pickedFor = [...weights]
		.filter(([word]) => shared.has(word))
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, 12)
		.map(([word]) => word);

	const known = new Set(
		skillsIn(facts.map((fact) => fact.text).join(' ')).map((s) => s.toLowerCase())
	);
	const gaps = skillsIn(`${job.title} ${job.department ?? ''} ${job.text}`).filter(
		(skill) => !known.has(skill.toLowerCase())
	);

	return {
		summary,
		roles,
		projects,
		skills,
		education: of('education').sort(newestFirst),
		links: of('link'),
		pickedFor,
		gaps
	};
}
