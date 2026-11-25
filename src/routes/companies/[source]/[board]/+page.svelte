<script lang="ts">
	import { resolve } from '$app/paths';
	import LineChart from '#lib/charts/LineChart.svelte';
	import Reveal from '#lib/charts/Reveal.svelte';
	import { pageTitle } from '#lib/site.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const kit = (id: string) =>
		resolve('/apply/[source]/[board]/[id]', { source: data.source, board: data.token, id });
</script>

<svelte:head>
	<title>{pageTitle(data.company)}</title>
</svelte:head>

<p class="back"><a href={resolve('/companies')}>← All companies</a></p>

<h1>
	{data.company}{#if data.paused}<span class="tag">Paused</span>{/if}
</h1>
<p class="summary">{data.summary}</p>

<dl class="facts">
	<div>
		<dt>Board</dt>
		<dd>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the company's own job board -->
			<a href={data.boardUrl} rel="noopener noreferrer">{data.sourceName}: {data.token}</a>
		</dd>
	</div>
	<div>
		<dt>Watching since</dt>
		<dd>{data.watchingSince}</dd>
	</div>
	<div>
		<dt>Last check</dt>
		<dd>{data.lastCheck}</dd>
	</div>
	{#if data.interests.length > 0}
		<div>
			<dt>Interests</dt>
			<dd>
				{data.interests.map((i) => (i.paused ? `${i.name} (paused)` : i.name)).join(', ')}
			</dd>
		</div>
	{/if}
</dl>

<section aria-labelledby="momentum">
	<h2 id="momentum">Hiring momentum</h2>
	<ul class="trends">
		<li>{data.trend7}</li>
		<li>{data.trend30}</li>
	</ul>
	<div class="card">
		<Reveal>
			<LineChart label={data.company} data={data.points} />
		</Reveal>
	</div>
	<p class="how">
		Open jobs on the board, counted once a day; a gap is a day without a count. Fewer open jobs
		means fewer listings, not layoffs.
	</p>
</section>

<section aria-labelledby="open">
	<h2 id="open">Open jobs ({data.open.length})</h2>
	{#if data.open.length === 0}
		<p>No open jobs on this board right now.</p>
	{:else}
		<ul class="jobs">
			{#each data.open as job (job.id)}
				<li>
					<a href={kit(job.id)}>{job.title}</a>
					{#each job.warnings as warning (warning)}
						<span class="warning">⚠ {warning}</span>
					{/each}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section aria-labelledby="closed">
	<h2 id="closed">Closed in the last 30 days ({data.closed.length})</h2>
	<p class="how">
		Jobs the board stopped listing. The board doesn’t say whether a job was filled, pulled or simply
		expired.
	</p>
	{#if data.closed.length > 0}
		<ul class="jobs">
			{#each data.closed as job (job.id)}
				<li>{job.title} <span class="why">Closed {job.when}</span></li>
			{/each}
		</ul>
	{/if}
</section>

<section aria-labelledby="history">
	<h2 id="history">You and {data.company}</h2>
	{#if data.history.length === 0}
		<p>Nothing saved, passed or applied to here yet.</p>
	{:else}
		<ul class="jobs">
			{#each data.history as row (row.id)}
				<li>
					<a href={kit(row.id)}>{row.title}</a>
					<span class="why">{row.what}</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.back {
		margin-bottom: 0.5rem;
	}

	.summary {
		font-size: 1.125rem;
		font-weight: 600;
	}

	/* The rows share the list's columns (subgrid), so every value lines up. */
	.facts {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: 0.5rem 0.75rem;
		margin: 1rem 0 1.5rem;
	}

	.facts div {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
	}

	.facts dt {
		color: var(--muted);
	}

	.facts dd {
		margin: 0;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.tag {
		margin-left: 0.5rem;
		font-size: 0.875rem;
		padding: 0.125rem 0.5rem;
		border: 1px solid var(--rule);
		border-radius: 999px;
		vertical-align: middle;
	}

	.trends {
		list-style: none;
		padding: 0;
		margin: 0 0 0.75rem;
		display: grid;
		gap: 0.25rem;
	}

	.card {
		padding: 1rem 1.25rem;
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 8px;
	}

	.how {
		color: var(--muted);
		font-size: 1rem;
	}

	.jobs {
		padding-left: 1.25rem;
		display: grid;
		gap: 0.625rem;
	}

	.jobs li {
		overflow-wrap: anywhere;
	}

	.why,
	.warning {
		display: block;
		color: var(--muted);
	}
</style>
