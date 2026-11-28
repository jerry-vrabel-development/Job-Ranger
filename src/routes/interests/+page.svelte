<script lang="ts">
	import { tick } from 'svelte';
	import { browser } from '$app/env';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { resolve } from '$app/paths';
	import { countLabel } from '#lib/jobs/display.ts';
	import { pageTitle } from '#lib/site.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let status: HTMLElement | undefined = $state();
	let nameInput: HTMLInputElement | undefined = $state();
	let noteInput: HTMLInputElement | undefined = $state();
	let keywordsInput: HTMLInputElement | undefined = $state();

	/** What the last action on an existing interest said. */
	const result = $derived(form && 'result' in form ? form.result : undefined);
	/** A problem with the Add form, and what was typed. */
	const add = $derived(form && 'add' in form ? form.add : undefined);
	const field = $derived(add?.field);

	const afterAction: SubmitFunction =
		() =>
		async ({ update }) => {
			await update({ refreshAll: true });
			await tick();
			if (field === 'name') nameInput?.focus();
			else if (field === 'note') noteInput?.focus();
			else if (field === 'keywords') keywordsInput?.focus();
			else status?.focus();
		};

	function describedBy(name: 'name' | 'note' | 'keywords'): string {
		return field === name ? `${name}-error ${name}-hint` : `${name}-hint`;
	}
</script>

<svelte:head>
	<title>{pageTitle('Interests')}</title>
</svelte:head>

<h1>Interests</h1>

<p class="summary">
	What your search is about, in your own words. Tag <a href={resolve('/companies')}>companies</a>
	with an interest, and give it keywords that catch matching jobs anywhere.
	{#if data.interests.length > 0}
		{countLabel(data.interests.length, 'interest')}.
	{/if}
</p>

{#if result}
	<p class="note" class:problem={!result.ok} role="status" tabindex="-1" bind:this={status}>
		{#if !result.ok}<strong>Not done:</strong>{/if}
		{result.message}
	</p>
{/if}

<section aria-labelledby="add-heading">
	<h2 id="add-heading">Add an interest</h2>
	<form method="POST" action="?/add" use:enhance={afterAction} novalidate>
		<div class="field">
			<label for="name">Name</label>
			<p class="hint" id="name-hint">A few words, like “Robotics” or “Housing and homelessness”.</p>
			{#if field === 'name'}
				<p class="error" id="name-error"><strong>Error:</strong> {add?.message}</p>
			{/if}
			<input
				id="name"
				name="name"
				type="text"
				autocomplete="off"
				required
				maxlength="60"
				value={browser ? undefined : (add?.values.name ?? '')}
				defaultValue={add?.values.name ?? ''}
				aria-invalid={field === 'name' ? 'true' : undefined}
				aria-describedby={describedBy('name')}
				bind:this={nameInput}
			/>
		</div>
		<div class="field">
			<label for="note">Note <span class="optional">(optional)</span></label>
			<p class="hint" id="note-hint">What it means to you, so future you remembers.</p>
			{#if field === 'note'}
				<p class="error" id="note-error"><strong>Error:</strong> {add?.message}</p>
			{/if}
			<input
				id="note"
				name="note"
				type="text"
				autocomplete="off"
				maxlength="300"
				value={browser ? undefined : (add?.values.note ?? '')}
				defaultValue={add?.values.note ?? ''}
				aria-invalid={field === 'note' ? 'true' : undefined}
				aria-describedby={describedBy('note')}
				bind:this={noteInput}
			/>
		</div>
		<div class="field">
			<label for="keywords">Keywords <span class="optional">(optional)</span></label>
			<p class="hint" id="keywords-hint">
				Separated by commas, like “robot, robotics, autonomy, ROS”. A job whose title or team has
				one, as a whole word, matches this interest even at a company you didn’t tag.
			</p>
			{#if field === 'keywords'}
				<p class="error" id="keywords-error"><strong>Error:</strong> {add?.message}</p>
			{/if}
			<input
				id="keywords"
				name="keywords"
				type="text"
				autocomplete="off"
				spellcheck="false"
				value={browser ? undefined : (add?.values.keywords ?? '')}
				defaultValue={add?.values.keywords ?? ''}
				aria-invalid={field === 'keywords' ? 'true' : undefined}
				aria-describedby={describedBy('keywords')}
				bind:this={keywordsInput}
			/>
		</div>
		<button type="submit">Add interest</button>
	</form>
</section>

<section aria-labelledby="list-heading">
	<h2 id="list-heading">Your interests</h2>
	{#if data.interests.length === 0}
		<p>None yet. Add one above.</p>
	{:else}
		<ul class="interests">
			{#each data.interests as interest (interest.id)}
				<li>
					<article aria-labelledby="interest-{interest.id}">
						<h3 id="interest-{interest.id}">
							{interest.name}{#if interest.paused}<span class="tag">Paused</span>{/if}
						</h3>
						{#if interest.note}<p class="note-text">{interest.note}</p>{/if}
						<dl>
							<div>
								<dt>Keywords</dt>
								<dd>{interest.keywords.length > 0 ? interest.keywords.join(', ') : 'None'}</dd>
							</div>
							<div>
								<dt>Companies</dt>
								<dd>
									{interest.companies.length > 0
										? interest.companies.map((company) => company.company).join(', ')
										: 'None tagged yet'}
								</dd>
							</div>
						</dl>
						<div class="actions">
							<form
								method="POST"
								action={interest.paused ? '?/resume' : '?/pause'}
								use:enhance={afterAction}
							>
								<input type="hidden" name="id" value={interest.id} />
								<button type="submit">
									{interest.paused ? 'Resume' : 'Pause'}<span class="visually-hidden">
										{` ${interest.name}`}
									</span>
								</button>
							</form>
						</div>
						<details>
							<summary>
								Edit<span class="visually-hidden">{` ${interest.name}`}</span> and tag companies…
							</summary>
							<form method="POST" action="?/edit" use:enhance={afterAction} class="edit">
								<input type="hidden" name="id" value={interest.id} />
								<label for="name-{interest.id}">Name</label>
								<input
									id="name-{interest.id}"
									name="name"
									type="text"
									autocomplete="off"
									required
									maxlength="60"
									defaultValue={interest.name}
								/>
								<label for="note-{interest.id}">
									Note <span class="optional">(optional)</span>
								</label>
								<input
									id="note-{interest.id}"
									name="note"
									type="text"
									autocomplete="off"
									maxlength="300"
									defaultValue={interest.note}
								/>
								<label for="keywords-{interest.id}">
									Keywords <span class="optional">(optional, separated by commas)</span>
								</label>
								<input
									id="keywords-{interest.id}"
									name="keywords"
									type="text"
									autocomplete="off"
									spellcheck="false"
									defaultValue={interest.keywords.join(', ')}
								/>
								<fieldset>
									<legend>Companies tagged with {interest.name}</legend>
									{#if data.companies.length === 0}
										<p>No companies yet. <a href={resolve('/companies')}>Add some</a> first.</p>
									{:else}
										<ul class="choices">
											{#each data.companies as company (company.key)}
												<li>
													<input
														id="tag-{interest.id}-{company.key}"
														type="checkbox"
														name="company"
														value={company.key}
														defaultChecked={interest.companies.some(
															(tagged) => tagged.key === company.key
														)}
													/>
													<label for="tag-{interest.id}-{company.key}">
														{company.company}{#if company.paused}
															(paused){/if}
													</label>
												</li>
											{/each}
										</ul>
									{/if}
								</fieldset>
								<button type="submit">
									Save<span class="visually-hidden">{` ${interest.name}`}</span>
								</button>
							</form>
						</details>
						<details>
							<summary>Remove<span class="visually-hidden">{` ${interest.name}`}</span>…</summary>
							<p>
								This removes {interest.name} and its tags. The companies and their jobs stay. It can’t
								be undone; Pause keeps it, if you might want it back.
							</p>
							<form method="POST" action="?/remove" use:enhance={afterAction}>
								<input type="hidden" name="id" value={interest.id} />
								<button type="submit" class="danger">Remove {interest.name}</button>
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
	.hint,
	.optional {
		color: var(--muted);
	}

	.hint {
		margin: 0 0 0.35rem;
		font-size: 1rem;
	}

	.optional {
		font-weight: 400;
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

	label,
	legend {
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

	.interests,
	.choices {
		list-style: none;
		padding: 0;
		margin: 1rem 0;
	}

	.interests > li + li {
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

	.note-text {
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

	.edit {
		display: grid;
		gap: 0.35rem;
		margin-bottom: 0.5rem;
	}

	.edit button {
		justify-self: start;
		margin-top: 0.5rem;
	}

	fieldset {
		margin: 0.75rem 0 0;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--rule);
		border-radius: 4px;
	}

	.choices {
		margin: 0.25rem 0 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
		gap: 0 1rem;
	}

	.choices li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
	}

	.choices label {
		font-weight: 400;
		display: inline;
	}

	.choices input {
		width: 1.4rem;
		height: 1.4rem;
		flex: none;
	}

	.danger {
		border-style: double;
		border-width: 4px;
	}
</style>
