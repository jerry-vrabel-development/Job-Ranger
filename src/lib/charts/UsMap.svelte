<!--
	The US map of open jobs by state (design note 0007). The shapes are
	us-states.json, made once by scripts/us-states.ts from us-atlas; the counts,
	steps and words come from #lib/insights/map.ts. Svelte draws the paths, all
	attributes, so the CSP stays strict and the map is complete without
	JavaScript.

	Never color alone: a state's count is in its name (aria-label), the readout,
	and the table; the color step only repeats it. Pay-range-law states also
	carry a hatch, which the legend names, and the table says Yes.

	Reading it: hover a state, or tab to the map and move with the arrow keys
	(the nearest state that way; Home and End for Alabama and Wyoming). The
	server sends only the numbers, in the same order as the shapes. The
	readout says the state, its count, and whether a pay-range law is in effect.
	"Show the numbers" lists every state with open jobs or a pay law, and the
	jobs that aren't on the map.
-->
<script lang="ts">
	import shapes from '#lib/geo/us-states.json';
	import { neighbor, type LegendStep, type MapState } from '#lib/insights/map.ts';

	let {
		title,
		summary,
		states,
		legend,
		remote,
		elsewhere
	}: {
		title: string;
		summary: string;
		states: readonly MapState[];
		legend: readonly LegendStep[];
		remote: number;
		elsewhere: number;
	} = $props();

	const id = $props.id();
	const hatch = `${id}-hatch`;

	/** The state being read: the one with the most jobs until I move. */
	const busiest = $derived(
		states.reduce((best, state, i) => (state.count > (states[best]?.count ?? 0) ? i : best), 0)
	);
	let chosen: number | null = $state(null);
	const index = $derived(chosen ?? busiest);
	const active = $derived(states[index]);

	let paths: SVGPathElement[] = $state([]);

	function onkeydown(event: KeyboardEvent) {
		const next = neighbor(shapes.states, index, event.key);
		if (next === null) return;
		event.preventDefault();
		chosen = next;
		paths[next]?.focus();
	}

	/** The outline for the state at i: states come in us-states.json's order. */
	const shape = (i: number) => shapes.states[i] ?? { d: '', x: 0 };
	/** Fade in west to east, over 0.6 seconds (Reveal.svelte). */
	const delay = (i: number) => Math.round((shape(i).x / shapes.width) * 60) / 100;

	const listed = $derived(states.filter((state) => state.count > 0 || state.payLaw));
</script>

<figure class="chart">
	<figcaption>
		<span class="title">{title}</span>
		<span class="summary">{summary}</span>
	</figcaption>

	<p class="readout" aria-hidden="true">{active?.words ?? ''}</p>

	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<svg
		class="map"
		viewBox={`0 0 ${String(shapes.width)} ${String(shapes.height)}`}
		width="100%"
		role="group"
		aria-label={`${title}. Use the arrow keys to move between states.`}
		{onkeydown}
	>
		<defs>
			<!-- A two-tone hatch: a light halo under a dark line reads on every step, in both themes. -->
			<pattern
				id={hatch}
				width="7"
				height="7"
				patternUnits="userSpaceOnUse"
				patternTransform="rotate(45)"
			>
				<line class="hatch-halo" x1="0" y1="0" x2="0" y2="7" />
				<line class="hatch-line" x1="0" y1="0" x2="0" y2="7" />
			</pattern>
		</defs>
		{#each states as state, i (state.code)}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<path
				bind:this={paths[i]}
				class={`state step-${String(state.step)}`}
				d={shape(i).d}
				role="img"
				aria-label={state.words}
				data-reveal="fade"
				data-delay={delay(i)}
				tabindex={i === index ? 0 : -1}
				onfocus={() => (chosen = i)}
				onpointerenter={() => (chosen = i)}
			/>
		{/each}
		{#each states as state, i (state.code)}
			{#if state.payLaw}
				<path
					class="law"
					d={shape(i).d}
					fill={`url(#${hatch})`}
					aria-hidden="true"
					data-reveal="fade"
					data-delay={delay(i)}
				/>
			{/if}
		{/each}
		{#if active}
			<!-- On top of its neighbors, so the whole outline shows. -->
			<path class="active" d={shape(index).d} aria-hidden="true" />
		{/if}
	</svg>

	<ul class="legend" aria-label="Key">
		<li>
			<svg class="swatch" aria-hidden="true" focusable="false" width="18" height="18">
				<rect class="step-0 edge" x="0.5" y="0.5" width="17" height="17" rx="3" />
			</svg>
			No open jobs
		</li>
		{#each legend as step (step.step)}
			<li>
				<svg class="swatch" aria-hidden="true" focusable="false" width="18" height="18">
					<rect class={`step-${String(step.step)}`} width="18" height="18" rx="3" />
				</svg>
				{step.label}
				{step.label === '1' ? 'job' : 'jobs'}
			</li>
		{/each}
		<li>
			<svg class="swatch" aria-hidden="true" focusable="false" width="18" height="18">
				<rect class="step-0" width="18" height="18" rx="3" />
				<rect width="18" height="18" rx="3" fill={`url(#${hatch})`} />
			</svg>
			Pay-range law in effect
		</li>
	</ul>

	<ul class="beside">
		<li><span class="number">{remote}</span> remote with no state</li>
		<li><span class="number">{elsewhere}</span> naming no US state</li>
	</ul>

	<details>
		<summary>Show the numbers</summary>
		<table>
			<caption class="visually-hidden">{title}</caption>
			<thead>
				<tr>
					<th scope="col">State</th>
					<th scope="col">Open jobs</th>
					<th scope="col">Pay-range law</th>
				</tr>
			</thead>
			<tbody>
				{#each listed as state (state.code)}
					<tr>
						<th scope="row">{state.name}</th>
						<td>{state.count}</td>
						<td>{state.payLaw ? 'Yes' : '—'}</td>
					</tr>
				{/each}
				<tr>
					<th scope="row">Remote, no state</th>
					<td>{remote}</td>
					<td>—</td>
				</tr>
				<tr>
					<th scope="row">No US state named</th>
					<td>{elsewhere}</td>
					<td>—</td>
				</tr>
			</tbody>
		</table>
	</details>
</figure>

<style>
	.chart {
		margin: 0;
		padding: 1rem 1.25rem;
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 8px;
	}

	figcaption {
		display: grid;
		gap: 0.25rem;
		margin-bottom: 0.75rem;
	}

	.title {
		font-weight: 700;
	}

	.summary {
		color: var(--muted);
	}

	.readout {
		margin: 0 0 0.5rem;
		min-height: 1.5em;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.map {
		display: block;
		height: auto;
		overflow: visible;
	}

	/* A surface-colored border is the gap between neighbors. */
	.state {
		stroke: var(--surface);
		stroke-width: 1;
		stroke-linejoin: round;
		cursor: default;
	}

	/* The SVG draws its own ring (.active), since an outline can't follow a path. */
	.state:focus-visible {
		outline: none;
	}

	.law {
		pointer-events: none;
	}

	.active {
		fill: none;
		stroke: var(--text);
		stroke-width: 2.5;
		stroke-linejoin: round;
		pointer-events: none;
	}

	.map:focus-within .active {
		stroke: var(--focus);
		stroke-width: 4;
	}

	.hatch-halo {
		stroke: var(--surface);
		stroke-width: 3;
	}

	.hatch-line {
		stroke: var(--text);
		stroke-width: 1.25;
	}

	.step-0 {
		fill: var(--chart-track);
	}
	.step-1 {
		fill: var(--ordinal-1);
	}
	.step-2 {
		fill: var(--ordinal-2);
	}
	.step-3 {
		fill: var(--ordinal-3);
	}
	.step-4 {
		fill: var(--ordinal-4);
	}
	.step-5 {
		fill: var(--ordinal-5);
	}

	.legend,
	.beside {
		list-style: none;
		margin: 0.75rem 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.25rem;
	}

	.legend li {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-variant-numeric: tabular-nums;
	}

	.swatch {
		flex: none;
	}

	/* The empty shade is close to the card, so its swatch gets an edge. */
	.edge {
		stroke: var(--rule);
	}

	.beside li {
		display: flex;
		gap: 0.375rem;
	}

	.number {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	details {
		margin-top: 1rem;
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
		padding: 0.375rem 0.5rem;
		border-bottom: 1px solid var(--rule);
	}
</style>
