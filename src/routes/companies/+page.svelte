<script lang="ts">
	import { tick } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { resolve } from '$app/paths';
	import { checkedLabel, countLabel } from '#lib/jobs/display.ts';
	import { pageTitle } from '#lib/site.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let status: HTMLParagraphElement | undefined = $state();
	let linkInput: HTMLInputElement | undefined = $state();
	let companyInput: HTMLInputElement | undefined = $state();

	const result = $derived(form?.result);
	const field = $derived(result && 'field' in result ? result.field : undefined);
	const values = $derived(form && 'values' in form ? form.values : undefined);
	const watching = $derived(data.companies.filter((company) => !company.paused).length);

	// After any action: an add with a field error puts focus on that field;
	// everything else focuses the message, so it is read out and easy to find.
	const afterAction: SubmitFunction =
		() =>
		async ({ update }) => {
			// Refresh the list after failures too, so a stale page catches up.
			await update({ refreshAll: true });
			await tick();
			if (field === 'link') linkInput?.focus();
			else if (field === 'company') companyInput?.focus();
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

{#if result && (result.ok || !field)}
	<p class="note" class:problem={!result.ok} role="status" tabindex="-1" bind:this={status}>
		{#if !result.ok}<strong>Not done:</strong>{/if}
		{result.message}
	</p>
{/if}

<section aria-labelledby="add-heading">
	<h2 id="add-heading">Add a company</h2>
	<form method="POST" action="?/add" use:enhance={afterAction} novalidate>
		<div class="field">
			<label for="link">Job board link</label>
			<p class="hint" id="link-hint">
				From jobs.ashbyhq.com or job-boards.greenhouse.io. A link to one of their jobs works too.
			</p>
			{#if field === 'link' && result && !result.ok}
				<p class="error" id="link-error"><strong>Error:</strong> {result.message}</p>
			{/if}
			<input
				id="link"
				name="link"
				type="text"
				inputmode="url"
				autocomplete="off"
				spellcheck="false"
				required
				defaultValue={values?.link ?? ''}
				aria-invalid={field === 'link' ? 'true' : undefined}
				aria-describedby={field === 'link' ? 'link-error link-hint' : 'link-hint'}
				bind:this={linkInput}
			/>
		</div>
		<div class="field">
			<label for="company">Company name</label>
			<p class="hint" id="company-hint">How you want to see it on the Jobs page.</p>
			{#if field === 'company' && result && !result.ok}
				<p class="error" id="company-error"><strong>Error:</strong> {result.message}</p>
			{/if}
			<input
				id="company"
				name="company"
				type="text"
				autocomplete="off"
				required
				maxlength="200"
				defaultValue={values?.company ?? ''}
				aria-invalid={field === 'company' ? 'true' : undefined}
				aria-describedby={field === 'company' ? 'company-error company-hint' : 'company-hint'}
				bind:this={companyInput}
			/>
		</div>
		<p class="hint">Job Ranger reads the board once before adding it, so you know it works.</p>
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
							{company.company}{#if company.paused}<span class="tag">Paused</span>{/if}
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
									<button type="submit"
										>Check now<span class="visually-hidden">{` for ${company.company}`}</span
										></button
									>
								</form>
							{/if}
							<form
								method="POST"
								action={company.paused ? '?/resume' : '?/pause'}
								use:enhance={afterAction}
							>
								<input type="hidden" name="source" value={company.source} />
								<input type="hidden" name="token" value={company.token} />
								<button type="submit"
									>{company.paused ? 'Resume' : 'Pause'}<span class="visually-hidden"
										>{` ${company.company}`}</span
									></button
								>
							</form>
						</div>
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

	input[aria-invalid='true'] {
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

	.danger {
		border-style: double;
		border-width: 4px;
	}
</style>
