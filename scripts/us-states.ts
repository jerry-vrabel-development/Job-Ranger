// Writes src/lib/geo/us-states.json: one SVG outline per state, for the map of
// open jobs (design note 0007). Run it with `npm run map:states` if the shapes
// ever need to change; the app only reads the JSON, so no map library ships.
//
// Source: us-atlas (US Census Bureau boundaries, public domain), already
// projected to Albers USA (Alaska and Hawaii inset) in a 975 x 610 frame.
// topojson-simplify keeps 10% of the points (shared borders stay shared), and
// d3-geo's geoPath turns each state into a path with one decimal place.
import { geoPath } from 'd3-geo';
import { writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import { presimplify, quantile, simplify } from 'topojson-simplify';
import type { GeometryCollection, Topology } from 'topojson-specification';
import atlas from 'us-atlas/states-albers-10m.json' with { type: 'json' };
import { US_STATES } from '../src/lib/geo/states.ts';

const KEEP = 0.1;
const topology = atlas as unknown as Topology<{ states: GeometryCollection }>;
const weighted = presimplify(topology);
const simplified = simplify(weighted, quantile(weighted, KEEP));
const path = geoPath().digits(1);
const round = (n: number) => Math.round(n * 10) / 10;
const outlines = new Map(
	feature(simplified, simplified.objects.states).features.map((f) => {
		const [x, y] = path.centroid(f);
		return [String(f.id), { d: path(f), x: round(x), y: round(y) }];
	})
);
// One entry per state in US_STATES' order, so the app needs no join.
const states = US_STATES.map((state) => {
	const outline = outlines.get(state.fips);
	if (!outline?.d) throw new Error(`No outline for ${state.name} (${state.fips})`);
	const { d, x, y } = outline;
	// Drop islands simplified down to a single point ("M1,2L1,2L1,2Z").
	return {
		code: state.code,
		name: state.name,
		d: d.replace(/M([\d.-]+,[\d.-]+)(?:L\1)+Z/g, ''),
		// Its center, for moving between states with the arrow keys.
		x,
		y
	};
});

const out = new URL('../src/lib/geo/us-states.json', import.meta.url);
writeFileSync(out, `${JSON.stringify({ width: 975, height: 610, keep: KEEP, states })}\n`);
console.log(`Wrote ${String(states.length)} states to ${out.pathname}`);
