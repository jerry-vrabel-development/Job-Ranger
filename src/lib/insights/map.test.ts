import { describe, expect, it } from 'vitest';
import shapes from '#lib/geo/us-states.json';
import { US_STATES } from '#lib/geo/states.ts';
import { mapStates, mapSummary, MAX_STEPS, neighbor, stateCounts } from './map.ts';

const NOW = '2026-11-25T12:00:00Z';
const jobs = (...locations: string[]) => locations.map((location) => ({ location }));

describe('the shapes', () => {
	it('has one outline per state, in the same order as US_STATES', () => {
		expect(shapes.states.map((s) => [s.code, s.name])).toEqual(
			US_STATES.map((s) => [s.code, s.name])
		);
		for (const state of shapes.states) expect(state.d).toMatch(/^M[\d.,LZM-]+$/);
	});
});

describe('stateCounts', () => {
	it('counts states, remote with no state, and locations naming no US state', () => {
		const counts = stateCounts(
			jobs(
				'Chicago, IL',
				'Remote - Illinois',
				'Denver, CO or Austin, TX',
				'Remote',
				'Remote (US)',
				'Work from anywhere',
				'London, United Kingdom',
				''
			)
		);
		expect(Object.fromEntries(counts.byState)).toEqual({ IL: 2, CO: 1, TX: 1 });
		expect(counts).toMatchObject({ remote: 3, elsewhere: 2, multi: 1, total: 8 });
	});

	it('counts a remote workplace with no state as remote, whatever the location says', () => {
		const counts = stateCounts([
			{ location: 'United States', workplace: 'remote' },
			{ location: 'United States', workplace: 'on-site' },
			{ location: 'Chicago, IL', workplace: 'remote' }
		]);
		expect(counts).toMatchObject({ remote: 1, elsewhere: 1 });
		expect(counts.byState.get('IL')).toBe(1);
	});

	it('reads Washington, DC as DC, not Washington state', () => {
		expect(Object.fromEntries(stateCounts(jobs('Washington, DC', 'Seattle, WA')).byState)).toEqual({
			DC: 1,
			WA: 1
		});
	});
});

describe('mapStates', () => {
	it('gives every state a step, its pay law and its words', () => {
		const { states } = mapStates(stateCounts(jobs('Chicago, IL', 'Peoria, IL', 'Austin, TX')), NOW);
		expect(states).toHaveLength(51);
		const il = states.find((s) => s.code === 'IL');
		const tx = states.find((s) => s.code === 'TX');
		const al = states.find((s) => s.code === 'AL');
		expect(il).toMatchObject({ count: 2, step: 2, payLaw: true });
		expect(il?.words).toBe('Illinois: 2 open jobs; pay-range law in effect');
		expect(tx).toMatchObject({ count: 1, step: 1, payLaw: false, words: 'Texas: 1 open job' });
		expect(al).toMatchObject({ count: 0, step: 0, words: 'Alabama: no open jobs' });
	});

	it('only marks laws already in effect', () => {
		const before = mapStates(stateCounts([]), '2020-01-01T00:00:00Z');
		expect(before.states.filter((s) => s.payLaw)).toEqual([]);
	});

	it('uses at most five steps, each holding at least one state, with real ranges', () => {
		const many = [1, 1, 1, 2, 3, 4, 5, 8, 13, 21, 40].flatMap((n, i) =>
			Array.from({ length: n }, () => `Somewhere, ${US_STATES[i]?.code ?? ''}`)
		);
		const { states, legend } = mapStates(stateCounts(jobs(...many)), NOW);
		expect(legend).toHaveLength(MAX_STEPS);
		expect(legend.map((l) => l.step)).toEqual([1, 2, 3, 4, 5]);
		expect(legend[0]?.label).toBe('1–2');
		expect(legend.at(-1)?.label).toBe('21–40');
		for (const { step } of legend) expect(states.some((s) => s.step === step)).toBe(true);
		const steps = states.filter((s) => s.count > 0).sort((a, b) => a.count - b.count);
		expect(steps.map((s) => s.step)).toEqual([...steps.map((s) => s.step)].sort());
	});

	it('uses fewer steps when fewer counts differ, and none with no jobs', () => {
		expect(mapStates(stateCounts(jobs('Chicago, IL', 'Austin, TX')), NOW).legend).toEqual([
			{ step: 1, label: '1' }
		]);
		expect(mapStates(stateCounts([]), NOW).legend).toEqual([]);
	});
});

describe('mapSummary', () => {
	it('names the top state and what sits beside the map', () => {
		expect(
			mapSummary(
				stateCounts(
					jobs('Chicago, IL', 'Peoria, IL', 'Denver, CO or Austin, TX', 'Remote', 'London, UK')
				)
			)
		).toBe(
			'Open jobs name 3 states; the most are in Illinois (2). Beside the map: 1 remote with no state; 1 naming no US state; 1 naming more than one, counted in each.'
		);
	});

	it('breaks ties by name and leaves out the extras when there are none', () => {
		expect(mapSummary(stateCounts(jobs('Austin, TX', 'Chicago, IL')))).toBe(
			'Open jobs name 2 states; the most are in Illinois (1).'
		);
		expect(mapSummary(stateCounts(jobs('Austin, TX')))).toBe(
			'Open jobs name 1 state; the most are in Texas (1).'
		);
	});

	it('says when nothing is on the map', () => {
		expect(mapSummary(stateCounts([]))).toBe('No open jobs to map right now.');
		expect(mapSummary(stateCounts(jobs('Remote')))).toBe(
			'No open job names a US state. Beside the map: 1 remote with no state.'
		);
	});
});

describe('neighbor', () => {
	const at = (code: string) => shapes.states.findIndex((s) => s.code === code);
	const code = (i: number | null) => (i === null ? null : shapes.states[i]?.code);

	it('moves to the nearest state in the arrow’s direction', () => {
		expect(code(neighbor(shapes.states, at('IL'), 'ArrowRight'))).toBe('IN');
		expect(code(neighbor(shapes.states, at('IN'), 'ArrowLeft'))).toBe('IL');
		expect(code(neighbor(shapes.states, at('IL'), 'ArrowUp'))).toBe('WI');
		expect(code(neighbor(shapes.states, at('KS'), 'ArrowDown'))).toBe('OK');
	});

	it('stays put rather than jump when nothing is within 45°', () => {
		expect(code(neighbor(shapes.states, at('FL'), 'ArrowDown'))).toBe('FL');
	});

	it('reaches every state, Alaska, Hawaii and DC included', () => {
		const seen = new Set([at('IL')]);
		const queue = [at('IL')];
		for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
			for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
				const next = neighbor(shapes.states, i, key) ?? i;
				if (!seen.has(next)) {
					seen.add(next);
					queue.push(next);
				}
			}
		}
		expect(seen.size).toBe(51);
	});

	it('stays put at the edge, and goes first and last with Home and End', () => {
		expect(code(neighbor(shapes.states, at('ME'), 'ArrowRight'))).toBe('ME');
		expect(code(neighbor(shapes.states, at('IL'), 'Home'))).toBe('AL');
		expect(code(neighbor(shapes.states, at('IL'), 'End'))).toBe('WY');
	});

	it('ignores other keys', () => {
		expect(neighbor(shapes.states, at('IL'), 'Enter')).toBeNull();
		expect(neighbor(shapes.states, 99, 'ArrowUp')).toBeNull();
	});
});
