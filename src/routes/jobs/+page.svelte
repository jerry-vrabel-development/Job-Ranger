<script lang="ts">
	import PayMissing from '#lib/signals/PayMissing.svelte';
	import { tick } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { resolve } from '$app/paths';
	import { checkedLabel, countLabel, latest } from '#lib/jobs/display.ts';
	import { pageTitle } from '#lib/site.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let status: HTMLParagraphElement | undefined = $state();
	let markStatus: HTMLParagraphElement | undefined = $state();

	/** After saving or passing, the list reloads and the status line takes focus. */
	const afterMark: SubmitFunction =
		() =>
		async ({ update }) => {
			await update();
			await tick();
			markStatus?.focus();
		};

	const newCount = $derived(data.counts.new);
	const shown = $derived(data.jobs.length);
	const failed = $derived(data.boards.filter((board) => board.lastFetchOk === false));
	const lastCheck = $derived(latest(data.boards.map((board) => board.lastFetchedAt)));
</script>

{#snippet jobFields(job: { source: string; board: string; id: string })}
	<input type="hidden" name="source" value={job.source} />
	<input type="hidden" name="board" value={job.board} />
	<input type="hidden" name="id" value={job.id} />
{/snippet}

<svelte:head>
	<title>{pageTitle('Jobs')}</title>
</svelte:head>

<h1>Jobs</h1>

{#if data.boards.length === 0}
	<p class="note">
		No companies yet. <a href={resolve('/companies')}>Add a company</a>, and the daily check will
		fill this list.
	</p>
{:else}
	<p class="summary" role="status">
		{#if data.filter.active}
			{data.counts.matching} of {countLabel(data.counts.all, 'open job')} match, newest first.
		{:else}
			{countLabel(data.counts.all, 'open job')} from {countLabel(data.boards.length, 'job board')},
			newest first. {#if newCount > 0}{newCount} new.{/if}
		{/if}
		{#if shown < data.counts.matching}
			Showing the first {shown}; use the filters to narrow the list.
		{/if}
		{#if data.counts.passed > 0 && data.filter.show !== 'passed'}
			{countLabel(data.counts.passed, 'passed job')} hidden.
		{/if}
		Last checked: {checkedLabel(lastCheck)}.
	</p>

	<form method="GET" class="filters" data-sveltekit-keepfocus data-sveltekit-noscroll>
		<div class="field wide">
			<label for="q">Search</label>
			<input
				id="q"
				name="q"
				type="search"
				value={data.filter.q}
				autocomplete="off"
				aria-describedby="q-hint"
			/>
			<span class="hint" id="q-hint">Words in the title, team, location or company.</span>
		</div>
		{#if data.interests.length > 0}
			<div class="field">
				<label for="interest">Interest</label>
				<select id="interest" name="interest" value={data.filter.interest}>
					<option value="">Any interest</option>
					{#each data.interests as interest (interest.id)}
						<option value={interest.id}>{interest.name}</option>
					{/each}
				</select>
			</div>
		{/if}
		<div class="field">
			<label for="company">Company</label>
			<select id="company" name="company" value={data.filter.company}>
				<option value="">All companies</option>
				{#each data.boards as board (board.key)}
					<option value={board.key}>{board.company}</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label for="workplace">Workplace</label>
			<select id="workplace" name="workplace" value={data.filter.workplace}>
				<option value="">Any</option>
				<option value="remote">Remote</option>
				<option value="hybrid">Hybrid</option>
				<option value="on-site">On site</option>
				<option value="unknown">Not stated</option>
			</select>
		</div>
		<div class="field">
			<label for="show">Show</label>
			<select id="show" name="show" value={data.filter.show}>
				<option value="">All but passed</option>
				<option value="saved">Saved only</option>
				<option value="passed">Passed only</option>
			</select>
		</div>
		<div class="field check">
			<input id="new" name="new" type="checkbox" value="1" checked={data.filter.onlyNew} />
			<label for="new">Only new</label>
		</div>
		<div class="buttons">
			<button type="submit">Show jobs</button>
			{#if data.filter.active}
				<a href={resolve('/jobs')}>Clear filters</a>
			{/if}
		</div>
	</form>

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

	{#if form?.result}
		<p class="note" role="status" tabindex="-1" bind:this={markStatus}>
			{form.result.ok ? '' : 'Not done: '}{form.result.message}
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
		<p>
			{data.filter.active
				? 'No open jobs match these filters.'
				: 'No open jobs on your boards right now.'}
		</p>
	{:else}
		<ul class="jobs">
			{#each data.jobs as job (job.key)}
				<li>
					<article aria-labelledby="job-{job.key}">
						<h2 id="job-{job.key}">
							{job.title}{#if job.isNew}<span class="tag">New</span>{/if}
						</h2>
						<p class="company">{job.company}</p>
						{#if job.applied}
							<p class="applied"><strong>Applied</strong> {job.applied}</p>
						{/if}
						{#if job.mark?.kind === 'saved'}
							<p class="applied"><strong>Saved</strong> {job.mark.on}</p>
						{:else if job.mark?.kind === 'passed'}
							<p class="applied">
								<strong>Passed</strong>
								{job.mark.on}{#if job.mark.note}: {job.mark.note}{/if}
							</p>
						{/if}
						{#if job.ghost}
							<p class="signal"><strong>Ghost-job warning:</strong> {job.ghost}</p>
						{/if}
						{#if job.payLaws}
							<PayMissing laws={job.payLaws} />
						{/if}
						{#if job.why}
							<p class="why"><span class="visually-hidden">Why it's listed:</span> {job.why}</p>
						{/if}
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
									{#if job.postedAt}<time datetime={job.postedAt}>
											{job.posted}
										</time>{:else}{job.posted}{/if}
								</dd>
							</div>
						</dl>
						<p class="links">
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the employer's own apply page -->
							<a class="apply" href={job.applyUrl}>
								Apply<span class="visually-hidden">{` for ${job.title} at ${job.company}`}</span>
							</a>
							<a
								href={resolve('/apply/[source]/[board]/[id]', {
									source: job.source,
									board: job.board,
									id: job.id
								})}
							>
								Apply kit<span class="visually-hidden">
									{` for ${job.title} at ${job.company}`}
								</span>
							</a>
							{#if job.jobUrl}
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the employer's own posting -->
								<a href={job.jobUrl}>
									Read the posting<span class="visually-hidden">
										{` for ${job.title} at ${job.company}`}
									</span>
								</a>
							{/if}
						</p>
						<div class="marks">
							{#if job.mark}
								<form method="POST" action="?/unmark" use:enhance={afterMark}>
									{@render jobFields(job)}
									<button type="submit">
										{job.mark.kind === 'saved' ? 'Unsave' : 'Put back on the list'}<span
											class="visually-hidden"
										>
											{` ${job.title} at ${job.company}`}
										</span>
									</button>
								</form>
							{/if}
							{#if job.mark?.kind !== 'saved'}
								<form method="POST" action="?/save" use:enhance={afterMark}>
									{@render jobFields(job)}
									<button type="submit">
										Save<span class="visually-hidden">{` ${job.title} at ${job.company}`}</span>
									</button>
								</form>
							{/if}
							{#if job.mark?.kind !== 'passed'}
								<details>
									<summary>
										Pass on this job<span class="visually-hidden">
											{` ${job.title} at ${job.company}`}
										</span>
									</summary>
									<form method="POST" action="?/pass" use:enhance={afterMark} class="stack">
										{@render jobFields(job)}
										<label for="note-{job.key}">Why (optional, just for you)</label>
										<input id="note-{job.key}" name="note" type="text" maxlength={data.noteMax} />
										<button type="submit">
											Pass<span class="visually-hidden">
												{` on ${job.title} at ${job.company}`}
											</span>
										</button>
									</form>
								</details>
							{/if}
						</div>
					</article>
				</li>
			{/each}
		</ul>
	{/if}

	<details>
		<summary>Job boards ({data.boards.length})</summary>
		<p><a href={resolve('/companies')}>Add, pause or remove companies</a></p>
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

	.applied {
		margin: 0.25rem 0 0;
	}

	.marks {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		align-items: flex-start;
		margin-top: 0.5rem;
	}

	.stack {
		display: grid;
		gap: 0.25rem;
		margin-top: 0.5rem;
		max-width: 28rem;
	}

	/* The warning says what it is in words; the rule beside it is extra, not the signal. */
	.signal {
		margin: 0.5rem 0 0;
		border-left: 4px solid var(--accent);
		padding-left: 0.75rem;
	}

	.why {
		margin: 0.25rem 0 0;
		font-size: 0.9rem;
		font-style: italic;
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.75rem 1rem;
		margin: 1rem 0 1.5rem;
		padding: 1rem;
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 6px;
	}

	.field {
		display: grid;
		gap: 0.2rem;
		flex: 1 1 10rem;
		min-width: 0;
	}

	.field.wide {
		flex: 1 1 100%;
	}

	.field.check {
		flex: 0 1 auto;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
	}

	.field label {
		font-weight: 600;
	}

	.hint {
		color: var(--muted);
		font-size: 1rem;
	}

	.filters input[type='search'],
	.filters select {
		font: inherit;
		color: var(--text);
		background: var(--bg);
		border: 2px solid var(--muted);
		border-radius: 4px;
		padding: 0.4rem 0.5rem;
		min-height: 44px;
		width: 100%;
		min-width: 0;
	}

	.filters input[type='checkbox'] {
		width: 1.4rem;
		height: 1.4rem;
	}

	.buttons {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1rem;
	}

	.buttons a {
		display: inline-block;
		min-height: 44px;
		padding: 0.5rem 0;
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
