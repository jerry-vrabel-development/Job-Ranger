<script lang="ts">
	import type { PayLawWords } from '#lib/jobs/display.ts';

	/** The missing-pay signal (design note 0005), in words, with each state's own page. */
	let { laws }: { laws: readonly PayLawWords[] } = $props();

	/** Said to screen readers only; a variable, because Svelte trims a leading space in markup. */
	const SITE = ' on the state’s own site';
</script>

<p class="signal">
	<strong>Pay missing:</strong> No pay is posted.
	{#each laws as law (law.name)}
		{law.name} requires a pay range in job postings from {law.who}:
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the state's own page -->
		<a href={law.url}>{law.name}’s rule<span class="visually-hidden">{SITE}</span></a>.
	{/each}
	Whether it covers this job depends on the employer’s size and where the work is done. Information, not
	legal advice.
</p>

<style>
	/* The signal says what it is in words; the rule beside it is extra, not the signal. */
	.signal {
		margin: 0.5rem 0 0;
		border-left: 4px solid var(--accent);
		padding-left: 0.75rem;
	}
</style>
