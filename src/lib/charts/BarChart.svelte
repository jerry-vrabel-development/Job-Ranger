<!--
	Horizontal bars (design note 0007): one per row, measured against the
	largest, with the count and any detail written beside it. Ordered steps
	(a funnel) take the blue ramp, light to dark; plain categories (companies)
	take the one series color. Either way every row is named and counted in
	text, so nothing depends on telling colors apart. The bars are SVG, sized by
	attributes, so the CSP stays strict. "Show the numbers" gives the same
	figures as a table, and works without JavaScript. Motion comes from
	Reveal.svelte, as the chart scrolls into view.
-->
<script lang="ts">
	import type { Bar } from './types.ts';

	let {
		title,
		summary,
		rows,
		columns,
		ordinal = false,
		note = null,
		tableRows = null
	}: {
		title: string;
		summary: string;
		rows: readonly Bar[];
		/** The table's column headings. */
		columns: { readonly label: string; readonly count: string; readonly detail: string };
		/** Ordered steps take the ramp; categories take one color. */
		ordinal?: boolean;
		/** A line under the bars, such as what didn't fit. */
		note?: string | null;
		/** Rows for the table when it holds more than the bars (default: the same rows). */
		tableRows?: readonly Bar[] | null;
	} = $props();

	const largest = $derived(Math.max(0, ...rows.map((row) => row.count)));
	/** Width as a share of the largest. A row with any count stays visible. */
	const width = (count: number) =>
		count === 0 || largest === 0 ? 0 : Math.max(1.5, (count / largest) * 100);
	const tone = (i: number) => (ordinal ? `step-${String(Math.min(i + 1, 5))}` : 'series');
	const valueText = (row: Bar) =>
		row.detail === null ? String(row.count) : `${String(row.count)} · ${row.detail}`;
</script>

<figure class="chart">
	<figcaption>
		<span class="title">{title}</span>
		<span class="summary">{summary}</span>
	</figcaption>
	<ol class="bars">
		{#each rows as row, i (row.label)}
			<li>
				<span class="label">{row.label}</span>
				<svg class="track" aria-hidden="true" focusable="false" width="100%" height="16">
					{#if width(row.count) > 0}
						<g class={tone(i)} data-reveal="bar">
							<rect x="0" y="0" width={`${String(width(row.count))}%`} height="16" rx="4" />
							<!-- Square at the baseline, rounded at the data end. -->
							<rect x="0" y="0" width="4" height="16" />
						</g>
					{/if}
				</svg>
				<span class="value">{valueText(row)}</span>
			</li>
		{/each}
	</ol>
	{#if note}
		<p class="note">{note}</p>
	{/if}
	<details>
		<summary>Show the numbers</summary>
		<table>
			<caption class="visually-hidden">{title}</caption>
			<thead>
				<tr>
					<th scope="col">{columns.label}</th>
					<th scope="col">{columns.count}</th>
					<th scope="col">{columns.detail}</th>
				</tr>
			</thead>
			<tbody>
				{#each tableRows ?? rows as row (row.label)}
					<tr>
						<th scope="row">{row.label}</th>
						<td>{row.count}</td>
						<td>{row.detail ?? '—'}</td>
					</tr>
				{/each}
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
		margin-bottom: 1rem;
	}

	.title {
		font-weight: 700;
	}

	.summary {
		color: var(--muted);
	}

	/*
	 * Every row shares the list's columns (subgrid), so all the bar tracks are
	 * the same length and the bars share one scale, however long a label or
	 * value is. On a narrow screen each bar takes its own line under its label.
	 */
	.bars {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: fit-content(12rem) minmax(0, 1fr) max-content;
		gap: 0.75rem;
	}

	.bars li {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
		align-items: center;
		row-gap: 0.25rem;
	}

	@media (max-width: 30rem) {
		.bars {
			grid-template-columns: minmax(0, 1fr) max-content;
		}
		.track {
			grid-column: 1 / -1;
			grid-row: 2;
		}
	}

	.track {
		display: block;
		background: var(--chart-track);
		border-radius: 4px;
		overflow: visible;
	}

	.series {
		fill: var(--series-1);
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

	.note {
		margin: 0.75rem 0 0;
		color: var(--muted);
	}

	.value {
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
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
