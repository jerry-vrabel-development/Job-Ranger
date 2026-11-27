import { evalPage } from '#lib/evals/page.ts';
import { readRuns } from '#lib/evals/published.ts';
import type { PageServerLoad } from './$types';

/**
 * Published eval runs are files in the repo (evals/results/), bundled at
 * build time: a new run shows up with the deploy that commits it.
 */
const files = import.meta.glob('/evals/results/*.json', { eager: true, import: 'default' });

export const load: PageServerLoad = () => evalPage(readRuns(files));
