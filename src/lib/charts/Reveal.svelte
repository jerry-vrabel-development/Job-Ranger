<!--
	Motion for the charts inside it (design note 0007, addendum): when the
	wrapper scrolls into view, its bars grow from the baseline and its lines
	draw in, once, with a short stagger. GSAP with ScrollTrigger does it, loaded
	only in the browser as its own chunk.

	The rules: the server-rendered chart is complete without this. A chart
	already on screen when the page loads isn't hidden and replayed (no flash).
	Under reduced motion nothing moves (gsap.matchMedia). GSAP sets styles from
	JavaScript, which the CSP allows; it writes no style attributes into the HTML.
	Marks opt in with data-reveal="bar", "line", or "fade" (the map's states,
	which fade in west to east: each carries its delay in data-delay).
-->
<script lang="ts">
	import { onMount, type Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	let node: HTMLDivElement | undefined = $state();

	onMount(() => {
		let revert: (() => void) | undefined;
		void (async () => {
			const [{ gsap }, { ScrollTrigger }] = await Promise.all([
				import('gsap'),
				import('gsap/ScrollTrigger')
			]);
			// Registered before any use: ScrollTrigger reads the window on registration.
			gsap.registerPlugin(ScrollTrigger);
			// Gone already, or on screen from the start: leave it as it is.
			if (!node?.isConnected || ScrollTrigger.isInViewport(node)) return;
			const root = node;
			const media = gsap.matchMedia();
			media.add('(prefers-reduced-motion: no-preference)', () => {
				const timeline = gsap.timeline({
					scrollTrigger: { trigger: root, start: 'top 85%', once: true }
				});
				const bars = root.querySelectorAll('[data-reveal="bar"]');
				const lines = root.querySelectorAll('[data-reveal="line"]');
				if (bars.length > 0) {
					timeline.from(bars, {
						scaleX: 0,
						transformOrigin: '0% 50%',
						duration: 0.6,
						ease: 'power2.out',
						stagger: 0.06
					});
				}
				const fades = [...root.querySelectorAll<SVGElement | HTMLElement>('[data-reveal="fade"]')];
				if (fades.length > 0) {
					timeline.from(
						fades,
						{
							opacity: 0,
							duration: 0.4,
							ease: 'power1.out',
							stagger: (i) => Number(fades[i]?.dataset['delay'] ?? 0)
						},
						0
					);
				}
				if (lines.length > 0) {
					timeline.from(
						lines,
						{ strokeDashoffset: 1, duration: 0.9, ease: 'power1.out', stagger: 0.12 },
						0
					);
				}
			});
			revert = () => {
				media.revert();
			};
		})();
		return () => {
			revert?.();
		};
	});
</script>

<div class="reveal" bind:this={node}>
	{@render children()}
</div>
