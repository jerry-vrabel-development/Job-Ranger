<script lang="ts">
	import { tick } from 'svelte';
	import { browser } from '$app/env';
	import { enhance, type SubmitFunction } from '$app/forms';
	import {
		LABEL_MAX,
		NOTES_MAX,
		ORIGIN_LABELS,
		ORIGINS,
		QUESTION_LABELS,
		QUESTIONS,
		TEXT_MAX,
		wordCount
	} from '#lib/answers.ts';
	import { countLabel } from '#lib/jobs/display.ts';
	import { pageTitle } from '#lib/site.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Answer = (typeof data.answers)[number];

	let status: HTMLElement | undefined = $state();
	const inputs: Record<string, { focus: () => void } | undefined> = $state({});
	/** Words typed so far in the Add form (shown once JavaScript runs). */
	let typed = $state(0);
	/** What the last copy did, said in words. */
	let copied = $state('');

	const result = $derived(form && 'result' in form ? form.result : undefined);
	const add = $derived(form && 'add' in form ? form.add : undefined);
	const field = $derived(add?.field);

	const groups = $derived(
		QUESTIONS.map((question) => ({
			question,
			answers: data.answers.filter((answer) => answer.question === question)
		})).filter((group) => group.answers.length > 0)
	);
	/** Common questions (not "Other") with no answer yet. */
	const open = $derived(
		QUESTIONS.filter(
			(question) =>
				question !== 'other' && !data.answers.some((answer) => answer.question === question)
		)
	);

	const afterAction: SubmitFunction =
		() =>
		async ({ update }) => {
			copied = '';
			await update({ refreshAll: true });
			await tick();
			if (field) inputs[field]?.focus();
			else status?.focus();
		};

	function describedBy(name: string): string {
		return field === name ? `${name}-error ${name}-hint` : `${name}-hint`;
	}

	function name(answer: Answer): string {
		const label = answer.label === '' ? '' : `, ${answer.label}`;
		return `${QUESTION_LABELS[answer.question]}${label}`;
	}

	async function copy(answer: Answer) {
		try {
			await navigator.clipboard.writeText(answer.text);
			copied = `Copied “${name(answer)}”. Paste it into the form.`;
		} catch {
			copied = 'Couldn’t copy here. Select the answer’s text and copy it instead.';
		}
		await tick();
		status?.focus();
	}
</script>

<svelte:head>
	<title>{pageTitle('Answers')}</title>
</svelte:head>

<h1>Answers</h1>

<p class="summary">
	Ready answers for the questions most forms ask. Write each once, copy it into any form, and keep a
	few versions (50 or 150 words) where a question comes in different sizes.
	{#if data.answers.length > 0}
		{countLabel(data.answers.length, 'answer')} saved.
	{/if}
</p>

{#if copied !== ''}
	<p class="note" role="status" tabindex="-1" bind:this={status}>{copied}</p>
{:else if result}
	<p class="note" class:problem={!result.ok} role="status" tabindex="-1" bind:this={status}>
		{#if !result.ok}<strong>Not done:</strong>{/if}
		{result.message}
	</p>
{/if}

<section aria-labelledby="add-heading">
	<h2 id="add-heading">Add an answer</h2>
	<form method="POST" action="?/add" use:enhance={afterAction} novalidate>
		<div class="row">
			<div class="field">
				<label for="question">Question</label>
				<p class="hint" id="question-hint">Which kind of question this answers.</p>
				{#if field === 'question'}
					<p class="error" id="question-error"><strong>Error:</strong> {add?.message}</p>
				{/if}
				<select
					id="question"
					name="question"
					value={add?.values.question ?? open[0] ?? 'other'}
					aria-invalid={field === 'question' ? 'true' : undefined}
					aria-describedby={describedBy('question')}
					bind:this={inputs['question']}
				>
					{#each QUESTIONS as question (question)}
						<option value={question}>{QUESTION_LABELS[question]}</option>
					{/each}
				</select>
			</div>
			<div class="field">
				<label for="label">Name <span class="optional">(optional)</span></label>
				<p class="hint" id="label-hint">To tell versions apart: “150 words”.</p>
				{#if field === 'label'}
					<p class="error" id="label-error"><strong>Error:</strong> {add?.message}</p>
				{/if}
				<input
					id="label"
					name="label"
					type="text"
					autocomplete="off"
					maxlength={LABEL_MAX}
					value={browser ? undefined : (add?.values.label ?? '')}
					defaultValue={add?.values.label ?? ''}
					aria-invalid={field === 'label' ? 'true' : undefined}
					aria-describedby={describedBy('label')}
					bind:this={inputs['label']}
				/>
			</div>
		</div>
		<div class="field">
			<label for="text">Answer</label>
			<p class="hint" id="text-hint">
				Paragraphs are kept.{#if browser}
					<span aria-live="polite">{` ${countLabel(typed, 'word')} so far.`}</span>{/if}
			</p>
			{#if field === 'text'}
				<p class="error" id="text-error"><strong>Error:</strong> {add?.message}</p>
			{/if}
			<textarea
				id="text"
				name="text"
				rows="6"
				maxlength={TEXT_MAX}
				required
				value={browser ? undefined : (add?.values.text ?? '')}
				defaultValue={add?.values.text ?? ''}
				oninput={(event) => (typed = wordCount(event.currentTarget.value))}
				aria-invalid={field === 'text' ? 'true' : undefined}
				aria-describedby={describedBy('text')}
				bind:this={inputs['text']}></textarea>
		</div>
		<div class="field">
			<label for="origin">How it was written</label>
			<p class="hint" id="origin-hint">
				Your own words, and ones written together, can be used even where a posting forbids AI.
			</p>
			{#if field === 'origin'}
				<p class="error" id="origin-error"><strong>Error:</strong> {add?.message}</p>
			{/if}
			<select
				id="origin"
				name="origin"
				value={add?.values.origin ?? 'own'}
				aria-invalid={field === 'origin' ? 'true' : undefined}
				aria-describedby={describedBy('origin')}
				bind:this={inputs['origin']}
			>
				{#each ORIGINS as origin (origin)}<option value={origin}>
						{ORIGIN_LABELS[origin]}
					</option>{/each}
			</select>
		</div>
		<div class="field">
			<label for="notes">Notes <span class="optional">(optional)</span></label>
			<p class="hint" id="notes-hint">How it was made: your rough notes, where it came from.</p>
			{#if field === 'notes'}
				<p class="error" id="notes-error"><strong>Error:</strong> {add?.message}</p>
			{/if}
			<textarea
				id="notes"
				name="notes"
				rows="3"
				maxlength={NOTES_MAX}
				value={browser ? undefined : (add?.values.notes ?? '')}
				defaultValue={add?.values.notes ?? ''}
				aria-invalid={field === 'notes' ? 'true' : undefined}
				aria-describedby={describedBy('notes')}
				bind:this={inputs['notes']}></textarea>
		</div>
		<button type="submit">Save answer</button>
	</form>
</section>

<section aria-labelledby="list-heading">
	<h2 id="list-heading">Your answers</h2>
	{#if open.length > 0}
		<details class="open">
			<summary>Common questions without an answer yet ({String(open.length)})</summary>
			<ul>
				{#each open as question (question)}<li>{QUESTION_LABELS[question]}</li>{/each}
			</ul>
		</details>
	{/if}
	{#if data.answers.length === 0}
		<p>None yet. Start with the quick ones: work authorization, start date and location.</p>
	{:else}
		{#each groups as group (group.question)}
			<h3>{QUESTION_LABELS[group.question]}</h3>
			<ul class="answers">
				{#each group.answers as answer (answer.id)}
					<li>
						<article aria-label={name(answer)}>
							<p class="meta">
								{[
									answer.label,
									ORIGIN_LABELS[answer.origin],
									countLabel(wordCount(answer.text), 'word')
								]
									.filter((part) => part !== '')
									.join(' · ')}
							</p>
							<p class="text">{answer.text}</p>
							{#if answer.notes !== ''}
								<p class="notes"><span class="label">Notes:</span> {answer.notes}</p>
							{/if}
							{#if browser}
								<button type="button" onclick={() => copy(answer)}>
									Copy<span class="visually-hidden">{` ${name(answer)}`}</span>
								</button>
							{/if}
							<details>
								<summary>Edit<span class="visually-hidden">{` ${name(answer)}`}</span>…</summary>
								<form method="POST" action="?/edit" use:enhance={afterAction} class="edit">
									<input type="hidden" name="id" value={answer.id} />
									<label for="question-{answer.id}">Question</label>
									<select id="question-{answer.id}" name="question" value={answer.question}>
										{#each QUESTIONS as question (question)}
											<option value={question}>{QUESTION_LABELS[question]}</option>
										{/each}
									</select>
									<label for="label-{answer.id}">
										Name <span class="optional">(optional)</span>
									</label>
									<input
										id="label-{answer.id}"
										name="label"
										type="text"
										autocomplete="off"
										maxlength={LABEL_MAX}
										defaultValue={answer.label}
									/>
									<label for="text-{answer.id}">Answer</label>
									<textarea
										id="text-{answer.id}"
										name="text"
										rows="6"
										maxlength={TEXT_MAX}
										required
										value={browser ? undefined : answer.text}
										defaultValue={answer.text}></textarea>
									<label for="origin-{answer.id}">How it was written</label>
									<select id="origin-{answer.id}" name="origin" value={answer.origin}>
										{#each ORIGINS as origin (origin)}<option value={origin}>
												{ORIGIN_LABELS[origin]}
											</option>{/each}
									</select>
									<label for="notes-{answer.id}">
										Notes <span class="optional">(optional)</span>
									</label>
									<textarea
										id="notes-{answer.id}"
										name="notes"
										rows="3"
										maxlength={NOTES_MAX}
										value={browser ? undefined : answer.notes}
										defaultValue={answer.notes}></textarea>
									<button type="submit">
										Save<span class="visually-hidden">{` ${name(answer)}`}</span>
									</button>
								</form>
							</details>
							<details>
								<summary>Remove<span class="visually-hidden">{` ${name(answer)}`}</span>…</summary>
								<p>This deletes the answer for good.</p>
								<form method="POST" action="?/remove" use:enhance={afterAction}>
									<input type="hidden" name="id" value={answer.id} />
									<button type="submit" class="danger">
										Remove<span class="visually-hidden">{` ${name(answer)}`}</span>
									</button>
								</form>
							</details>
						</article>
					</li>
				{/each}
			</ul>
		{/each}
	{/if}
</section>

<style>
	.summary,
	.hint,
	.optional,
	.meta,
	.notes {
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
		overflow-wrap: anywhere;
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

	h3 {
		font-size: 1.2rem;
		margin: 1.5rem 0 0.5rem;
	}

	.field {
		margin-bottom: 1rem;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0 1rem;
	}

	.row .field {
		flex: 1 1 12rem;
		min-width: 0;
	}

	label {
		display: block;
		font-weight: 600;
	}

	input[type='text'],
	select,
	textarea {
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

	.answers {
		list-style: none;
		padding: 0;
		margin: 1rem 0;
	}

	.answers > li + li {
		margin-top: 0.75rem;
	}

	article {
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 6px;
		padding: 0.75rem 1.25rem;
		overflow-wrap: anywhere;
	}

	.meta {
		margin: 0;
	}

	.text {
		white-space: pre-wrap;
		margin: 0.5rem 0;
	}

	.notes {
		white-space: pre-wrap;
		font-size: 1rem;
	}

	.label {
		font-weight: 600;
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

	.danger {
		border-style: double;
		border-width: 4px;
	}
</style>
