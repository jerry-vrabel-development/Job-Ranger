<!--
	A funnel of ordered steps (design note 0007): one bar per step, measured
	against the first, with its count and share written beside it. The bars
	are SVG, sized by attributes rather than inline styles, so the CSP stays
	strict. Colors run light to dark by step, but every step is named and
	counted in text, so nothing depends on telling the blues apart. "Show the
	numbers" gives the same figures as a table, and works without JavaScript.
-->
<script lang="ts">
	import type { FunnelStep } from '#lib/insights/search.ts';

	let { title, summary, steps }: { title: string; summary: string; steps: readonly FunnelStep[] } =
		$props();

	const first = $derived(steps[0]?.count ?? 0);
	/** Width as a share of the first step. A step with any count stays visible. */
	const width = (count: number) =>
		count === 0 || first === 0 ? 0 : Math.max(1.5, (count / first) * 100);
	const valueText = (step: FunnelStep) =>
		step.share === null ? String(step.count) : `${String(step.count)} · ${step.share}`;
</script>

<figure class="chart">
	<figcaption>
		<span class="title">{title}</span>
		<span class="summary">{summary}</span>
	</figcaption>
	<ol class="funnel">
		{#each steps as step, i (step.label)}
			<li>
				<span class="label">{step.label}</span>
				<svg class="track" aria-hidden="true" focusable="false" width="100%" height="16">
					{#if width(step.count) > 0}
						<rect
							class={`bar step-${String(i + 1)}`}
							x="0"
							y="0"
							width={`${String(width(step.count))}%`}
							height="16"
							rx="4"
						/>
						<!-- Square at the baseline, rounded at the data end. -->
						<rect class={`bar step-${String(i + 1)}`} x="0" y="0" width="4" height="16" />
					{/if}
				</svg>
				<span class="value">{valueText(step)}</span>
			</li>
		{/each}
	</ol>
	<details>
		<summary>Show the numbers</summary>
		<table>
			<caption class="visually-hidden">{title}</caption>
			<thead>
				<tr>
					<th scope="col">Step</th>
					<th scope="col">Count</th>
					<th scope="col">Share of the step before</th>
				</tr>
			</thead>
			<tbody>
				{#each steps as step (step.label)}
					<tr>
						<th scope="row">{step.label}</th>
						<td>{step.count}</td>
						<td>{step.share ?? '—'}</td>
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

	.funnel {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.75rem;
	}

	/* Label, bar and value on one line; on a narrow screen the bar takes its own line. */
	.funnel li {
		display: grid;
		grid-template-columns: 7.5rem 1fr auto;
		align-items: center;
		gap: 0.25rem 0.75rem;
	}

	@media (max-width: 30rem) {
		.funnel li {
			grid-template-columns: 1fr auto;
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

	.bar {
		transform-box: fill-box;
		transform-origin: left center;
		animation: grow 600ms ease-out both;
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

	@keyframes grow {
		from {
			transform: scaleX(0);
		}
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
