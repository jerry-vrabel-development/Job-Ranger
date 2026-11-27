<script lang="ts">
	import { SITE, pageTitle } from '#lib/site.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{pageTitle('How well scoring works')}</title>
</svelte:head>

<h1>How well scoring works</h1>

<p>
	Job Ranger asks a model to score each job from 1 to 5, with reasons it has to back up. This page
	shows how well that works: measured, not claimed. Each run scores 13 made-up postings with known
	answers, and the jobs you saved, passed on or applied to. It sets the model beside plain keyword
	matching, which costs nothing. The model has to beat it to earn its cost.
</p>

<p class="status">{data.status}</p>

<section aria-labelledby="fixed">
	<h2 id="fixed">Made-up postings</h2>
	<p>
		Thirteen postings written to have clear answers: 3 good fits, 3 clear misses, and 7 traps that
		look like one and are the other. A trap is where reading beats matching words: the right title
		with the wrong skills, a dream employer with a job far off, your skills listed only as “nice to
		have”.
	</p>
	<p class="label" class:wide={data.fixedColumns.length > 1} id="fixed-label">
		Cases passed, by kind
	</p>
	<!-- A wide table scrolls on a phone; keyboard users must be able to focus it to scroll (WCAG 2.1.1). -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div class="scroll" role="region" aria-labelledby="fixed-label" tabindex="0">
		<table>
			<caption class="visually-hidden">Cases passed, by kind</caption>
			<thead>
				<tr>
					<td></td>
					{#each data.fixedColumns as column, i (i)}
						<th scope="col">{column.title}<span class="detail">{column.detail}</span></th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each data.fixedRows as row (row.label)}
					<tr>
						<th scope="row">{row.label}</th>
						{#each row.cells as value, i (i)}
							<td>{value}</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<details>
		<summary>Every case</summary>
		<p class="label wide" id="cases-label">
			Each case: the scores a careful reader would accept, and what each scorer gave
		</p>
		<!-- A wide table scrolls on a phone; keyboard users must be able to focus it to scroll (WCAG 2.1.1). -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div class="scroll" role="region" aria-labelledby="cases-label" tabindex="0">
			<table>
				<caption class="visually-hidden">
					Each case: the scores a careful reader would accept, and what each scorer gave
				</caption>
				<thead>
					<tr>
						<th scope="col">Case</th>
						<th scope="col">Accepts</th>
						{#each data.fixedColumns as column, i (i)}
							<th scope="col">{column.title}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each data.caseRows as row (row.id)}
						<tr>
							<th scope="row">{row.name}<span class="detail">{row.id}</span></th>
							<td>{row.expected}</td>
							{#each row.cells as value, i (i)}
								<td>{value}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</details>
</section>

{#if data.runColumns.length > 0}
	<section aria-labelledby="labels">
		<h2 id="labels">Your saved and passed jobs</h2>
		<p>
			Jobs you saved or applied to count as wanted; jobs you passed on count as not wanted. A good
			scorer puts the wanted ones near the top. Each run scores them with the model and with keyword
			matching, on the same jobs.
		</p>
		{#if data.labelRows === null}
			<p>None of these runs had labelled jobs.</p>
		{:else}
			<p class="label" class:wide={data.runColumns.length > 1} id="labels-label">
				Ranking your labelled jobs
			</p>
			<!-- A wide table scrolls on a phone; keyboard users must be able to focus it to scroll (WCAG 2.1.1). -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div class="scroll" role="region" aria-labelledby="labels-label" tabindex="0">
				<table>
					<caption class="visually-hidden">Ranking your labelled jobs</caption>
					<thead>
						<tr>
							<td></td>
							{#each data.runColumns as column, i (i)}
								<th scope="col">{column.title}<span class="detail">{data.labelNotes[i]}</span></th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each data.labelRows as row (row.label)}
							<tr>
								<th scope="row">{row.label}</th>
								{#each row.cells as pair, i (i)}
									<td>
										<span class="pair">Model: {pair.model}</span>
										<span class="pair">Keywords: {pair.keywords}</span>
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<section aria-labelledby="answers">
		<h2 id="answers">The model’s answers</h2>
		<p>
			Every reason must point at one of your facts, interests or preferences, or quote the posting.
			Code checks each one and drops what it can’t trace. These numbers should be near zero, apart
			from cost and time.
		</p>
		<p class="label" class:wide={data.runColumns.length > 1} id="answers-label">
			How the model’s answers held up
		</p>
		<!-- A wide table scrolls on a phone; keyboard users must be able to focus it to scroll (WCAG 2.1.1). -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div class="scroll" role="region" aria-labelledby="answers-label" tabindex="0">
			<table>
				<caption class="visually-hidden">How the model’s answers held up</caption>
				<thead>
					<tr>
						<td></td>
						{#each data.runColumns as column, i (i)}
							<th scope="col">{column.title}<span class="detail">{column.detail}</span></th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each data.answerRows as row (row.label)}
						<tr>
							<th scope="row">{row.label}</th>
							{#each row.cells as value, i (i)}
								<td>{value}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
{/if}

<section aria-labelledby="how">
	<h2 id="how">How to read this</h2>
	<ul>
		<li>
			Every number says how many items it rests on. With few labelled jobs, the numbers are noisy.
		</li>
		<li>
			Scores of 1 to 5 tie a lot, so ranking is measured as the average over every order of tied
			jobs, never a lucky tie-break.
		</li>
		<li>
			A run only appears here once it finished and was committed. The method is in
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external link -->
			<a href="{SITE.repository}/blob/main/docs/design/0008-scoring-and-evals.md">
				design note 0008
			</a>.
		</li>
	</ul>
</section>

<style>
	.status {
		font-weight: 600;
	}

	section {
		margin-top: 2rem;
	}

	.scroll {
		overflow-x: auto;
		margin: 0.5rem 0 1rem;
	}

	table {
		border-collapse: collapse;
		width: 100%;
		font-variant-numeric: tabular-nums;
	}

	/* Above the scroll area, not a caption: a caption is as wide as its table and would scroll off a phone. */
	.label {
		font-weight: 600;
		margin-bottom: 0;
	}

	/* Only on a table with enough columns to be wider than a phone screen. */
	@media (max-width: 40rem) {
		.label.wide::after {
			content: ' Scroll sideways to see every column.';
			font-weight: 400;
			color: var(--muted);
		}
	}

	th,
	td {
		text-align: left;
		vertical-align: top;
		padding: 0.375rem 0.5rem;
		border-bottom: 1px solid var(--rule);
	}

	thead th {
		min-width: 8rem;
	}

	.detail,
	.pair {
		display: block;
	}

	.detail {
		font-weight: 400;
		font-size: 0.875rem;
		color: var(--muted);
	}

	details {
		margin: 1rem 0;
	}

	summary {
		cursor: pointer;
	}
</style>
