<script lang="ts">
	import { tick } from 'svelte';
	import { browser } from '$app/env';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { resolve } from '$app/paths';
	import { checkedLabel, countLabel } from '#lib/jobs/display.ts';
	import { pageTitle } from '#lib/site.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let status: HTMLElement | undefined = $state();
	let linksInput: HTMLTextAreaElement | undefined = $state();

	/** What the last per-company action said. */
	const result = $derived(form && 'result' in form ? form.result : undefined);
	/** What the last paste said: a problem with the paste, or how each line went. */
	const add = $derived(form && 'add' in form ? form.add : undefined);
	const problem = $derived(add && 'problem' in add ? add.problem : undefined);
	const added = $derived(add && 'results' in add ? add : undefined);
	const notAdded = $derived(added ? added.results.length - added.added : 0);
	/** The box keeps what still needs doing: the paste back after a problem, or the lines not added. */
	const keep = $derived(add && 'links' in add ? add.links : (added?.retry ?? ''));
	const watching = $derived(data.companies.filter((company) => !company.paused).length);

	// After any action, focus goes to what it said: the problem in the box, or the message.
	const afterAction: SubmitFunction =
		() =>
		async ({ update }) => {
			// Refresh the list after failures too, so a stale page catches up.
			await update({ refreshAll: true });
			await tick();
			if (problem) linksInput?.focus();
			else status?.focus();
		};
</script>

<svelte:head>
	<title>{pageTitle('Companies')}</title>
</svelte:head>

<h1>Companies</h1>

<p class="summary">
	Job Ranger checks these companies’ job boards every morning and lists their jobs on the
	<a href={resolve('/jobs')}>Jobs page</a>.
	{#if data.companies.length > 0}
		Watching {watching} of {countLabel(data.companies.length, 'company', 'companies')}.
	{/if}
</p>

{#if result}
	<p class="note" class:problem={!result.ok} role="status" tabindex="-1" bind:this={status}>
		{#if !result.ok}<strong>Not done:</strong>{/if}
		{result.message}
	</p>
{:else if added}
	<div class="note" class:problem={notAdded > 0} role="status" tabindex="-1" bind:this={status}>
		<p>
			<strong>{countLabel(added.added, 'company', 'companies')} added</strong>{#if notAdded > 0}, {notAdded}
				not added. The ones not added are back in the box, to fix or leave{/if}.
		</p>
		<ul class="results">
			{#each added.results as line (line.line)}
				<li>
					{#if line.ok}
						{line.message}
					{:else}
						<strong>Not added</strong> (line {line.line}, <span class="pasted">{line.text}</span>):
						{line.message}
					{/if}
				</li>
			{/each}
		</ul>
	</div>
{/if}

<section aria-labelledby="add-heading">
	<h2 id="add-heading">Add companies</h2>
	<form method="POST" action="?/add" use:enhance={afterAction} novalidate>
		<div class="field">
			<label for="links">Job board links, one per line</label>
			<p class="hint" id="links-hint">
				From jobs.ashbyhq.com, job-boards.greenhouse.io, jobs.lever.co or a company's breezy.hr
				page; a link to one of their jobs works too. Up to 25 at a time. Greenhouse boards bring
				their own company name. To choose a name, add it after a comma: <span class="example">
					job-boards.greenhouse.io/splice, Splice
				</span>
			</p>
			{#if problem}
				<p class="error" id="links-error"><strong>Error:</strong> {problem}</p>
			{/if}
			<textarea
				id="links"
				name="links"
				rows="6"
				autocomplete="off"
				spellcheck="false"
				required
				value={browser ? undefined : keep}
				defaultValue={keep}
				aria-invalid={problem ? 'true' : undefined}
				aria-describedby={problem ? 'links-error links-hint' : 'links-hint'}
				bind:this={linksInput}></textarea>
		</div>
		<p class="hint">Job Ranger reads each board once before adding it, so you know it works.</p>
		<button type="submit">Check and add</button>
	</form>
</section>

<section aria-labelledby="list-heading">
	<h2 id="list-heading">Your companies</h2>
	{#if data.companies.length === 0}
		<p>None yet. Add one above.</p>
	{:else}
		<ul class="companies">
			{#each data.companies as company (company.key)}
				<li>
					<article aria-labelledby="company-{company.key}">
						<h3 id="company-{company.key}">
							<a
								href={resolve('/companies/[source]/[board]', {
									source: company.source,
									board: company.token
								})}
							>
								{company.company}
							</a>{#if company.paused}<span class="tag">Paused</span>{/if}
						</h3>
						<dl>
							<div>
								<dt>Board</dt>
								<dd>{company.sourceName}: {company.token}</dd>
							</div>
							<div>
								<dt>Open jobs</dt>
								<dd>
									{company.openJobs}{#if company.paused}
										(hidden while paused){/if}
								</dd>
							</div>
							<div>
								<dt>Last check</dt>
								<dd>
									{#if company.lastFetchOk === null}
										Not checked yet.
									{:else}
										{company.lastFetchOk ? 'Read' : 'Could not be read'} on {checkedLabel(
											company.lastFetchedAt
										)}. {company.lastFetchNote}
									{/if}
								</dd>
							</div>
						</dl>
						<div class="actions">
							{#if !company.paused}
								<form method="POST" action="?/check" use:enhance={afterAction}>
									<input type="hidden" name="source" value={company.source} />
									<input type="hidden" name="token" value={company.token} />
									<button type="submit">
										Check now<span class="visually-hidden">{` for ${company.company}`}</span>
									</button>
								</form>
							{/if}
							<form
								method="POST"
								action={company.paused ? '?/resume' : '?/pause'}
								use:enhance={afterAction}
							>
								<input type="hidden" name="source" value={company.source} />
								<input type="hidden" name="token" value={company.token} />
								<button type="submit">
									{company.paused ? 'Resume' : 'Pause'}<span class="visually-hidden">
										{` ${company.company}`}
									</span>
								</button>
							</form>
						</div>
						<details>
							<summary>Rename<span class="visually-hidden">{` ${company.company}`}</span>…</summary>
							<form method="POST" action="?/rename" use:enhance={afterAction} class="rename">
								<input type="hidden" name="source" value={company.source} />
								<input type="hidden" name="token" value={company.token} />
								<label for="rename-{company.key}">
									New name<span class="visually-hidden">{` for ${company.company}`}</span>
								</label>
								<input
									id="rename-{company.key}"
									name="company"
									type="text"
									autocomplete="off"
									required
									maxlength="200"
									defaultValue={company.company}
								/>
								<button type="submit">
									Save name<span class="visually-hidden">{` for ${company.company}`}</span>
								</button>
							</form>
						</details>
						<details>
							<summary>Remove<span class="visually-hidden">{` ${company.company}`}</span>…</summary>
							<p>
								This removes {company.company} and every job stored for it. It can’t be undone.
								{#if !company.paused}Pause keeps the history, if you might want it back.{/if}
							</p>
							<form method="POST" action="?/remove" use:enhance={afterAction}>
								<input type="hidden" name="source" value={company.source} />
								<input type="hidden" name="token" value={company.token} />
								<button type="submit" class="danger">Remove {company.company}</button>
							</form>
						</details>
					</article>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.summary,
	.hint {
		color: var(--muted);
	}

	.hint {
		margin: 0 0 0.35rem;
		font-size: 1rem;
	}

	.note {
		background: var(--surface);
		border: 1px solid var(--rule);
		border-left: 4px solid var(--accent);
		padding: 0.75rem 1rem;
		border-radius: 4px;
	}

	/* A problem says so in words ("Not done:"); the thicker border is extra, not the signal. */
	.note.problem {
		border-left-width: 8px;
	}

	section {
		margin-top: 2rem;
	}

	h2 {
		font-size: 1.4rem;
	}

	.field {
		margin-bottom: 1rem;
	}

	label {
		display: block;
		font-weight: 600;
	}

	textarea,
	input[type='text'] {
		display: block;
		width: 100%;
		font: inherit;
		color: var(--text);
		background: var(--surface);
		border: 2px solid var(--muted);
		border-radius: 4px;
		padding: 0.5rem 0.6rem;
		min-height: 44px;
	}

	textarea {
		resize: vertical;
		line-height: 1.5;
	}

	[aria-invalid='true'] {
		border-width: 3px;
		border-style: dashed;
	}

	.error {
		margin: 0 0 0.35rem;
		overflow-wrap: anywhere;
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

	.companies {
		list-style: none;
		padding: 0;
		margin: 1rem 0;
	}

	.companies > li + li {
		margin-top: 1rem;
	}

	article {
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 6px;
		padding: 1rem 1.25rem;
		overflow-wrap: anywhere;
	}

	h3 {
		font-size: 1.25rem;
		margin: 0 0 0.5rem;
	}

	/* "Paused" is a word, not a color. */
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
		min-width: 6rem;
	}

	dt::after {
		content: ':';
	}

	dd {
		margin: 0;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 0.75rem;
		margin: 0.75rem 0 0;
	}

	.actions form {
		margin: 0;
	}

	details {
		margin-top: 0.5rem;
	}

	summary {
		cursor: pointer;
		min-height: 44px;
		padding: 0.5rem 0;
	}

	.results {
		margin: 0.5rem 0 0;
		padding-left: 1.25rem;
	}

	.results li + li {
		margin-top: 0.25rem;
	}

	.note > p {
		margin: 0;
	}

	.pasted,
	.example {
		font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
		font-size: 0.95em;
		overflow-wrap: anywhere;
	}

	.rename {
		display: grid;
		gap: 0.35rem;
		margin-bottom: 0.5rem;
	}

	.rename button {
		justify-self: start;
	}

	.danger {
		border-style: double;
		border-width: 4px;
	}
</style>
