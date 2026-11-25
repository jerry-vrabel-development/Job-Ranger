/**
 * The map of open jobs by state (design note 0007). Plain functions over the
 * open jobs I watch, so every count and sentence is tested.
 *
 * Honest about what a location can say:
 * - A state comes from the location's text, read by the same matcher the pay
 *   signal uses (#lib/geo/states.ts).
 * - A job naming two states counts in both, and the page says how many did.
 * - Remote jobs with no state, and jobs naming no US state (another country,
 *   or text that can't be read), are counted beside the map, not guessed onto it.
 */
import { scaleQuantile } from 'd3-scale';
import shapes from '#lib/geo/us-states.json';
import { statesIn } from '#lib/geo/states.ts';
import type { Workplace } from '#lib/jobs/posting.ts';
import { PAY_LAWS } from '#lib/signals/pay-laws.ts';

export interface StateCounts {
	/** Open jobs naming each state, by postal code. */
	readonly byState: ReadonlyMap<string, number>;
	/** Jobs that say remote and name no state. */
	readonly remote: number;
	/** Jobs that name no US state and don't say remote. */
	readonly elsewhere: number;
	/** Jobs naming more than one state (counted in each). */
	readonly multi: number;
	readonly total: number;
}

const REMOTE = /\bremote\b|\banywhere\b/i;

export function stateCounts(
	jobs: readonly { readonly location: string; readonly workplace?: Workplace }[]
): StateCounts {
	const byState = new Map<string, number>();
	let remote = 0;
	let elsewhere = 0;
	let multi = 0;
	for (const job of jobs) {
		const states = statesIn(job.location);
		if (states.length === 0) {
			if (job.workplace === 'remote' || REMOTE.test(job.location)) remote += 1;
			else elsewhere += 1;
			continue;
		}
		if (states.length > 1) multi += 1;
		for (const state of states) byState.set(state.code, (byState.get(state.code) ?? 0) + 1);
	}
	return { byState, remote, elsewhere, multi, total: jobs.length };
}

/** At most this many color steps; fewer when fewer states have jobs. */
export const MAX_STEPS = 5;

/** A state's numbers, in us-states.json's order; the shapes stay in the component. */
export interface MapState {
	readonly code: string;
	readonly name: string;
	readonly count: number;
	/** 0 for no open jobs; otherwise 1 (fewest) to MAX_STEPS (most). */
	readonly step: number;
	/** A pay-range-in-postings law is in effect there today. */
	readonly payLaw: boolean;
	/** Said in words, for the readout and screen readers. */
	readonly words: string;
}

export interface LegendStep {
	readonly step: number;
	readonly label: string;
}

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/**
 * Every state with its shape and color step. Steps are quantiles of the
 * states that have jobs, so one big state can't push every other into the
 * lightest step; the legend gives each step's real range.
 */
export function mapStates(
	counts: StateCounts,
	now: string
): { states: MapState[]; legend: LegendStep[] } {
	const today = now.slice(0, 10);
	const laws = new Set(PAY_LAWS.filter((law) => law.effective <= today).map((law) => law.code));
	const values = [...counts.byState.values()];
	// Quantiles of the distinct counts, so each step holds at least one of them.
	const distinct = [...new Set(values)];
	const steps = Math.min(MAX_STEPS, distinct.length);
	const scale = scaleQuantile()
		.domain(distinct)
		.range(Array.from({ length: steps }, (_, i) => i + 1));
	const stepOf = (count: number) => (count === 0 ? 0 : scale(count));
	const states = shapes.states.map((state) => {
		const count = counts.byState.get(state.code) ?? 0;
		const payLaw = laws.has(state.code);
		return {
			code: state.code,
			name: state.name,
			count,
			step: stepOf(count),
			payLaw,
			words: `${state.name}: ${count === 0 ? 'no open jobs' : plural(count, 'open job', 'open jobs')}${payLaw ? '; pay-range law in effect' : ''}`
		};
	});
	const legend = Array.from({ length: steps }, (_, i) => {
		const inStep = values.filter((v) => stepOf(v) === i + 1);
		const low = Math.min(...inStep);
		const high = Math.max(...inStep);
		return { step: i + 1, label: low === high ? String(low) : `${String(low)}–${String(high)}` };
	});
	return { states, legend };
}

/** The map in one or two sentences. */
export function mapSummary(counts: StateCounts): string {
	if (counts.total === 0) return 'No open jobs to map right now.';
	const ranked = shapes.states
		.map((state) => ({ name: state.name, count: counts.byState.get(state.code) ?? 0 }))
		.filter((state) => state.count > 0)
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
	const top = ranked[0];
	const named =
		top === undefined
			? 'No open job names a US state.'
			: `Open jobs name ${plural(ranked.length, 'state', 'states')}; the most are in ${top.name} (${String(top.count)}).`;
	const beside = [
		...(counts.remote > 0 ? [`${String(counts.remote)} remote with no state`] : []),
		...(counts.elsewhere > 0 ? [`${String(counts.elsewhere)} naming no US state`] : []),
		...(counts.multi > 0 ? [`${String(counts.multi)} naming more than one, counted in each`] : [])
	];
	return beside.length === 0 ? named : `${named} Beside the map: ${beside.join('; ')}.`;
}

const DIRECTIONS: Record<string, readonly [number, number]> = {
	ArrowRight: [1, 0],
	ArrowLeft: [-1, 0],
	ArrowDown: [0, 1],
	ArrowUp: [0, -1]
};

/**
 * The state an arrow key moves to: the nearest center within 45° of that
 * direction (off to the side counts double). So Up from Illinois is Wisconsin,
 * not Indiana, which is only a little north. With nothing that way it stays
 * put, rather than jumping across the map. Home and End go to the first and
 * last state. Null for a key it doesn't use.
 */
export function neighbor(
	states: readonly { readonly x: number; readonly y: number }[],
	from: number,
	key: string
): number | null {
	if (key === 'Home') return 0;
	if (key === 'End') return states.length - 1;
	const direction = DIRECTIONS[key];
	const here = states[from];
	if (direction === undefined || here === undefined) return null;
	const [dx, dy] = direction;
	let best = from;
	let bestCost = Infinity;
	states.forEach((state, i) => {
		const ahead = (state.x - here.x) * dx + (state.y - here.y) * dy;
		const aside = Math.abs((state.x - here.x) * dy - (state.y - here.y) * dx);
		const cost = ahead + 2 * aside;
		if (ahead > 0 && aside <= ahead && cost < bestCost) {
			best = i;
			bestCost = cost;
		}
	});
	return best;
}
