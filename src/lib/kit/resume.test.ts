import { describe, expect, it } from 'vitest';
import { buildResume, jobTextOf, jobWords, type ResumeFact } from './resume.ts';

let next = 0;
const fact = (over: Partial<ResumeFact>): ResumeFact => ({
	id: ++next,
	kind: 'accomplishment',
	experience: 'professional',
	organization: '',
	period: '',
	text: 'A fact.',
	...over
});

const himssRole = fact({
	kind: 'role',
	organization: 'HIMSS',
	period: 'Oct 2018–Jan 2020',
	text: 'Lead Engineer'
});
const fwdRole = fact({
	kind: 'role',
	organization: 'Forwardslash',
	period: '2003–present',
	text: 'Founder'
});
const fjRole = fact({
	kind: 'role',
	organization: 'Farm Journal',
	period: '2017–2018',
	text: 'Senior Web Developer'
});
const sideRole = fact({ kind: 'role', experience: 'side', text: 'Hobby role' });
const undated = fact({ kind: 'role', organization: 'Somewhere', text: 'Volunteer' });
const himss = [1, 2, 3, 4, 5].map((n) =>
	fact({
		organization: 'himss',
		text: n === 5 ? 'Made the platform accessible (WCAG).' : `HIMSS work ${String(n)}.`
	})
);
const projects = ['Quest Log', 'Job Ranger', 'Allegedly', 'Fourth'].map((name) =>
	fact({ kind: 'project', experience: 'side', organization: name, text: `${name} project.` })
);
const rangerWins = [
	fact({ organization: 'Job Ranger', experience: 'side', text: 'Accessibility tests with axe.' }),
	fact({ organization: 'Job Ranger', experience: 'side', text: 'Daily cron.' }),
	fact({ organization: 'Job Ranger', experience: 'side', text: 'Svelte pages.' })
];
const summary = [
	fact({ kind: 'other', text: '20+ years building web platforms.' }),
	fact({ kind: 'other', text: 'I review every line and own accessibility.' }),
	fact({ kind: 'other', text: 'Third statement.' }),
	fact({ kind: 'other', experience: 'side', text: 'Side statement about accessibility.' })
];
const skills = [
	fact({ kind: 'skill', text: 'Languages: Python, PHP' }),
	fact({ kind: 'skill', text: 'Front end: Svelte, React, accessibility' }),
	fact({ kind: 'skill', experience: 'learning', text: 'Kubernetes' })
];
const education = [
	fact({ kind: 'education', organization: 'ISU', text: 'CS coursework' }),
	fact({ kind: 'education', organization: 'freeCodeCamp', period: '2016', text: 'Certification' })
];
const links = [fact({ kind: 'link', organization: 'GitHub', text: 'github.com/me' })];

const all = [
	himssRole,
	fwdRole,
	fjRole,
	sideRole,
	undated,
	...himss,
	...projects,
	...rangerWins,
	...summary,
	...skills,
	...education,
	...links
];
const job = {
	title: 'Senior Accessibility Engineer',
	department: 'Platform',
	text: 'We want Svelte and Kubernetes and Terraform. Accessibility matters.'
};

describe('jobWords', () => {
	it('weighs title words most, then the team, then the posting, without filler words', () => {
		const weights = jobWords(job);
		expect(weights.get('accessibility')).toBe(3);
		expect(weights.get('platform')).toBe(2);
		expect(weights.get('svelte')).toBe(1);
		expect(weights.has('senior')).toBe(false);
		expect(weights.has('engineer')).toBe(false);
		expect(weights.has('and')).toBe(false);
		expect(jobWords({ title: 'AI QA 2026 at', department: null, text: '' })).toEqual(
			new Map([
				['ai', 3],
				['qa', 3]
			])
		);
	});
});

describe('buildResume', () => {
	const resume = buildResume(all, job);

	it('lists professional roles newest first, undated last, side roles left out', () => {
		expect(resume.roles.map((r) => r.role.text)).toEqual([
			'Founder',
			'Lead Engineer',
			'Senior Web Developer',
			'Volunteer'
		]);
	});

	it('keeps the four accomplishments that fit best under each role, matching where in any case', () => {
		const lead = resume.roles[1];
		expect(lead?.accomplishments).toHaveLength(4);
		expect(lead?.accomplishments[0]?.text).toBe('Made the platform accessible (WCAG).');
		expect(resume.roles[0]?.accomplishments).toEqual([]);
	});

	it('keeps the three projects that fit best, each with its two best accomplishments', () => {
		expect(resume.projects.map((p) => p.project.organization)).toEqual([
			'Job Ranger',
			'Quest Log',
			'Allegedly'
		]);
		expect(resume.projects[0]?.accomplishments.map((a) => a.text)).toEqual([
			'Accessibility tests with axe.',
			'Svelte pages.'
		]);
	});

	it('picks up to two professional statements for the summary', () => {
		expect(resume.summary.map((f) => f.text)).toEqual([
			'I review every line and own accessibility.',
			'20+ years building web platforms.'
		]);
	});

	it('keeps every skill, education and link, best fit first', () => {
		expect(resume.skills[0]?.text).toBe('Front end: Svelte, React, accessibility');
		expect(resume.skills).toHaveLength(3);
		expect(resume.education.map((f) => f.text)).toEqual(['Certification', 'CS coursework']);
		expect(resume.links).toEqual(links);
	});

	it('says which job words drove the picks, and which named skills are missing', () => {
		expect(resume.pickedFor).toEqual(['accessibility', 'platform', 'kubernetes', 'svelte']);
		// Kubernetes is a (learning) fact, so only Terraform is a gap.
		expect(resume.gaps).toEqual(['Terraform']);
	});

	it('keeps facts from the same year in the order they were added', () => {
		const a = fact({ kind: 'education', period: '2010', text: 'First' });
		const b = fact({ kind: 'education', period: '2010', text: 'Second' });
		expect(buildResume([b, a], job).education.map((f) => f.text)).toEqual(['First', 'Second']);
	});

	it('copes with no facts at all', () => {
		expect(buildResume([], { title: 'Go developer', department: null, text: '' })).toEqual({
			summary: [],
			roles: [],
			projects: [],
			skills: [],
			education: [],
			links: [],
			pickedFor: [],
			gaps: ['Go']
		});
	});
});

describe('jobTextOf', () => {
	it('joins the posting text and every question', () => {
		expect(
			jobTextOf(
				{ title: 'Dev', department: 'Eng' },
				{ questions: [{ label: 'Why us?' }], pasted: ['Pay?'], postingText: 'We use Go.' }
			)
		).toEqual({ title: 'Dev', department: 'Eng', text: 'We use Go. Why us? Pay?' });
		expect(jobTextOf({ title: 'Dev', department: null }, null)).toEqual({
			title: 'Dev',
			department: null,
			text: ''
		});
	});
});
