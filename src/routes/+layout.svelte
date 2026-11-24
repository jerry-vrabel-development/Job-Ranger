<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { SITE } from '#lib/site.ts';

	let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
	<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
	<meta name="description" content={SITE.description} />
</svelte:head>

<a class="skip-link" href="#main">Skip to content</a>

<header class="site">
	<div class="wrap">
		<a class="brand" href={resolve('/')}>
			<img src="/favicon.svg" alt="" width="32" height="32" />
			<span>{SITE.name}</span>
		</a>
		<nav aria-label="Main">
			<a href={resolve('/jobs')} aria-current={page.url.pathname === '/jobs' ? 'page' : undefined}>
				Jobs
			</a>
			<a
				href={resolve('/tracker')}
				aria-current={page.url.pathname === '/tracker' ? 'page' : undefined}
			>
				Tracker
			</a>
			<a
				href={resolve('/companies')}
				aria-current={page.url.pathname === '/companies' ? 'page' : undefined}
			>
				Companies
			</a>
			<a
				href={resolve('/interests')}
				aria-current={page.url.pathname === '/interests' ? 'page' : undefined}
			>
				Interests
			</a>
			<a
				href={resolve('/facts')}
				aria-current={page.url.pathname === '/facts' ? 'page' : undefined}
			>
				Facts
			</a>
			<a
				href={resolve('/answers')}
				aria-current={page.url.pathname === '/answers' ? 'page' : undefined}
			>
				Answers
			</a>
		</nav>
	</div>
</header>

<main id="main" tabindex="-1">
	<div class="wrap">
		{@render children()}
	</div>
</main>

<footer class="site">
	<div class="wrap">
		<p>
			{SITE.name} is open source under the MIT License.
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external link -->
			<a href={SITE.repository}>The code is on GitHub</a>.
		</p>
	</div>
</footer>
