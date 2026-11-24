<!--
	A line chart of daily counts (design note 0007). D3 works out the geometry
	(#lib/charts/line.ts); Svelte draws it, all attributes, so the CSP stays
	strict. Reveal.svelte draws the line in as it scrolls into view. The y axis starts at 0, a day without a count is a gap, and the
	latest count is labeled at the end of the line.

	Reading it: the chart is a slider over the days. Hover, or focus it and use
	the arrow keys (Home and End for the first and last day), and the readout
	says the day and its count; screen readers announce the same words. "Show
	the numbers" has every day as a table, and works without JavaScript.
-->
<script lang="ts">
	import { lineGeometry, nearestIndex, type Box } from './line.ts';
	import { dayLabel, type Point } from '#lib/insights/trend.ts';

	let { label, data }: { label: string; data: readonly Point[] } = $props();

	let width = $state(600);
	const HEIGHT = 132;
	const box: Box = $derived({ width, height: HEIGHT, top: 10, right: 44, bottom: 24, left: 36 });
	const geometry = $derived(lineGeometry(data, box));
	const last = $derived(Math.max(0, data.length - 1));

	/** The day being read: the latest with a count until I move it. */
	let chosen: number | null = $state(null);
	let reading = $state(false);
	const index = $derived(chosen ?? geometry.end?.index ?? last);

	const sayDay = (i: number) => {
		const point = data[i];
		if (point === undefined) return 'No days yet';
		return point.count === null
			? `${dayLabel(point.day)}: no count that day`
			: `${dayLabel(point.day)}: ${String(point.count)} open`;
	};

	function onkeydown(event: KeyboardEvent) {
		const moves: Record<string, number> = {
			ArrowLeft: index - 1,
			ArrowDown: index - 1,
			ArrowRight: index + 1,
			ArrowUp: index + 1,
			Home: 0,
			End: last
		};
		const next = moves[event.key];
		if (next === undefined) return;
		event.preventDefault();
		reading = true;
		chosen = Math.min(last, Math.max(0, next));
	}

	function onpointermove(event: PointerEvent) {
		const target = event.currentTarget as Element;
		reading = true;
		chosen = nearestIndex(geometry.xs, event.clientX - target.getBoundingClientRect().left);
	}

	const crossX = $derived(geometry.xs[index] ?? 0);
	const crossY = $derived(geometry.ys[index] ?? null);
	const first = $derived(data[0]);
	const final = $derived(data.at(-1));
</script>

<div class="line-chart" bind:clientWidth={width}>
	<p class="readout" aria-hidden="true">{sayDay(index)}</p>
	<div
		class="plot"
		role="slider"
		tabindex="0"
		aria-label={`${label}, open jobs by day`}
		aria-valuemin={1}
		aria-valuemax={data.length}
		aria-valuenow={index + 1}
		aria-valuetext={sayDay(index)}
		{onkeydown}
		{onpointermove}
		onpointerleave={() => (reading = false)}
		onfocus={() => (reading = true)}
		onblur={() => {
			reading = false;
			chosen = null;
		}}
	>
		<svg viewBox={`0 0 ${String(width)} ${String(HEIGHT)}`} aria-hidden="true" focusable="false">
			{#each geometry.ticks as tick (tick.value)}
				<line class="grid" x1={box.left} x2={width - box.right} y1={tick.y} y2={tick.y} />
				<text class="axis" x={box.left - 6} y={tick.y} text-anchor="end" dominant-baseline="middle">
					{tick.value}
				</text>
			{/each}
			{#if first && final}
				<text class="axis" x={box.left} y={HEIGHT - 4}>{dayLabel(first.day)}</text>
				<text class="axis" x={width - box.right} y={HEIGHT - 4} text-anchor="end">
					{dayLabel(final.day)}
				</text>
			{/if}
			<path class="line" d={geometry.path} pathLength="1" data-reveal="line" />
			{#if geometry.end}
				<circle class="dot" cx={geometry.end.x} cy={geometry.end.y} r="4" />
				<text class="end" x={geometry.end.x + 8} y={geometry.end.y} dominant-baseline="middle">
					{data[geometry.end.index]?.count}
				</text>
			{/if}
			{#if reading}
				<line class="cross" x1={crossX} x2={crossX} y1={box.top} y2={HEIGHT - box.bottom} />
				{#if crossY !== null}
					<circle class="dot" cx={crossX} cy={crossY} r="5" />
				{/if}
			{/if}
		</svg>
	</div>
	<details>
		<summary>Show the numbers<span class="visually-hidden"> for {label}</span></summary>
		<table>
			<caption class="visually-hidden">{label}: open jobs by day</caption>
			<thead>
				<tr>
					<th scope="col">Day</th>
					<th scope="col">Open jobs</th>
				</tr>
			</thead>
			<tbody>
				{#each data as point (point.day)}
					<tr>
						<th scope="row">{dayLabel(point.day)}</th>
						<td>{point.count ?? 'No count'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</details>
</div>

<style>
	.line-chart {
		min-width: 0;
	}

	.readout {
		margin: 0 0 0.25rem;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}

	.plot {
		border-radius: 4px;
		touch-action: pan-y;
	}

	/* Fills its container and scales with it: until the page measures the real
	   width, the first drawing is scaled to fit rather than pushing the layout wide. */
	svg {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
	}

	.grid {
		stroke: var(--rule);
		stroke-width: 1;
	}

	.axis,
	.end {
		fill: var(--muted);
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
	}

	.end {
		fill: var(--text);
		font-weight: 600;
	}

	.line {
		fill: none;
		stroke: var(--series-1);
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
		/* With pathLength="1", Reveal.svelte draws the line in by moving the dash offset. */
		stroke-dasharray: 1;
	}

	/* A 2px ring in the surface color keeps the dot clear of the line. */
	.dot {
		fill: var(--series-1);
		stroke: var(--surface);
		stroke-width: 2;
	}

	.cross {
		stroke: var(--muted);
		stroke-width: 1;
	}

	details {
		margin-top: 0.5rem;
	}

	summary {
		cursor: pointer;
		min-height: 44px;
		display: flex;
		align-items: center;
		color: var(--accent);
		font-weight: 600;
	}

	table {
		border-collapse: collapse;
		width: 100%;
		font-variant-numeric: tabular-nums;
	}

	th,
	td {
		text-align: left;
		padding: 0.25rem 0.5rem;
		border-bottom: 1px solid var(--rule);
	}
</style>
