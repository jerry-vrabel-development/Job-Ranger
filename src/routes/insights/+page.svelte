<script lang="ts">
	import { flip } from 'svelte/animate';
	import { prefersReducedMotion } from 'svelte/motion';
	import { resolve } from '$app/paths';
	import BarChart from '#lib/charts/BarChart.svelte';
	import LineChart from '#lib/charts/LineChart.svelte';
	import Reveal from '#lib/charts/Reveal.svelte';
	import UsMap from '#lib/charts/UsMap.svelte';
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

	<Reveal>
		<BarChart
			title="From saved to offer"
			summary={data.summary}
			rows={data.steps}
			columns={{ label: 'Step', count: 'Count', detail: 'Share of the step before' }}
			ordinal
		/>
	</Reveal>

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
				<!-- When the order changes (7 to 30 days), each company slides to its new place. -->
				<li animate:flip={{ duration: prefersReducedMotion.current ? 0 : 400 }}>
					<article aria-labelledby={`trend-${item.key}`}>
						<h3 id={`trend-${item.key}`}>
							<a
								href={resolve('/companies/[source]/[board]', {
									source: item.source,
									board: item.board
								})}
							>
								{item.company}
							</a>
						</h3>
						<p class={`direction ${item.trend.direction}`}>{item.trend.words}</p>
						<Reveal>
							<LineChart label={item.company} data={item.points} />
						</Reveal>
					</article>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section aria-labelledby="market">
	<h2 id="market">The market I watch</h2>
	<p class="found">{data.market.summary}</p>
	<div class="charts">
		<Reveal>
			<BarChart
				title="Open jobs by company"
				summary="Most first, with each company’s share of all open jobs."
				rows={data.market.companies}
				tableRows={data.market.companyTable}
				note={data.market.companiesMore}
				columns={{ label: 'Company', count: 'Open jobs', detail: 'Share' }}
			/>
		</Reveal>
		<Reveal>
			<BarChart
				title="Remote, hybrid or on site"
				summary="As each posting says; some don’t say."
				rows={data.market.workplaces}
				columns={{ label: 'Workplace', count: 'Open jobs', detail: 'Share' }}
			/>
		</Reveal>
	</div>
	<h3>Where the jobs are</h3>
	<Reveal>
		<UsMap
			title="Open jobs by state"
			summary={data.map.summary}
			states={data.map.states}
			legend={data.map.legend}
			remote={data.map.remote}
			elsewhere={data.map.elsewhere}
		/>
	</Reveal>
	<p class="how">
		A state is read from the posting’s location, the same way as the pay signal. A job naming more
		than one state counts in each. Darker means more jobs; each shade’s range is in the key. A hatch
		marks states whose law requires a pay range in postings, which is information, not legal advice:
		see Signals for postings that may fall under one.
	</p>
	<h3>Pay</h3>
	<p>{data.market.pay}</p>
</section>

<section aria-labelledby="signals">
	<h2 id="signals">Signals and costs</h2>
	<p class="found">{data.signals.summary}</p>
	<Reveal>
		<BarChart
			title="Open jobs with a warning"
			summary="Each warning is a reason to look closer, not a verdict."
			rows={data.signals.bars}
			columns={{ label: 'Warning', count: 'Jobs', detail: 'Out of' }}
		/>
	</Reveal>
	<p class="how">
		A possible ghost job has been open {data.signals.rules.ghostDays} days or more, or reposted
		{data.signals.rules.ghostReposts} times or more. Pay missing means no pay on a board whose list shows
		pay, in a state whose law may require a range; whether the law covers the employer is yours to judge.
		Scam patterns are checked in a posting’s full text, which Job Ranger has once you prepare an apply
		kit.
	</p>
	{#each data.signals.lists as list (list.title)}
		{#if list.jobs.length > 0}
			<details class="flagged">
				<summary>
					{list.title}<span class="count">({list.jobs.length}{list.more ? '+' : ''})</span>
				</summary>
				<ul>
					{#each list.jobs as job (`${job.source}:${job.board}:${job.id}`)}
						<li>
							<a
								href={resolve('/apply/[source]/[board]/[id]', {
									source: job.source,
									board: job.board,
									id: job.id
								})}
							>
								{job.company}: {job.title}
							</a>
							<span class="why">{job.why}</span>
						</li>
					{/each}
				</ul>
				{#if list.more}
					<p class="how">{list.more}</p>
				{/if}
			</details>
		{/if}
	{/each}

	<h3>Drafting costs</h3>
	<p>{data.costs.status}</p>
	<ul class="waiting">
		{#each data.costs.tiles as tile (tile.label)}
			<li><span class="number">{tile.value}</span> {tile.label.toLowerCase()}</li>
		{/each}
	</ul>
	<p>{data.costs.perApplication}</p>

	<h3>Scoring costs</h3>
	<p>{data.scoring.status}</p>
	<ul class="waiting">
		{#each data.scoring.tiles as tile (tile.label)}
			<li><span class="number">{tile.value}</span> {tile.label.toLowerCase()}</li>
		{/each}
	</ul>
	<p>{data.scoring.count}</p>
	<p>
		<a href={resolve('/evals')}>How well scoring works</a>: the model measured against made-up
		postings and your own saved and passed jobs.
	</p>
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

	.flagged {
		margin-top: 0.75rem;
		padding: 0.25rem 1rem;
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 8px;
	}

	/* A flex summary drops the space before the count, so the gap puts it back. */
	.flagged summary {
		cursor: pointer;
		min-height: 44px;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		column-gap: 0.375rem;
		font-weight: 600;
	}

	.flagged ul {
		margin: 0 0 0.75rem;
		padding-left: 1.25rem;
		display: grid;
		gap: 0.5rem;
	}

	.why {
		display: block;
		color: var(--muted);
	}

	.charts {
		display: grid;
		gap: 1rem;
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
