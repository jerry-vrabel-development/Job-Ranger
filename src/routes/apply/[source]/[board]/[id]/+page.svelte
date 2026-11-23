<script lang="ts">
	import PayMissing from '#lib/signals/PayMissing.svelte';
	import { tick } from 'svelte';
	import { browser } from '$app/env';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { resolve } from '$app/paths';
	import {
		ORIGIN_LABELS,
		QUESTION_LABELS,
		QUESTIONS,
		wordCount,
		type Question
	} from '#lib/answers.ts';
	import { countLabel } from '#lib/jobs/display.ts';
	import { letterText } from '#lib/kit/letter.ts';
	import { pageTitle } from '#lib/site.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Answer = (typeof data.answers)[number];

	let status: HTMLElement | undefined = $state();
	let copied = $state('');
	/** For questions no type matched: the type I picked to browse, by question number. */
	const picked: Record<number, Question | ''> = $state({});

	const result = $derived(form && 'result' in form ? form.result : undefined);
	const pastedBack = $derived(form && 'pasted' in form ? form.pasted : undefined);
	const postingBack = $derived(form && 'posting' in form ? form.posting : undefined);
	/** An edited answer that couldn't be saved, to put back in its box. */
	const keptBack = $derived(form && 'kept' in form ? form.kept : undefined);
	/** A summary that couldn't go on the resume, to put back in its box. */
	const summaryBack = $derived(form && 'summary' in form ? form.summary : undefined);
	const summary = $derived(data.drafting.summary);
	/** The last review's suggestions, and which box they're for. */
	const review = $derived(form && 'review' in form ? form.review : undefined);
	const GAP_ANSWERS = [
		{ value: 'professional', label: 'Professional' },
		{ value: 'side', label: 'Side project or hobby' },
		{ value: 'learning', label: 'Learning now' },
		{ value: 'no', label: 'No' }
	] as const;
	const kit = $derived(data.kit);
	const job = $derived(data.job);
	const forbids = $derived(kit?.aiRule === 'forbids');

	const afterAction: SubmitFunction =
		({ action }) =>
		async ({ update }) => {
			copied = '';
			// A review changes nothing, so the box keeps what I typed.
			await update({ refreshAll: true, reset: !action.search.startsWith('?/review') });
			await tick();
			status?.focus();
		};

	function pickedAnswers(index: number): Answer[] {
		const type = picked[index];
		if (!type) return [];
		return data.answers.filter(
			(answer) => answer.question === type && !(forbids && answer.origin === 'ai_edited')
		);
	}

	async function copy(answer: Answer, question: string) {
		try {
			await navigator.clipboard.writeText(answer.text);
			copied = `Copied your answer for “${question}”. Paste it into the form.`;
		} catch {
			copied = 'Couldn’t copy here. Select the answer’s text and copy it instead.';
		}
		await tick();
		status?.focus();
	}

	type Draft = (typeof data.drafting.drafts)[number];

	/** The problem numbers (from 1) found in one sentence. */
	function flags(draft: Checked, p: number, s: number): number[] {
		return draft.problems.flatMap((problem, i) =>
			problem.paragraph === p && problem.sentence === s ? [i + 1] : []
		);
	}

	type Checked = Pick<Draft, 'paragraphs' | 'problems'>;

	/** A paragraph as one string, with "[Check n]" after each sentence the checks flagged. */
	function paragraphText(draft: Checked, p: number): string {
		return (draft.paragraphs[p] ?? [])
			.map((sentence, s) =>
				[sentence.text, ...flags(draft, p, s).map((n) => `[Check ${String(n)}]`)].join(' ')
			)
			.join(' ');
	}

	async function copyLetter(draft: Draft) {
		try {
			await navigator.clipboard.writeText(letterText(draft.paragraphs, data.drafting.name));
			copied = 'Copied the letter. Read it once more in the form before you send it.';
		} catch {
			copied = 'Couldn’t copy here. Select the letter’s text and copy it instead.';
		}
		await tick();
		status?.focus();
	}

	function meta(answer: Answer): string {
		return [answer.label, ORIGIN_LABELS[answer.origin], countLabel(wordCount(answer.text), 'word')]
			.filter((part) => part !== '')
			.join(' · ');
	}
</script>

{#snippet suggestions(list: readonly { label: string; detail: string }[])}
	<div class="review">
		{#if list.length === 0}
			<p>
				<strong>Review:</strong> nothing to fix in names, length or numbers. Tone and clarity are yours
				to judge.
			</p>
		{:else}
			<p><strong>Review ({String(list.length)}), suggestions only:</strong></p>
			<ul>
				{#each list as suggestion, i (i)}
					<li><strong>{suggestion.label}:</strong> {suggestion.detail}</li>
				{/each}
			</ul>
		{/if}
	</div>
{/snippet}

<svelte:head>
	<title>{pageTitle(`Apply: ${job.title}`)}</title>
</svelte:head>

<p class="back"><a href={resolve('/jobs')}>Back to jobs</a></p>

<h1>Apply: {job.title}</h1>
<p class="company">{job.company} · {job.where} · {job.pay}</p>

{#if job.closed}
	<p class="note"><strong>Closed:</strong> this job has left {job.sourceName}'s board.</p>
{/if}
{#if job.ghost}
	<p class="note"><strong>Ghost-job warning:</strong> {job.ghost}</p>
{/if}
{#if job.payLaws}
	<PayMissing laws={job.payLaws} />
{/if}
{#if kit && kit.scam.length > 0}
	<div class="note">
		<p>
			<strong>Scam check ({String(kit.scam.length)}):</strong> the posting’s text has patterns job scams
			use. A reason to look closer, not a verdict.
		</p>
		<ul>
			{#each kit.scam as flag (flag.label)}
				<li><strong>{flag.label}:</strong> “{flag.quote}” {flag.why}</li>
			{/each}
		</ul>
	</div>
{/if}

{#if copied !== ''}
	<p class="note" role="status" tabindex="-1" bind:this={status}>{copied}</p>
{:else if result}
	<p class="note" class:problem={!result.ok} role="status" tabindex="-1" bind:this={status}>
		{#if !result.ok}<strong>Not done:</strong>{/if}
		{result.message}
	</p>
{/if}

<p class="links">
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the employer's own apply page -->
	<a class="apply" href={job.applyUrl} target="_blank" rel="noopener noreferrer"
		>Open the application<span class="visually-hidden"> (opens in a new tab)</span></a
	>
	{#if job.jobUrl && job.jobUrl !== job.applyUrl}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the employer's own posting -->
		<a href={job.jobUrl} target="_blank" rel="noopener noreferrer"
			>Read the posting<span class="visually-hidden"> (opens in a new tab)</span></a
		>
	{/if}
</p>

{#if kit === null}
	<section aria-labelledby="prepare-heading">
		<h2 id="prepare-heading">Prepare the kit</h2>
		<p>
			{#if job.source === 'greenhouse'}
				Job Ranger reads this form's questions from Greenhouse, checks the posting for a rule
				against AI-written answers, and lines up your saved answers for each question.
			{:else}
				{job.sourceName} doesn't share a form's questions, so you'll paste them in from the form. Your
				saved answers are then lined up for each one.
			{/if}
		</p>
		<form method="POST" action="?/prepare" use:enhance={afterAction}>
			<button type="submit">Prepare the kit</button>
		</form>
	</section>
{:else}
	<section aria-labelledby="rule-heading">
		<h2 id="rule-heading">AI rule</h2>
		{#if kit.aiRule === 'forbids'}
			<p>
				<strong
					>This posting forbids AI-written answers{kit.aiDecidedBy === 'me'
						? ' (your call)'
						: ''}.</strong
				>
				Only answers in your own words, or written together, are offered below.
			</p>
			{#if kit.aiSentence !== ''}
				<blockquote>{kit.aiSentence}</blockquote>
			{/if}
		{:else if kit.aiRule === 'none'}
			<p>
				<strong
					>No AI rule{kit.aiDecidedBy === 'me' ? ' (your call)' : ' found in the posting'}.</strong
				>
				{#if kit.aiDecidedBy === 'check'}
					The check looks for a sentence that mentions AI with a “not”; it can miss one.
				{/if}
			</p>
		{:else}
			<p>
				<strong>Not checked.</strong> Job Ranger couldn't read this posting's text. Look on the posting
				for a line about AI, and say below.
			</p>
		{/if}
		<details>
			<summary
				>{kit.aiRule === 'unknown' ? 'Say whether there is an AI rule…' : 'Change this…'}</summary
			>
			<form method="POST" action="?/rule" use:enhance={afterAction} class="stack">
				<label for="sentence"
					>The posting's line about AI <span class="optional">(optional)</span></label
				>
				<input
					id="sentence"
					name="sentence"
					type="text"
					autocomplete="off"
					maxlength="500"
					defaultValue={kit.aiSentence}
				/>
				<div class="buttons">
					<button type="submit" name="rule" value="forbids">It forbids AI answers</button>
					<button type="submit" name="rule" value="none">No AI rule</button>
				</div>
			</form>
		</details>
	</section>

	<section aria-labelledby="questions-heading">
		<h2 id="questions-heading">Questions ({String(kit.items.length)})</h2>
		<p class="hint">{kit.readNote}</p>
		{#if kit.basics.length > 0}
			<p>The form also asks for: {kit.basics.join(', ')}.</p>
		{/if}
		{#if kit.items.length === 0}
			<p>No questions yet. Paste them in from the form below.</p>
		{:else}
			<ol class="questions">
				{#each kit.items as item, index (index)}
					<li>
						<h3>{item.label}</h3>
						<p class="meta">
							{[
								item.required ? 'Required' : '',
								item.from === 'pasted' ? 'Pasted in' : '',
								item.typeLabel === null ? 'No saved type matches' : `Matches: ${item.typeLabel}`
							]
								.filter((part) => part !== '')
								.join(' · ')}
						</p>
						{#if item.draftable && kit.aiRule !== 'forbids'}
							{#if item.draft}
								<div class="answer draft">
									<p class="meta">
										<strong>Drafted answer</strong> · {item.draft.created} · {item.draft.cost}
									</p>
									{#if item.draft.problems.length > 0}
										<div class="problems">
											<p>
												<strong>Check before using ({String(item.draft.problems.length)}):</strong>
											</p>
											<ol>
												{#each item.draft.problems as problem, i (i)}
													<li>
														{problem.paragraph < 0
															? 'The answer'
															: `Paragraph ${String(problem.paragraph + 1)}, sentence ${String(problem.sentence + 1)}`}:
														{problem.problem}
													</li>
												{/each}
											</ol>
										</div>
									{:else}
										<p><strong>Checks passed:</strong> every sentence is backed by its facts.</p>
									{/if}
									{#each item.draft.paragraphs.map( (_, p) => paragraphText(item.draft ?? { paragraphs: [], problems: [] }, p) ) as paragraph, p (p)}
										<p class="text">{paragraph}</p>
									{/each}
									<details>
										<summary>Facts each sentence uses…</summary>
										<ul>
											{#each item.draft.used.flat() as used, u (u)}
												<li>{used.length === 0 ? 'No facts: framing only.' : used.join('; ')}</li>
											{/each}
										</ul>
									</details>
									<form method="POST" action="?/keepAnswer" use:enhance={afterAction} class="stack">
										<input type="hidden" name="question" value={item.label} />
										<label for="keep-{index}">Make it yours, then save it to Answers</label>
										<p class="hint" id="keep-{index}-hint">
											It’s saved as “AI draft, edited by me”, so it’s never offered where a posting
											forbids AI.
										</p>
										<textarea
											id="keep-{index}"
											name="text"
											rows="6"
											aria-describedby="keep-{index}-hint"
											value={browser
												? undefined
												: keptBack?.question === item.label
													? keptBack.edited
													: item.draft.text}
											defaultValue={keptBack?.question === item.label
												? keptBack.edited
												: item.draft.text}></textarea>
										{#if review?.field === `answer:${item.label}`}
											{@render suggestions(review.suggestions)}
										{/if}
										<div class="buttons">
											<button type="submit" formaction="?/reviewAnswer"
												>Review<span class="visually-hidden">{` ${item.label}`}</span></button
											>
											<button type="submit"
												>Save to Answers<span class="visually-hidden">{` ${item.label}`}</span
												></button
											>
										</div>
									</form>
								</div>
							{/if}
							{#if data.drafting.ready}
								<form method="POST" action="?/draftAnswer" use:enhance={afterAction}>
									<input type="hidden" name="question" value={item.label} />
									<button type="submit"
										>{item.draft ? 'Draft again' : 'Draft an answer'}<span class="visually-hidden"
											>{` for ${item.label}`}</span
										></button
									>
								</form>
							{/if}
						{/if}
						{#if item.type !== null}
							{#if item.answers.length === 0}
								<p>
									No saved answer for {item.typeLabel} yet{item.hidden > 0
										? ` you can use here (${countLabel(item.hidden, 'AI-edited answer')} left out)`
										: ''}. <a href={resolve('/answers')}>Add one on Answers</a>.
								</p>
							{/if}
							{#each item.answers as answer (answer.id)}
								<div class="answer">
									<p class="meta">{meta(answer)}</p>
									<p class="text">{answer.text}</p>
									{#if browser}
										<button type="button" onclick={() => copy(answer, item.label)}
											>Copy<span class="visually-hidden">{` answer for ${item.label}`}</span
											></button
										>
									{/if}
								</div>
							{/each}
							{#if item.hidden > 0 && item.answers.length > 0}
								<p class="hint">
									{countLabel(item.hidden, 'AI-edited answer')} left out: this posting forbids AI answers.
								</p>
							{/if}
						{:else if browser}
							<label for="pick-{index}">Show saved answers for</label>
							<select id="pick-{index}" bind:value={picked[index]}>
								<option value="">Choose a question type</option>
								{#each QUESTIONS as question (question)}
									<option value={question}>{QUESTION_LABELS[question]}</option>
								{/each}
							</select>
							{#each pickedAnswers(index) as answer (answer.id)}
								<div class="answer">
									<p class="meta">{meta(answer)}</p>
									<p class="text">{answer.text}</p>
									<button type="button" onclick={() => copy(answer, item.label)}
										>Copy<span class="visually-hidden">{` answer for ${item.label}`}</span></button
									>
								</div>
							{/each}
						{:else}
							<p><a href={resolve('/answers')}>Look through your saved answers</a>.</p>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}

		<details open={pastedBack !== undefined}>
			<summary>Paste questions from the form…</summary>
			<form method="POST" action="?/pasted" use:enhance={afterAction} class="stack">
				<label for="pasted">Questions, one per line</label>
				<p class="hint" id="pasted-hint">
					This replaces your earlier paste. Leave out name, email, phone and files.
				</p>
				<textarea
					id="pasted"
					name="pasted"
					rows="6"
					aria-describedby="pasted-hint"
					value={browser ? undefined : (pastedBack ?? kit.pasted)}
					defaultValue={pastedBack ?? kit.pasted}></textarea>
				<button type="submit">Save questions</button>
			</form>
		</details>
		{#if job.source === 'greenhouse'}
			<form method="POST" action="?/prepare" use:enhance={afterAction}>
				<button type="submit">Read the form again</button>
			</form>
		{/if}
	</section>

	<section aria-labelledby="resume-heading">
		<h2 id="resume-heading">Resume</h2>
		{#if data.factCount === 0}
			<p>
				Your resume is built from confirmed facts, and none are confirmed yet. <a
					href={resolve('/facts')}>Add or confirm facts</a
				>.
			</p>
		{:else}
			<p>
				<a
					href={resolve('/apply/[source]/[board]/[id]/resume', {
						source: job.source,
						board: job.board,
						id: job.id
					})}>Open the resume for this job</a
				>: picked from your {countLabel(data.factCount, 'confirmed fact')}, ready to print or save
				as a PDF.
			</p>
		{/if}
		<details open={postingBack !== undefined}>
			<summary
				>{kit.postingText === ''
					? 'Paste the posting’s text…'
					: 'Change the posting’s text…'}</summary
			>
			<form method="POST" action="?/posting" use:enhance={afterAction} class="stack">
				<label for="posting">The posting’s text</label>
				<p class="hint" id="posting-hint">
					Helps pick the facts that fit and find skills you haven’t added. The AI-rule check reads
					it too, unless you’ve decided that yourself.
				</p>
				<textarea
					id="posting"
					name="posting"
					rows="6"
					aria-describedby="posting-hint"
					value={browser ? undefined : (postingBack ?? kit.postingText)}
					defaultValue={postingBack ?? kit.postingText}></textarea>
				<button type="submit">Save the posting’s text</button>
			</form>
		</details>
		<h3 id="summary-heading">Summary</h3>
		{#if kit.aiRule === 'forbids'}
			<p>
				This posting forbids AI-written answers, so the resume’s summary is your picked facts, as
				they are.
			</p>
		{:else}
			{#if summary?.kept}
				<p>
					<strong>On the resume:</strong>
					{summary.kept.edited
						? 'your edited version of the drafted summary.'
						: 'the drafted summary, as drafted.'}
				</p>
				<form method="POST" action="?/dropSummary" use:enhance={afterAction}>
					<button type="submit">Use your picked facts instead</button>
				</form>
			{:else}
				<p>The resume’s summary is your picked facts, as they are, until you choose a draft.</p>
			{/if}
			{#if !data.drafting.ready}
				<p>Drafting isn’t set up yet, so Job Ranger can’t draft a summary.</p>
			{:else}
				<p>
					{data.drafting.label} can draft a summary fitted to this job, from the facts picked for it.
					Each sentence names the facts it uses, and code checks it against them.
				</p>
				<form method="POST" action="?/draftSummary" use:enhance={afterAction}>
					<button type="submit">{summary ? 'Draft the summary again' : 'Draft a summary'}</button>
				</form>
			{/if}
			{#if summary}
				<article class="answer draft" aria-labelledby="summary-draft-heading">
					<h4 id="summary-draft-heading">Drafted summary</h4>
					<p class="meta">Drafted {summary.created} · {summary.cost}</p>
					{#if summary.problems.length > 0}
						<div class="problems">
							<p><strong>Check before using ({String(summary.problems.length)}):</strong></p>
							<ol>
								{#each summary.problems as problem, i (i)}
									<li>
										{problem.paragraph < 0
											? 'The summary'
											: `Sentence ${String(problem.sentence + 1)}`}:
										{problem.problem}
									</li>
								{/each}
							</ol>
						</div>
					{:else}
						<p><strong>Checks passed:</strong> every sentence is backed by the facts it names.</p>
					{/if}
					{#each summary.paragraphs.map((_, p) => paragraphText(summary, p)) as paragraph, p (p)}
						<p class="text">{paragraph}</p>
					{/each}
					<details>
						<summary>Facts each sentence uses…</summary>
						<ul>
							{#each summary.used.flat() as used, u (u)}
								<li>{used.length === 0 ? 'No facts.' : used.join('; ')}</li>
							{/each}
						</ul>
					</details>
					<form method="POST" action="?/keepSummary" use:enhance={afterAction} class="stack">
						<label for="keep-summary">Put it on the resume, as it is or as you edit it</label>
						<p class="hint" id="keep-summary-hint">
							{summary.problems.length > 0
								? 'Fix or cut the flagged sentences first.'
								: 'Read it first: it goes on the resume as your words.'}
						</p>
						<textarea
							id="keep-summary"
							name="summary"
							rows="4"
							aria-describedby="keep-summary-hint"
							value={browser ? undefined : (summaryBack ?? summary.kept?.text ?? summary.text)}
							defaultValue={summaryBack ?? summary.kept?.text ?? summary.text}></textarea>
						{#if review?.field === 'summary'}
							{@render suggestions(review.suggestions)}
						{/if}
						<div class="buttons">
							<button type="submit" formaction="?/reviewSummary">Review</button>
							<button type="submit">Use on the resume</button>
						</div>
					</form>
				</article>
			{/if}
		{/if}
		{#if kit.gaps.length > 0}
			<h3>Skills the posting names that aren’t in your facts</h3>
			<p>
				Have you used them? A yes becomes a fact, labeled the way you say, so it’s never claimed as
				more than it was.
			</p>
			<ul class="gaps">
				{#each kit.gaps as skill (skill)}
					<li>
						<form method="POST" action="?/gap" use:enhance={afterAction}>
							<input type="hidden" name="skill" value={skill} />
							<fieldset>
								<legend>{skill}</legend>
								<div class="buttons">
									{#each GAP_ANSWERS as answer (answer.value)}
										<button type="submit" name="answer" value={answer.value}
											>{answer.label}<span class="visually-hidden">{` ${skill}`}</span></button
										>
									{/each}
								</div>
							</fieldset>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section aria-labelledby="letter-heading">
		<h2 id="letter-heading">Cover letter</h2>
		{#if kit.aiRule === 'forbids'}
			<p>
				This posting forbids AI-written answers, so Job Ranger won’t draft a letter for it. Write it
				in your own words, from your facts.
			</p>
		{:else if !data.drafting.ready}
			<p>{data.drafting.notReady} The README says how to set it up.</p>
		{:else}
			<p>
				{data.drafting.label} drafts from the facts picked for this job. Each sentence names the facts
				it uses, and code checks it against them. Spent today: {data.drafting.spent} of {data
					.drafting.cap}.
			</p>
			<form method="POST" action="?/draft" use:enhance={afterAction} class="buttons">
				<button type="submit" name="kind" value="letter_full">Draft a full letter</button>
				<button type="submit" name="kind" value="letter_short">Draft a short letter</button>
			</form>
		{/if}
		{#each data.drafting.drafts as draft (draft.kind)}
			<article class="letter" aria-labelledby="draft-{draft.kind}">
				<h3 id="draft-{draft.kind}">
					{draft.kind === 'letter_full' ? 'Full letter' : 'Short letter'}
				</h3>
				<p class="meta">Drafted {draft.created} · {draft.cost}</p>
				{#if draft.problems.length > 0}
					<div class="problems">
						<p><strong>Check before using ({String(draft.problems.length)}):</strong></p>
						<ol>
							{#each draft.problems as problem, i (i)}
								<li>
									{problem.paragraph < 0
										? 'The letter'
										: `Paragraph ${String(problem.paragraph + 1)}, sentence ${String(problem.sentence + 1)}`}:
									{problem.problem}
								</li>
							{/each}
						</ol>
					</div>
				{:else}
					<p><strong>Checks passed:</strong> every sentence is backed by the facts it names.</p>
				{/if}
				<div class="text">
					<p>Dear hiring team,</p>
					{#each draft.paragraphs.map((_, p) => paragraphText(draft, p)) as paragraph, p (p)}
						<p>{paragraph}</p>
					{/each}
					<p>Sincerely,<br />{data.drafting.name === '' ? '[Your name]' : data.drafting.name}</p>
				</div>
				{#if browser}
					<button type="button" onclick={() => copyLetter(draft)}
						>Copy the {draft.kind === 'letter_full' ? 'full' : 'short'} letter</button
					>
				{/if}
				<details>
					<summary>Facts each sentence uses…</summary>
					<ol>
						{#each draft.paragraphs as paragraph, p (p)}
							{#each paragraph as sentence, s (s)}
								<li>
									<p>{sentence.text}</p>
									<ul>
										{#each draft.used[p]?.[s] ?? [] as used, u (u)}<li>{used}</li>{:else}<li>
												No facts: framing only.
											</li>{/each}
									</ul>
								</li>
							{/each}
						{/each}
					</ol>
				</details>
			</article>
		{/each}
	</section>
{/if}

<section aria-labelledby="applied-heading">
	<h2 id="applied-heading">Applied?</h2>
	{#if data.drafting.thisJob}
		<p><strong>Drafting for this application so far:</strong> {data.drafting.thisJob}.</p>
	{/if}
	{#if data.drafting.perApplication}
		<p class="hint">
			Across {countLabel(data.drafting.perApplication.applications, 'application')}: {data.drafting
				.perApplication.total} of drafting in all, {data.drafting.perApplication.average} each on average.
		</p>
	{/if}
	{#if data.applied}
		<p><strong>You applied on {data.applied}.</strong></p>
		<form method="POST" action="?/unapplied" use:enhance={afterAction}>
			<button type="submit">Undo: I haven't applied</button>
		</form>
	{:else}
		<p>
			Open the application, paste in your answers and submit it there. Then come back and record it
			here. Job Ranger never submits anything for you.
		</p>
		<form method="POST" action="?/applied" use:enhance={afterAction}>
			<button type="submit">I applied</button>
		</form>
	{/if}
</section>

<style>
	.company,
	.hint,
	.meta,
	.optional {
		color: var(--muted);
	}

	.hint {
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

	h1 {
		overflow-wrap: anywhere;
	}

	section {
		margin-top: 2rem;
	}

	h2 {
		font-size: 1.4rem;
	}

	h3 {
		font-size: 1.1rem;
		margin: 0;
		overflow-wrap: anywhere;
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.5rem;
	}

	.links a {
		display: inline-block;
		min-height: 44px;
		padding: 0.5rem 0;
	}

	.apply {
		font-weight: 600;
	}

	blockquote {
		margin: 0.5rem 0;
		padding: 0.5rem 1rem;
		border-left: 4px double var(--accent);
		background: var(--surface);
		overflow-wrap: anywhere;
	}

	.questions {
		padding-left: 1.5rem;
	}

	.questions > li {
		margin-bottom: 1.5rem;
	}

	.meta {
		margin: 0.25rem 0;
	}

	.answer {
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 6px;
		padding: 0.5rem 1rem;
		margin: 0.5rem 0;
		overflow-wrap: anywhere;
	}

	.text {
		white-space: pre-wrap;
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

	.stack {
		display: grid;
		gap: 0.35rem;
		margin-bottom: 0.5rem;
	}

	.stack > button {
		justify-self: start;
		margin-top: 0.5rem;
	}

	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.5rem;
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

	details {
		margin: 1rem 0;
	}

	.letter {
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 6px;
		padding: 0.75rem 1.25rem;
		margin: 1rem 0;
		overflow-wrap: anywhere;
	}

	.problems {
		border-left: 6px double var(--accent);
		padding-left: 0.75rem;
	}

	.draft {
		border-style: dashed;
	}

	/* Suggestions say what they are in words; the left rule is extra, not the signal. */
	.review {
		border-left: 4px solid var(--accent);
		padding-left: 0.75rem;
	}

	.gaps {
		list-style: none;
		padding: 0;
	}

	fieldset {
		border: 1px solid var(--rule);
		border-radius: 6px;
		margin: 0 0 0.75rem;
		padding: 0.5rem 1rem 0.75rem;
	}

	legend {
		font-weight: 600;
		padding: 0 0.25rem;
	}

	summary {
		cursor: pointer;
		min-height: 44px;
		padding: 0.5rem 0;
	}
</style>
