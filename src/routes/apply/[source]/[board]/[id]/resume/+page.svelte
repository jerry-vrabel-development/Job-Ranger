<script lang="ts">
	import { browser } from '$app/env';
	import { resolve } from '$app/paths';
	import { countLabel } from '#lib/jobs/display.ts';
	import { pageTitle } from '#lib/site.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const resume = $derived(data.resume);
	const profile = $derived(data.profile);
	type Fact = (typeof data.resume.skills)[number];

	const contact = $derived(
		[
			profile.location,
			profile.email,
			profile.phone,
			...resume.links.map((link) => link.text)
		].filter((part) => part !== '')
	);

	function where(fact: Fact): string {
		return [fact.organization, fact.period].filter((part) => part !== '').join(' · ');
	}

	/** Honest labels: a side project or something I'm learning never reads as professional. */
	function skill(fact: Fact): string {
		if (fact.experience === 'side') return `${fact.text} (side projects)`;
		if (fact.experience === 'learning') return `${fact.text} (learning)`;
		return fact.text;
	}
</script>

<svelte:head>
	<title>{pageTitle(`Resume: ${data.job.title}`)}</title>
</svelte:head>

<div class="screen">
	<p>
		<a
			href={resolve('/apply/[source]/[board]/[id]', {
				source: data.job.source,
				board: data.job.board,
				id: data.job.id
			})}
		>
			Back to the apply kit
		</a>
	</p>
	<p>
		For <strong>{data.job.title}</strong> at {data.job.company}. Picked by plain rules from your {countLabel(
			data.factCount,
			'confirmed fact'
		)}: nothing is added or reworded{data.summary === null
			? '.'
			: `, except the summary: ${data.summary.edited ? 'your edit of a drafted one' : 'a drafted one you chose, every sentence backed by its facts'}. Change it on the kit.`}
		{#if resume.pickedFor.length > 0}
			Picked for: {resume.pickedFor.join(', ')}.
		{/if}
		{#if !data.hasKitText}
			Paste the posting’s text on the kit for a closer fit.
		{/if}
	</p>
	{#if profile.name === ''}
		<p>
			<strong>Your name isn’t set.</strong>
			<a href={resolve('/facts')}>Add your details on Facts</a> for the top of the resume.
		</p>
	{/if}
	{#if browser}
		<button
			type="button"
			onclick={() => {
				window.print();
			}}
		>
			Print or save as PDF
		</button>
	{:else}
		<p>Use your browser’s Print command to print it or save it as a PDF.</p>
	{/if}
</div>

<article class="resume" aria-label="Resume">
	<header>
		<h1>{profile.name === '' ? 'Your name' : profile.name}</h1>
		{#if profile.headline !== ''}<p class="headline">{profile.headline}</p>{/if}
		{#if contact.length > 0}<p class="contact">{contact.join(' · ')}</p>{/if}
	</header>

	{#if data.summary !== null}
		<section aria-labelledby="summary-heading">
			<h2 id="summary-heading">Summary</h2>
			<p>{data.summary.text}</p>
		</section>
	{:else if resume.summary.length > 0}
		<section aria-labelledby="summary-heading">
			<h2 id="summary-heading">Summary</h2>
			{#each resume.summary as fact (fact.id)}<p>{fact.text}</p>{/each}
		</section>
	{/if}

	{#if resume.roles.length > 0}
		<section aria-labelledby="experience-heading">
			<h2 id="experience-heading">Experience</h2>
			{#each resume.roles as section (section.role.id)}
				<div class="entry">
					<h3>{section.role.text}</h3>
					{#if where(section.role) !== ''}<p class="where">{where(section.role)}</p>{/if}
					{#if section.accomplishments.length > 0}
						<ul>
							{#each section.accomplishments as fact (fact.id)}<li>{fact.text}</li>{/each}
						</ul>
					{/if}
				</div>
			{/each}
		</section>
	{/if}

	{#if resume.projects.length > 0}
		<section aria-labelledby="projects-heading">
			<h2 id="projects-heading">Projects</h2>
			{#each resume.projects as section (section.project.id)}
				<div class="entry">
					{#if section.project.organization !== ''}<h3>{section.project.organization}</h3>{/if}
					<p>{section.project.text}</p>
					{#if section.accomplishments.length > 0}
						<ul>
							{#each section.accomplishments as fact (fact.id)}<li>{fact.text}</li>{/each}
						</ul>
					{/if}
				</div>
			{/each}
		</section>
	{/if}

	{#if resume.skills.length > 0}
		<section aria-labelledby="skills-heading">
			<h2 id="skills-heading">Skills</h2>
			<ul>
				{#each resume.skills as fact (fact.id)}<li>{skill(fact)}</li>{/each}
			</ul>
		</section>
	{/if}

	{#if resume.education.length > 0}
		<section aria-labelledby="education-heading">
			<h2 id="education-heading">Education and training</h2>
			<ul>
				{#each resume.education as fact (fact.id)}
					<li>{fact.text}{where(fact) === '' ? '' : `, ${where(fact)}`}</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.factCount === 0}
		<p>No confirmed facts yet. <a href={resolve('/facts')}>Confirm some on Facts</a>.</p>
	{/if}
</article>

<style>
	.screen {
		border-bottom: 1px solid var(--rule);
		margin-bottom: 1.5rem;
		padding-bottom: 1rem;
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

	.resume {
		max-width: 46rem;
		overflow-wrap: anywhere;
	}

	.resume h1 {
		margin: 0;
	}

	.headline {
		margin: 0.25rem 0 0;
		font-size: 1.15rem;
	}

	.contact,
	.where {
		color: var(--muted);
		margin: 0.25rem 0 0;
	}

	.resume h2 {
		font-size: 1.2rem;
		border-bottom: 1px solid var(--rule);
		padding-bottom: 0.2rem;
		margin: 1.5rem 0 0.5rem;
	}

	.resume h3 {
		font-size: 1.05rem;
		margin: 0;
	}

	.entry + .entry {
		margin-top: 1rem;
	}

	ul {
		margin: 0.35rem 0 0;
		padding-left: 1.25rem;
	}

	/* On paper: only the resume, in black on white, without the site around it. */
	@media print {
		:global(.skip-link),
		:global(header.site),
		:global(footer.site),
		.screen {
			display: none !important;
		}

		:global(body),
		.resume {
			color: #000;
			background: #fff;
		}

		.contact,
		.where {
			color: #333;
		}

		.resume h2 {
			border-color: #000;
		}

		.entry {
			break-inside: avoid;
		}
	}
</style>
