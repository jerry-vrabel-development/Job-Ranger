/**
 * The fixed eval set (design note 0008, section 7): made-up postings with
 * known answers, scored against a made-up profile. Labels from my own use
 * are the real test, but they're few and they drift; this set is the same
 * every run, so a change to the prompt, schema or model can be compared on
 * equal ground.
 *
 * The profile is shaped like mine (a TypeScript and accessibility developer
 * after remote, public-interest work) but isn't mine: the repo is public,
 * and editing my Facts page shouldn't move the set. Every company is made up.
 *
 * Three kinds of case:
 * - fit: a careful reader would want it (score 4 or 5).
 * - miss: a careful reader wouldn't (score 1 or 2).
 * - trap: looks like a fit on the surface and isn't, or the other way
 *   round. These are where reading beats keyword matching: a perfect title
 *   with the wrong skills; a dream employer with a role far off; my skills
 *   named only as nice to have; the right work in other words.
 *
 * Changing a case or its expected range is a decision, said in the PR.
 */
import type { Profile, ScoringJob } from '#lib/scoring/score.ts';

export type CaseKind = 'fit' | 'miss' | 'trap';

/** The scores a careful reader would accept, inclusive. */
export interface Expected {
	readonly min: number;
	readonly max: number;
}

export interface FixedCase {
	readonly id: string;
	readonly kind: CaseKind;
	/** What the case tests, in a few words. */
	readonly name: string;
	readonly job: ScoringJob;
	readonly expected: Expected;
}

const FIT: Expected = { min: 4, max: 5 };
const MISS: Expected = { min: 1, max: 2 };
const AT_MOST_MAYBE: Expected = { min: 1, max: 3 };

export const FIXED_PROFILE: Profile = {
	facts: [
		{
			id: 1,
			kind: 'role',
			experience: 'professional',
			organization: 'A regional staffing firm',
			period: '2009–2018',
			text: 'Led a team of eight recruiters placing software engineers.'
		},
		{
			id: 2,
			kind: 'skill',
			experience: 'side',
			organization: '',
			period: '',
			text: 'TypeScript'
		},
		{
			id: 3,
			kind: 'skill',
			experience: 'side',
			organization: '',
			period: '',
			text: 'Svelte'
		},
		{
			id: 4,
			kind: 'skill',
			experience: 'side',
			organization: '',
			period: '',
			text: 'Cloudflare Workers'
		},
		{
			id: 5,
			kind: 'skill',
			experience: 'side',
			organization: '',
			period: '',
			text: 'WCAG'
		},
		{
			id: 6,
			kind: 'skill',
			experience: 'side',
			organization: '',
			period: '',
			text: 'Playwright'
		},
		{
			id: 7,
			kind: 'project',
			experience: 'side',
			organization: 'Own project',
			period: '2025–2026',
			text: 'Built and run a job-search web app on Cloudflare Workers and D1, with full test coverage and WCAG 2.2 AA checks in CI.'
		},
		{
			id: 8,
			kind: 'skill',
			experience: 'learning',
			organization: '',
			period: '',
			text: 'Python'
		}
	],
	interests: [
		{
			id: 1,
			name: 'Civic tech',
			note: 'Software that helps people use public services.',
			keywords: ['civic tech', 'government services', 'public benefits']
		},
		{
			id: 2,
			name: 'Accessibility',
			note: 'Making the web usable by everyone.',
			keywords: ['accessibility', 'accessible', 'screen reader']
		}
	],
	preferences: {
		where: 'Remote, in the US',
		level: 'Mid-level or Senior',
		looking_for: 'A small team building public-interest software.'
	}
};

const job = (
	title: string,
	company: string,
	workplace: string,
	location: string,
	department: string | null,
	lines: readonly string[]
): ScoringJob => ({
	title,
	company,
	workplace,
	location,
	department,
	postingText: lines.join('\n')
});

export const FIXED_CASES: readonly FixedCase[] = [
	{
		id: 'fit-civic-forms',
		kind: 'fit',
		name: 'civic forms in my stack',
		expected: FIT,
		job: job(
			'Frontend Engineer, Benefits Forms',
			'Plainform Civic',
			'remote',
			'Remote - US',
			'Engineering',
			[
				'Plainform Civic is a 20-person nonprofit that builds the forms people use to apply for public benefits.',
				'You will build accessible forms in TypeScript and Svelte, and test them with Playwright and a screen reader.',
				'Requirements: TypeScript; a modern component framework (we use Svelte); working knowledge of WCAG 2.2.',
				'Fully remote within the US. Salary $115,000–$135,000.'
			]
		)
	},
	{
		id: 'fit-accessibility',
		kind: 'fit',
		name: 'accessibility engineer, remote',
		expected: FIT,
		job: job(
			'Accessibility Engineer',
			'Kestrel Access',
			'remote',
			'Remote (United States)',
			'Product',
			[
				'Kestrel Access helps state agencies make their websites usable by everyone.',
				'You will audit sites against WCAG 2.2 AA, fix what you find in TypeScript, and add automated checks with Playwright and axe.',
				'You have shipped web work that people with disabilities rely on, and you can explain a finding to a non-technical client.',
				'Remote, US only. Small team of twelve.'
			]
		)
	},
	{
		id: 'fit-edge-app',
		kind: 'fit',
		name: 'small public-interest team on Workers',
		expected: FIT,
		job: job('Full-Stack Engineer', 'Tidewell', 'remote', 'Remote, US', null, [
			'Tidewell is a small public-interest startup helping renters find assistance programs.',
			'Our stack is TypeScript on Cloudflare Workers with D1, and a SvelteKit front end.',
			'You will own features end to end, write tests first, and keep every page accessible.',
			'Remote in the US. We hire for what you can build, not for a degree.'
		])
	},
	{
		id: 'miss-firmware',
		kind: 'miss',
		name: 'firmware, on site',
		expected: MISS,
		job: job('Firmware Engineer II', 'Brightgauge Devices', 'on-site', 'Fremont, CA', 'Hardware', [
			'Write C for battery-powered sensors running an RTOS.',
			'Required: 3+ years of embedded C, oscilloscope and logic analyzer use, a BS in Electrical or Computer Engineering.',
			'On site in Fremont five days a week.'
		])
	},
	{
		id: 'miss-sales',
		kind: 'miss',
		name: 'a sales job',
		expected: MISS,
		job: job('Account Executive, Mid-Market', 'Quotamill', 'hybrid', 'Chicago, IL', 'Sales', [
			'Own a $1.2M annual quota selling our payroll software to mid-market companies.',
			'Required: 3+ years of closing SaaS deals, Salesforce, and comfort with 60 calls a day.',
			'Hybrid, three days a week in our Chicago office.'
		])
	},
	{
		id: 'miss-research',
		kind: 'miss',
		name: 'research science with a PhD required',
		expected: MISS,
		job: job(
			'Senior Research Scientist, Vision',
			'Vantor Analytics',
			'on-site',
			'Boston, MA',
			'Research',
			[
				'Train and evaluate large vision models for retail shelf analytics.',
				'Required: a PhD in machine learning or a related field, first-author papers at top venues, and deep PyTorch experience.',
				'On site in Boston.'
			]
		)
	},
	{
		id: 'trap-title',
		kind: 'trap',
		name: 'perfect title, wrong skills',
		expected: AT_MOST_MAYBE,
		job: job('Senior Frontend Engineer', 'Corvel Retail', 'on-site', 'Dallas, TX', 'E-commerce', [
			'Join the team behind our checkout.',
			'Required: 6+ years of Angular, 4+ years of Java and Spring Boot for our backend-for-frontend services, and experience leading a team of engineers.',
			'Our front end is written in TypeScript.',
			'On site in Dallas four days a week.'
		])
	},
	{
		id: 'trap-dream-employer',
		kind: 'trap',
		name: 'dream employer, role far off',
		expected: MISS,
		job: job('Grants Manager', 'Plainform Civic', 'remote', 'Remote - US', 'Development', [
			'Plainform Civic builds accessible civic tech that helps people apply for public benefits and use government services.',
			'As Grants Manager you will write foundation grant proposals, track reporting deadlines, and manage our relationships with funders.',
			'Required: 5+ years of nonprofit grant writing with a record of awards over $250,000.',
			'Remote within the US.'
		])
	},
	{
		id: 'trap-nice-to-have',
		kind: 'trap',
		name: 'my skills only as nice to have',
		expected: AT_MOST_MAYBE,
		job: job('Platform Engineer', 'Ferrous Cloud', 'remote', 'Remote, US', 'Infrastructure', [
			'Run the Kubernetes platform our 300 engineers deploy to.',
			'Required: 5+ years of Go, Kubernetes operators, Terraform, and on-call for production systems at scale.',
			'Nice to have: TypeScript, Svelte, Playwright, Cloudflare Workers, WCAG, an interest in accessibility or civic tech.',
			'Remote in the US.'
		])
	},
	{
		id: 'trap-plain-words',
		kind: 'trap',
		name: 'the right work, in other words',
		expected: FIT,
		job: job('Web Developer', 'Lanternway', 'remote', 'Remote — anywhere in the US', null, [
			'Lanternway is a team of nine helping people sign up for food and housing help online.',
			'You will build web forms that work for everyone, including people who use assistive technology or only have a phone.',
			'You write typed JavaScript, test in real browsers, and care about plain language.',
			'Our app runs on serverless functions at the edge with a small SQL database.',
			'Remote. Self-taught developers are welcome.'
		])
	},
	{
		id: 'trap-on-site',
		kind: 'trap',
		name: 'right skills, on site only',
		expected: AT_MOST_MAYBE,
		job: job(
			'Frontend Developer (On-site)',
			'Harrow County Digital Services',
			'on-site',
			'Harrow, OR',
			'County IT',
			[
				'Build accessible county websites in TypeScript and Svelte, tested with Playwright against WCAG 2.2.',
				'This role is on site at the county office five days a week. Remote work is not available, and we can’t help with relocation.'
			]
		)
	},
	{
		id: 'trap-manager',
		kind: 'trap',
		name: 'right field, far above my level',
		expected: AT_MOST_MAYBE,
		job: job(
			'Director of Engineering',
			'Kestrel Access',
			'remote',
			'Remote (United States)',
			'Engineering',
			[
				'Lead four engineering managers and 40 engineers building accessible software for state agencies.',
				'Required: 10+ years of software engineering and 5+ years managing managers; you have owned an engineering budget.',
				'Our stack is TypeScript, Svelte and Playwright.',
				'Remote in the US.'
			]
		)
	},
	{
		id: 'trap-empty',
		kind: 'trap',
		name: 'a posting that says nothing',
		expected: AT_MOST_MAYBE,
		job: job('Software Engineer', 'Ruddle Systems', 'remote', 'Remote', null, [
			'We’re hiring great engineers. Apply now!'
		])
	}
];

export interface CaseResult {
	readonly id: string;
	readonly kind: CaseKind;
	/** Null when there was no usable answer, which never passes. */
	readonly score: number | null;
	readonly pass: boolean;
}

export function inRange(score: number | null, expected: Expected): boolean {
	return score !== null && score >= expected.min && score <= expected.max;
}

/** Each case against what a scorer gave it; a case it didn't score fails. */
export function checkFixedSet(
	scores: ReadonlyMap<string, number | null>,
	cases: readonly FixedCase[] = FIXED_CASES
): CaseResult[] {
	return cases.map(({ id, kind, expected }) => {
		const score = scores.get(id) ?? null;
		return { id, kind, score, pass: inRange(score, expected) };
	});
}
