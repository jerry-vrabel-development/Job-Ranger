<script lang="ts">
	import { resolve } from '$app/paths';
	import Funnel from '#lib/charts/Funnel.svelte';
	import LineChart from '#lib/charts/LineChart.svelte';
	import { pageTitle } from '#lib/site.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{pageTitle('Insights')}</title>
</svelte:head>

<h1>Insights</h1>

<p>
	How your search is going, from what Job Ranger has recorded. Just your numbers: nothing to keep up
	with.
</p>

<section aria-labelledby="my-search">
	<h2 id="my-search">My search</h2>
	<p class="found">{data.found}</p>

	<Funnel title="From saved to offer" summary={data.summary} steps={data.steps} />

	<p class="how">
		Each step counts what got at least that far. Saved includes jobs you applied to without saving.
		Replied means interviewing, an offer or a rejection; a withdrawn application isn’t counted,
		since the record doesn’t say whether they’d answered. Shares are shown once the step before has {data.minForShare}
		or more.
	</p>

	<h3>Waiting to hear</h3>
	<ul class="waiting">
		<li><span class="number">{data.waiting.followUp}</span> to follow up now</li>
		<li><span class="number">{data.waiting.waiting}</span> waiting to hear</li>
		<li><span class="number">{data.waiting.noReply}</span> with no reply</li>
	</ul>
	<p><a href={resolve('/tracker')}>See them on the Tracker</a></p>
</section>

<section aria-labelledby="trending">
	<h2 id="trending">Trending companies</h2>
	<form
		class="ranges"
		method="get"
		aria-label="Time span"
		data-sveltekit-noscroll
		data-sveltekit-keepfocus
	>
		{#each data.ranges as range (range)}
			<button name="range" value={range} aria-pressed={data.range === range}>
				Last {range} days
			</button>
		{/each}
	</form>
	<p class="found">{data.trendSummary}</p>
	<p class="how">
		Open jobs on each company’s board, counted once a day. A change counts once it’s at least {data
			.rules.minChange}
		jobs and {data.rules.minShare}% of where it started; less is steady. A day without a count (a
		failed fetch) is a gap in the line, not a zero. Fewer open jobs means fewer listings, not
		layoffs. Most growth first.
	</p>
	{#if data.trends.length === 0}
		<p>
			No companies on your list yet. <a href={resolve('/companies')}>Add some on Companies</a>.
		</p>
	{:else}
		<ul class="trends">
			{#each data.trends as item (item.key)}
				<li>
					<article aria-labelledby={`trend-${item.key}`}>
						<h3 id={`trend-${item.key}`}>{item.company}</h3>
						<p class={`direction ${item.trend.direction}`}>{item.trend.words}</p>
						<LineChart label={item.company} data={item.points} />
					</article>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.found {
		font-size: 1.25rem;
		font-weight: 600;
	}

	.how {
		color: var(--muted);
		font-size: 1rem;
	}

	.waiting {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.waiting li {
		flex: 1 1 9rem;
		padding: 0.75rem 1rem;
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 8px;
	}

	.ranges {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.ranges button {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 0.875rem;
		border: 1px solid var(--rule);
		border-radius: 999px;
		background: var(--surface);
		color: var(--accent);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	/* The chosen span is filled, ticked and marked by aria-pressed, not shown by color alone. */
	.ranges button[aria-pressed='true'] {
		background: var(--accent);
		color: var(--surface);
		border-color: var(--accent);
	}

	.ranges button[aria-pressed='true']::before {
		content: '✓';
		margin-right: 0.375rem;
	}

	.trends {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 1rem;
	}

	.trends article {
		min-width: 0;
		padding: 1rem 1.25rem;
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 8px;
	}

	.trends h3 {
		margin: 0;
		font-size: 1.125rem;
	}

	.direction {
		margin: 0.25rem 0 0.75rem;
	}

	.number {
		display: block;
		font-size: 1.75rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
</style>
