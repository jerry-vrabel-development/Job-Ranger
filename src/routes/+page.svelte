<script lang="ts">
	import { pageTitle, SITE } from '$lib/site';
</script>

<svelte:head>
	<title>{pageTitle()}</title>
</svelte:head>

<h1>What {SITE.name} will do</h1>

<p class="status"><strong>Status:</strong> being built. Nothing to sign up for yet.</p>

<ul>
	<li>Find jobs from employers’ own job boards, each with its real apply link.</li>
	<li>Rank them against your own rules, and show the reasons for every score.</li>
	<li>Track every application, and notice when an employer has gone quiet.</li>
	<li>Flag likely scams, ghost jobs and missing pay, with the facts behind each flag.</li>
</ul>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external link -->
<p><a href={SITE.designNote}>Read the design note</a> to see how it will work.</p>
