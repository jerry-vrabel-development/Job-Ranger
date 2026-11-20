<script lang="ts">
	import { tick } from 'svelte';
	import { browser } from '$app/env';
	import { enhance, type SubmitFunction } from '$app/forms';
	import {
		EXPERIENCE_LABELS,
		EXPERIENCES,
		KIND_LABELS,
		KINDS,
		ORGANIZATION_MAX,
		PERIOD_MAX,
		shortText,
		TEXT_MAX
	} from '#lib/facts.ts';
	import { countLabel } from '#lib/jobs/display.ts';
	import { pageTitle } from '#lib/site.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Fact = (typeof data.facts)[number];

	let status: HTMLElement | undefined = $state();
	let pasteBox: HTMLTextAreaElement | undefined = $state();
	const inputs: Record<string, { focus: () => void } | undefined> = $state({});

	/** What the last action said. */
	const result = $derived(form && 'result' in form ? form.result : undefined);
	/** A problem with the Add form, and what was typed. */
	const add = $derived(form && 'add' in form ? form.add : undefined);
	const field = $derived(add?.field);
	/** A problem with a paste, and what was pasted. */
	const paste = $derived(form && 'paste' in form ? form.paste : undefined);
	/** A problem with Your details, and what was typed. */
	const details = $derived(form && 'details' in form ? form.details : undefined);
	const detail = (name: keyof typeof data.profile) => details?.values[name] ?? data.profile[name];
	const DETAIL_FIELDS = [
		{
			name: 'name',
			label: 'Name',
			hint: 'As it should appear on a resume.',
			type: 'text',
			auto: 'name'
		},
		{
			name: 'headline',
			label: 'Headline',
			hint: 'One line under your name: “Full-stack developer”.',
			type: 'text',
			auto: 'off'
		},
		{
			name: 'email',
			label: 'Email',
			hint: 'The one employers should write to.',
			type: 'email',
			auto: 'email'
		},
		{ name: 'phone', label: 'Phone', hint: '', type: 'tel', auto: 'tel' },
		{
			name: 'location',
			label: 'Location',
			hint: 'City and state is plenty.',
			type: 'text',
			auto: 'off'
		}
	] as const;

	const toCheck = $derived(data.facts.filter((fact) => !fact.confirmed && !fact.retired));
	const confirmed = $derived(data.facts.filter((fact) => fact.confirmed && !fact.retired));
	const retired = $derived(data.facts.filter((fact) => fact.retired));
	const groups = $derived(
		KINDS.map((kind) => ({
			kind,
			facts: confirmed.filter((fact) => fact.kind === kind)
		})).filter((group) => group.facts.length > 0)
	);

	const afterAction: SubmitFunction =
		() =>
		async ({ update }) => {
			await update({ refreshAll: true });
			await tick();
			if (field) inputs[field]?.focus();
			else if (paste) pasteBox?.focus();
			else if (details) inputs[`detail-${details.field}`]?.focus();
			else status?.focus();
		};

	function describedBy(name: string): string {
		return field === name ? `${name}-error ${name}-hint` : `${name}-hint`;
	}

	function meta(fact: Fact, showKind: boolean): string {
		return [
			showKind ? KIND_LABELS[fact.kind] : '',
			EXPERIENCE_LABELS[fact.experience],
			fact.organization,
			fact.period
		]
			.filter((part) => part !== '')
			.join(' · ');
	}
</script>

<svelte:head>
	<title>{pageTitle('Facts')}</title>
</svelte:head>

<h1>Facts</h1>

<p class="summary">
	Everything true about your work, in one place. Resumes, cover letters and answers will be built
	only from confirmed facts.
	{#if data.facts.length > 0}
		{countLabel(data.facts.length, 'fact')}: {String(confirmed.length)} confirmed, {String(
			toCheck.length
		)} to check, {String(retired.length)} retired.
	{/if}
</p>

{#if result}
	<p class="note" class:problem={!result.ok} role="status" tabindex="-1" bind:this={status}>
		{#if !result.ok}<strong>Not done:</strong>{/if}
		{result.message}
	</p>
{/if}

{#snippet factItem(fact: Fact, showKind: boolean)}
	<li>
		<article aria-labelledby="fact-{fact.id}">
			<p class="fact-text" id="fact-{fact.id}">{fact.text}</p>
			<p class="meta">{meta(fact, showKind)}</p>
			<div class="actions">
				{#if !fact.confirmed && !fact.retired}
					<form method="POST" action="?/confirm" use:enhance={afterAction}>
						<input type="hidden" name="id" value={fact.id} />
						<button type="submit"
							>Confirm<span class="visually-hidden">{` ${shortText(fact.text)}`}</span></button
						>
					</form>
				{/if}
				<form
					method="POST"
					action={fact.retired ? '?/restore' : '?/retire'}
					use:enhance={afterAction}
				>
					<input type="hidden" name="id" value={fact.id} />
					<button type="submit"
						>{fact.retired ? 'Restore' : 'Retire'}<span class="visually-hidden"
							>{` ${shortText(fact.text)}`}</span
						></button
					>
				</form>
			</div>
			<details>
				<summary>Edit<span class="visually-hidden">{` ${shortText(fact.text)}`}</span>…</summary>
				<form method="POST" action="?/edit" use:enhance={afterAction} class="edit">
					<input type="hidden" name="id" value={fact.id} />
					<label for="text-{fact.id}">Fact</label>
					<textarea
						id="text-{fact.id}"
						name="text"
						rows="3"
						maxlength={TEXT_MAX}
						required
						value={browser ? undefined : fact.text}
						defaultValue={fact.text}></textarea>
					<label for="kind-{fact.id}">Kind</label>
					<select id="kind-{fact.id}" name="kind" value={fact.kind}>
						{#each KINDS as kind (kind)}<option value={kind}>{KIND_LABELS[kind]}</option>{/each}
					</select>
					<label for="experience-{fact.id}">Experience</label>
					<select id="experience-{fact.id}" name="experience" value={fact.experience}>
						{#each EXPERIENCES as experience (experience)}
							<option value={experience}>{EXPERIENCE_LABELS[experience]}</option>
						{/each}
					</select>
					<label for="organization-{fact.id}">Where <span class="optional">(optional)</span></label>
					<input
						id="organization-{fact.id}"
						name="organization"
						type="text"
						autocomplete="off"
						maxlength={ORGANIZATION_MAX}
						defaultValue={fact.organization}
					/>
					<label for="period-{fact.id}">When <span class="optional">(optional)</span></label>
					<input
						id="period-{fact.id}"
						name="period"
						type="text"
						autocomplete="off"
						maxlength={PERIOD_MAX}
						defaultValue={fact.period}
					/>
					<button type="submit"
						>Save<span class="visually-hidden">{` ${shortText(fact.text)}`}</span></button
					>
				</form>
			</details>
			<details>
				<summary>Remove<span class="visually-hidden">{` ${shortText(fact.text)}`}</span>…</summary>
				<p>
					This deletes the fact. Retire keeps it out of resumes and letters but lets you bring it
					back; remove is for a fact that was never true.
				</p>
				<form method="POST" action="?/remove" use:enhance={afterAction}>
					<input type="hidden" name="id" value={fact.id} />
					<button type="submit" class="danger"
						>Remove<span class="visually-hidden">{` ${shortText(fact.text)}`}</span></button
					>
				</form>
			</details>
		</article>
	</li>
{/snippet}

{#if toCheck.length > 0}
	<section aria-labelledby="check-heading">
		<h2 id="check-heading">To check ({String(toCheck.length)})</h2>
		<p>
			These were pasted in. Confirm each one that is true and yours; edit it first if it needs a
			fix, and remove anything that isn’t right. Only confirmed facts are used.
		</p>
		<ul class="facts">
			{#each toCheck as fact (fact.id)}{@render factItem(fact, true)}{/each}
		</ul>
	</section>
{/if}

<section aria-labelledby="details-heading">
	<h2 id="details-heading">Your details</h2>
	<p class="hint">
		For the top of your resumes. They stay in Job Ranger and are never sent to a model.
	</p>
	<details open={details !== undefined || data.profile.name === ''}>
		<summary
			>{data.profile.name === ''
				? 'Add your details…'
				: `Edit your details (${data.profile.name})…`}</summary
		>
		<form method="POST" action="?/profile" use:enhance={afterAction} novalidate class="details">
			{#each DETAIL_FIELDS as item (item.name)}
				<div class="field">
					<label for="detail-{item.name}"
						>{item.label} <span class="optional">(optional)</span></label
					>
					{#if item.hint !== ''}
						<p class="hint" id="detail-{item.name}-hint">{item.hint}</p>
					{/if}
					{#if details?.field === item.name}
						<p class="error" id="detail-{item.name}-error">
							<strong>Error:</strong>
							{details.message}
						</p>
					{/if}
					<input
						id="detail-{item.name}"
						name={item.name}
						type={item.type}
						autocomplete={item.auto}
						value={browser ? undefined : detail(item.name)}
						defaultValue={detail(item.name)}
						aria-invalid={details?.field === item.name ? 'true' : undefined}
						aria-describedby={[
							details?.field === item.name ? `detail-${item.name}-error` : '',
							item.hint !== '' ? `detail-${item.name}-hint` : ''
						]
							.filter((id) => id !== '')
							.join(' ') || undefined}
						bind:this={inputs[`detail-${item.name}`]}
					/>
				</div>
			{/each}
			<button type="submit">Save your details</button>
		</form>
	</details>
</section>

<section aria-labelledby="add-heading">
	<h2 id="add-heading">Add a fact</h2>
	<p class="hint">A fact you type here is your own statement, so it counts as confirmed.</p>
	<form method="POST" action="?/add" use:enhance={afterAction} novalidate>
		<div class="field">
			<label for="text">Fact</label>
			<p class="hint" id="text-hint">
				One thing, plainly: “Led the team on the Global Conference expo app on AWS.”
			</p>
			{#if field === 'text'}
				<p class="error" id="text-error"><strong>Error:</strong> {add?.message}</p>
			{/if}
			<textarea
				id="text"
				name="text"
				rows="3"
				maxlength={TEXT_MAX}
				required
				value={browser ? undefined : (add?.values.text ?? '')}
				defaultValue={add?.values.text ?? ''}
				aria-invalid={field === 'text' ? 'true' : undefined}
				aria-describedby={describedBy('text')}
				bind:this={inputs['text']}></textarea>
		</div>
		<div class="row">
			<div class="field">
				<label for="kind">Kind</label>
				<p class="hint" id="kind-hint">What sort of fact.</p>
				{#if field === 'kind'}
					<p class="error" id="kind-error"><strong>Error:</strong> {add?.message}</p>
				{/if}
				<select
					id="kind"
					name="kind"
					value={add?.values.kind ?? 'accomplishment'}
					aria-invalid={field === 'kind' ? 'true' : undefined}
					aria-describedby={describedBy('kind')}
					bind:this={inputs['kind']}
				>
					{#each KINDS as kind (kind)}<option value={kind}>{KIND_LABELS[kind]}</option>{/each}
				</select>
			</div>
			<div class="field">
				<label for="experience">Experience</label>
				<p class="hint" id="experience-hint">How you did it.</p>
				{#if field === 'experience'}
					<p class="error" id="experience-error"><strong>Error:</strong> {add?.message}</p>
				{/if}
				<select
					id="experience"
					name="experience"
					value={add?.values.experience ?? 'professional'}
					aria-invalid={field === 'experience' ? 'true' : undefined}
					aria-describedby={describedBy('experience')}
					bind:this={inputs['experience']}
				>
					{#each EXPERIENCES as experience (experience)}
						<option value={experience}>{EXPERIENCE_LABELS[experience]}</option>
					{/each}
				</select>
			</div>
		</div>
		<div class="row">
			<div class="field">
				<label for="organization">Where <span class="optional">(optional)</span></label>
				<p class="hint" id="organization-hint">A company, client or project.</p>
				{#if field === 'organization'}
					<p class="error" id="organization-error"><strong>Error:</strong> {add?.message}</p>
				{/if}
				<input
					id="organization"
					name="organization"
					type="text"
					autocomplete="off"
					maxlength={ORGANIZATION_MAX}
					value={browser ? undefined : (add?.values.organization ?? '')}
					defaultValue={add?.values.organization ?? ''}
					aria-invalid={field === 'organization' ? 'true' : undefined}
					aria-describedby={describedBy('organization')}
					bind:this={inputs['organization']}
				/>
			</div>
			<div class="field">
				<label for="period">When <span class="optional">(optional)</span></label>
				<p class="hint" id="period-hint">In words: “2018–2020”, “around 2009”.</p>
				{#if field === 'period'}
					<p class="error" id="period-error"><strong>Error:</strong> {add?.message}</p>
				{/if}
				<input
					id="period"
					name="period"
					type="text"
					autocomplete="off"
					maxlength={PERIOD_MAX}
					value={browser ? undefined : (add?.values.period ?? '')}
					defaultValue={add?.values.period ?? ''}
					aria-invalid={field === 'period' ? 'true' : undefined}
					aria-describedby={describedBy('period')}
					bind:this={inputs['period']}
				/>
			</div>
		</div>
		<button type="submit">Add fact</button>
	</form>

	<details class="paste" open={paste !== undefined}>
		<summary>Paste many facts…</summary>
		<form method="POST" action="?/paste" use:enhance={afterAction} novalidate>
			<label for="facts">Facts, one per line</label>
			<p class="hint" id="facts-hint">
				Each line: <code>kind | experience | where | when | the fact</code>. Kinds: {KINDS.join(
					', '
				)}. Experience: professional, side or learning. Lines starting with # are skipped. Pasted
				facts wait under “To check” until you confirm them.
			</p>
			{#if paste}
				<p class="error" id="facts-error"><strong>Error:</strong> {paste.message}</p>
			{/if}
			<textarea
				id="facts"
				name="facts"
				rows="8"
				spellcheck="false"
				value={browser ? undefined : (paste?.pasted ?? '')}
				defaultValue={paste?.pasted ?? ''}
				aria-invalid={paste ? 'true' : undefined}
				aria-describedby={paste ? 'facts-error facts-hint' : 'facts-hint'}
				bind:this={pasteBox}></textarea>
			<button type="submit">Add facts to check</button>
		</form>
	</details>
</section>

<section aria-labelledby="list-heading">
	<h2 id="list-heading">Confirmed facts</h2>
	{#if confirmed.length === 0}
		<p>None yet. Add one above, or paste some and confirm them.</p>
	{:else}
		{#each groups as group (group.kind)}
			<h3>{KIND_LABELS[group.kind]} ({String(group.facts.length)})</h3>
			<ul class="facts">
				{#each group.facts as fact (fact.id)}{@render factItem(fact, false)}{/each}
			</ul>
		{/each}
	{/if}
</section>

{#if retired.length > 0}
	<section aria-labelledby="retired-heading">
		<h2 id="retired-heading">Retired ({String(retired.length)})</h2>
		<p>Kept for the record but not used. Restore one to use it again.</p>
		<ul class="facts">
			{#each retired as fact (fact.id)}{@render factItem(fact, true)}{/each}
		</ul>
	</section>
{/if}

<style>
	.summary,
	.hint,
	.optional,
	.meta {
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
	input[type='email'],
	input[type='tel'],
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

	code {
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

	.facts {
		list-style: none;
		padding: 0;
		margin: 1rem 0;
	}

	.facts > li + li {
		margin-top: 0.75rem;
	}

	article {
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 6px;
		padding: 0.75rem 1.25rem;
		overflow-wrap: anywhere;
	}

	.fact-text {
		margin: 0;
		font-weight: 600;
	}

	.meta {
		margin: 0.25rem 0 0;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
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

	.paste {
		margin-top: 1.5rem;
	}

	.paste form {
		display: grid;
		gap: 0.35rem;
	}

	.paste button {
		justify-self: start;
		margin-top: 0.5rem;
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
