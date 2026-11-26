/**
 * The keyword baseline (design note 0008, Options considered): no model,
 * free and predictable. It counts my skills and interest keywords that
 * appear as whole words in the job's title, team and posting. The evals
 * compare the model against it; the model has to beat it to earn its cost.
 */
import { normalize } from '#lib/jobs/interest-match.ts';
import type { Profile, ScoringJob } from './score.ts';

/** Matches needed for each score: 0 → 1, 1 → 2, 2–3 → 3, 4–5 → 4, 6 or more → 5. */
const STEPS = [0, 1, 2, 4, 6] as const;

export interface BaselineScore {
	readonly score: number;
	/** The terms found, each once, in the order first found. */
	readonly matched: readonly string[];
}

export function baselineScore(job: ScoringJob, profile: Profile): BaselineScore {
	// A period that ends a sentence breaks a word ("drones."); one inside a word stays (".NET").
	const text = normalize(
		[job.title, job.department ?? '', job.postingText].join(' ').replace(/\.(?=\s|$)/g, ' ')
	);
	const terms = [
		...profile.facts.filter((fact) => fact.kind === 'skill').map((fact) => fact.text),
		...profile.interests.flatMap((interest) => interest.keywords)
	]
		.map((term) => normalize(term).trim())
		.filter((term) => term !== '');
	const matched = [...new Set(terms)].filter((term) => text.includes(` ${term} `));
	const score = STEPS.filter((needed) => matched.length >= needed).length;
	return { score, matched };
}
