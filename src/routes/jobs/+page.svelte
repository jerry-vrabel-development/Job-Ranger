<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { checkedLabel, countLabel, latest } from '#lib/jobs/display.ts';
	import { pageTitle } from '#lib/site.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let status: HTMLParagraphElement | undefined = $state();

	const newCount = $derived(data.jobs.filter((job) => job.isNew).length);
	const failed = $derived(data.boards.filter((board) => board.lastFetchOk === false));
	const lastCheck = $derived(latest(data.boards.map((board) => board.lastFetchedAt)));
</script>

<svelte:head>
	<title>{pageTitle('Jobs')}</title>
</svelte:head>

<h1>Jobs</h1>

{#if data.boards.length === 0}
	<p class="note">
		No job boards yet. Add a company’s job board, and the daily check will fill this list. The
		README says how.
	</p>
{:else}
	<p class="summary">
		{countLabel(data.jobs.length, 'open job')} from {countLabel(data.boards.length, 'job board')},
		newest first. {#if newCount > 0}{newCount} new.{/if}
		Last checked: {checkedLabel(lastCheck)}.
	</p>

	{#if failed.length > 0}
		<p class="note">
			<strong>Heads up:</strong>
			{countLabel(failed.length, 'board')} couldn’t be read in the last check. The list keeps what was
			found before. Details are under “Job boards” below.
		</p>
	{/if}

	{#if form?.marked !== undefined}
		<p class="note" role="status" tabindex="-1" bind:this={status}>
			Marked {countLabel(form.marked, 'job')} as seen.
		</p>
	{/if}

	{#if newCount > 0}
		<form
			method="POST"
			action="?/seen"
			use:enhance={() =>
				async ({ update }) => {
					await update();
					await tick();
					status?.focus();
				}}
		>
			<button type="submit">Mark all as seen</button>
		</form>
	{/if}

	{#if data.jobs.length === 0}
		<p>No open jobs on your boards right now.</p>
	{:else}
		<ul class="jobs">
			{#each data.jobs as job (job.key)}
				<li>
					<article aria-labelledby="job-{job.key}">
						<h2 id="job-{job.key}">
							{job.title}{#if job.isNew}<span class="tag">New</span>{/if}
						</h2>
						<p class="company">{job.company}</p>
						<dl>
							<div>
								<dt>Where</dt>
								<dd>{job.where}</dd>
							</div>
							<div>
								<dt>Pay</dt>
								<dd>{job.pay}</dd>
							</div>
							{#if job.employmentType}
								<div>
									<dt>Type</dt>
									<dd>{job.employmentType}</dd>
								</div>
							{/if}
							{#if job.department}
								<div>
									<dt>Team</dt>
									<dd>{job.department}</dd>
								</div>
							{/if}
							<div>
								<dt>Posted</dt>
								<dd>
									{#if job.postedAt}<time datetime={job.postedAt}>{job.posted}</time
										>{:else}{job.posted}{/if}
								</dd>
							</div>
						</dl>
						<p class="links">
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the employer's own apply page -->
							<a class="apply" href={job.applyUrl}
								>Apply<span class="visually-hidden">{` for ${job.title} at ${job.company}`}</span
								></a
							>
							{#if job.jobUrl}
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the employer's own posting -->
								<a href={job.jobUrl}
									>Read the posting<span class="visually-hidden"
										>{` for ${job.title} at ${job.company}`}</span
									></a
								>
							{/if}
						</p>
					</article>
				</li>
			{/each}
		</ul>
	{/if}

	<details>
		<summary>Job boards ({data.boards.length})</summary>
		<ul class="boards">
			{#each data.boards as board (board.key)}
				<li>
					<strong>{board.company}:</strong>
					{#if board.lastFetchOk === null}
						not checked yet.
					{:else}
						{board.lastFetchOk ? 'read' : 'could not be read'} on {checkedLabel(
							board.lastFetchedAt
						)}. {board.lastFetchNote}
					{/if}
				</li>
			{/each}
		</ul>
	</details>
{/if}

<style>
	.summary {
		color: var(--muted);
	}

	.note {
		background: var(--surface);
		border: 1px solid var(--rule);
		border-left: 4px solid var(--accent);
		padding: 0.75rem 1rem;
		border-radius: 4px;
	}

	button {
		font: inherit;
		color: var(--text);
		background: var(--surface);
		border: 2px solid var(--accent);
		border-radius: 4px;
		padding: 0.4rem 1rem;
		min-height: 44px;
		cursor: pointer;
	}

	.jobs,
	.boards {
		list-style: none;
		padding: 0;
		margin: 1.5rem 0;
	}

	.jobs > li + li {
		margin-top: 1rem;
	}

	article {
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 6px;
		padding: 1rem 1.25rem;
		overflow-wrap: anywhere;
	}

	h2 {
		font-size: 1.3rem;
		line-height: 1.3;
		margin: 0;
	}

	/* "New" is a word, not a color. The border keeps it visible in high contrast. */
	.tag {
		display: inline-block;
		margin-left: 0.5rem;
		padding: 0 0.4rem;
		font-size: 0.85rem;
		font-weight: 600;
		vertical-align: 0.15em;
		border: 1px solid var(--accent);
		border-radius: 4px;
		color: var(--accent);
	}

	.company {
		margin: 0.25rem 0 0.5rem;
		font-weight: 600;
	}

	dl {
		margin: 0;
		display: grid;
		gap: 0.15rem;
	}

	dl > div {
		display: flex;
		flex-wrap: wrap;
		gap: 0 0.5rem;
	}

	dt {
		color: var(--muted);
		min-width: 4.5rem;
	}

	dt::after {
		content: ':';
	}

	dd {
		margin: 0;
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.5rem;
		margin: 0.75rem 0 0;
	}

	.links a {
		display: inline-block;
		min-height: 44px;
		padding: 0.5rem 0;
	}

	.apply {
		font-weight: 700;
	}

	.boards li + li {
		margin-top: 0.5rem;
	}

	summary {
		cursor: pointer;
		min-height: 44px;
		padding: 0.5rem 0;
	}
</style>
