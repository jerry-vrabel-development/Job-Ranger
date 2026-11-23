<script lang="ts">
	import { tick } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { resolve } from '$app/paths';
	import { countLabel } from '#lib/jobs/display.ts';
	import { pageTitle } from '#lib/site.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let status: HTMLParagraphElement | undefined = $state();

	const afterAction: SubmitFunction =
		() =>
		async ({ update }) => {
			await update();
			await tick();
			status?.focus();
		};
</script>

<svelte:head>
	<title>{pageTitle('Tracker')}</title>
</svelte:head>

<h1>Tracker</h1>

<p>
	Every job you’ve recorded applying to, and where it stands. A reminder to follow up comes {data
		.rules.followUp[0]} and {data.rules.followUp[1]} days after you apply; after {data.rules
		.noReply}
	days with no change, an application moves to “No reply”, so you can stop waiting. Nothing is ever sent
	for you.
</p>

{#if form?.result}
	<p class="note" role="status" tabindex="-1" bind:this={status}>
		{form.result.ok ? '' : 'Not done: '}{form.result.message}
	</p>
{/if}

{#if data.total === 0}
	<p class="note">
		Nothing tracked yet. When you record that you applied, on a job’s apply kit, it shows up here.
		<a href={resolve('/jobs')}>Go to Jobs</a>.
	</p>
{:else}
	<p>{countLabel(data.total, 'application')}.</p>
	{#each data.groups as group (group.group)}
		<section aria-labelledby="group-{group.group}">
			<h2 id="group-{group.group}">{group.heading} ({group.items.length})</h2>
			<ul class="items">
				{#each group.items as item (item.key)}
					<li>
						<article aria-labelledby="app-{item.key}">
							<h3 id="app-{item.key}">
								<a
									href={resolve('/apply/[source]/[board]/[id]', {
										source: item.source,
										board: item.board,
										id: item.id
									})}>{item.title}</a
								>
							</h3>
							<p class="company">{item.company} · applied {item.applied}</p>
							<p><strong>{item.status}:</strong> {item.words}</p>
							{#if item.note}
								<p><strong>Your note:</strong> {item.note}</p>
							{/if}
							{#if item.group === 'follow-up'}
								<form method="POST" action="?/followedUp" use:enhance={afterAction}>
									<input type="hidden" name="source" value={item.source} />
									<input type="hidden" name="board" value={item.board} />
									<input type="hidden" name="id" value={item.id} />
									<button type="submit"
										>I followed up today<span class="visually-hidden"
											>{` on ${item.title} at ${item.company}`}</span
										></button
									>
								</form>
							{/if}
						</article>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
{/if}

<style>
	.items {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 1rem;
	}

	article {
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		padding: 0.75rem 1rem;
	}

	h3 {
		margin: 0;
		font-size: 1.1rem;
	}

	.company {
		margin: 0.25rem 0 0;
	}
</style>
