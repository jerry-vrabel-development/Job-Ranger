<script lang="ts">
	import { resolve } from '$app/paths';
	import Funnel from '#lib/charts/Funnel.svelte';
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

	.number {
		display: block;
		font-size: 1.75rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
</style>
