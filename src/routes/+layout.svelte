<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	let { children, data } = $props();
	// Two labels each: the phone gets the short one, because three full words plus a
	// name will not fit on a 320px screen without wrapping into a three-line header.
	const nav = [
		['/', 'PICKS', 'PICKS'],
		['/me', 'MY PICKS', 'MINE'],
		['/standings', 'STANDINGS', 'RANKS']
	];

	// Link previews want absolute URLs. page.url.origin is ORIGIN in production, which
	// is already required for form posts to work — so there is nothing new to configure.
	const blurb = 'Weekly college-football pick\'em. Ten curated Games of the Week, plus spreads and moneyline.';
	const og = $derived(`${page.url.origin}/og.png?v=1`);
</script>

<svelte:head>
	<meta name="description" content={blurb} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="CFB Pick'em" />
	<meta property="og:title" content="CFB Pick'em" />
	<meta property="og:description" content={blurb} />
	<meta property="og:url" content={page.url.origin + page.url.pathname} />
	<meta property="og:image" content={og} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="CFB Pick'em — ten games a week." />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:image" content={og} />
</svelte:head>

<div class="min-h-screen antialiased">
	{#if data.player}
		<header class="border-b" style="border-color:var(--edge)">
			<div class="mx-auto flex max-w-2xl items-center gap-2 px-3 py-2.5 sm:gap-3">
				<span class="display shrink-0 whitespace-nowrap text-[14px] leading-none text-white sm:text-[15px]"
					>PICK<span style="color:var(--hot)">'</span>EM</span>
				<nav class="flex gap-1">
					{#each nav as [href, long, short]}
						{@const on = page.url.pathname === href}
						<a {href} aria-current={on ? 'page' : undefined}
							class="cond border px-2 py-1 text-[12px] font-bold whitespace-nowrap tracking-[0.08em] transition-colors sm:px-2.5 sm:text-[13px] sm:tracking-[0.12em]"
							style="border-color:{on ? '#fff' : 'transparent'};color:{on ? '#fff' : '#7e879c'}"
							><span class="sm:hidden">{short}</span><span class="hidden sm:inline">{long}</span></a>
					{/each}
				</nav>
				<form method="POST" action="/logout" class="ml-auto shrink-0">
					<button class="cond whitespace-nowrap text-[12px] tracking-wider sm:text-[13px]" style="color:#5b6478"
						><span class="hidden sm:inline">{data.player.name} ·&nbsp;</span>OUT</button>
				</form>
			</div>
		</header>
	{/if}
	{@render children()}
</div>
