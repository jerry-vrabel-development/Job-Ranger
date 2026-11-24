/**
 * The geometry of a line chart of daily counts (design note 0007), worked
 * out with D3's scales and line generator. Only numbers and path strings
 * come out: Svelte draws the SVG, so everything is an attribute and the CSP
 * stays strict. Kept apart from the component so it's unit-tested.
 */
import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import type { Point } from '#lib/insights/trend.ts';

export interface Box {
	readonly width: number;
	readonly height: number;
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
	readonly left: number;
}

export interface LineGeometry {
	/** The SVG path of the line, with gaps where a day has no count. Empty if there are none. */
	readonly path: string;
	/** Each day's x, and its y (null on a gap). */
	readonly xs: readonly number[];
	readonly ys: readonly (number | null)[];
	/** Gridlines: clean values from 0 up. */
	readonly ticks: readonly { readonly value: number; readonly y: number }[];
	/** The last day with a count, for the end dot and its label. */
	readonly end: { readonly index: number; readonly x: number; readonly y: number } | null;
}

/**
 * The y axis always starts at 0: a count of open jobs drawn from a raised
 * floor would make a small change look like a big one.
 */
export function lineGeometry(data: readonly Point[], box: Box): LineGeometry {
	const counts = data.flatMap((p) => (p.count === null ? [] : [p.count]));
	const max = Math.max(1, ...counts);
	const x = scaleLinear()
		.domain([0, Math.max(1, data.length - 1)])
		.range([box.left, box.width - box.right]);
	const y = scaleLinear()
		.domain([0, max])
		.nice(3)
		.range([box.height - box.bottom, box.top]);
	const xs = data.map((_, i) => x(i));
	const ys = data.map((p) => (p.count === null ? null : y(p.count)));
	const draw = line<Point>()
		.defined((p) => p.count !== null)
		.x((_, i) => x(i))
		// .defined() skips the gaps, so count is a number here; Number() keeps the types honest.
		.y((p) => y(Number(p.count)));
	let end: LineGeometry['end'] = null;
	ys.forEach((value, index) => {
		if (value !== null) end = { index, x: x(index), y: value };
	});
	return {
		path: draw(data) ?? '',
		xs,
		ys,
		ticks: y.ticks(3).map((value) => ({ value, y: y(value) })),
		end
	};
}

/** The day nearest a pointer's x position. */
export function nearestIndex(xs: readonly number[], pointerX: number): number {
	const distances = xs.map((value) => Math.abs(value - pointerX));
	return Math.max(0, distances.indexOf(Math.min(...distances)));
}
