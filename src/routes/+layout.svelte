<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	let { children, data } = $props();
	const nav = [['/', 'PICKS'], ['/me', 'MY PICKS'], ['/standings', 'STANDINGS']];

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
			<div class="mx-auto flex max-w-2xl items-center gap-3 px-3 py-2.5">
				<span class="display text-[15px] leading-none text-white">PICK<span style="color:var(--hot)">'</span>EM</span>
				<nav class="flex gap-1">
					{#each nav as [href, label]}
						{@const on = page.url.pathname === href}
						<a {href} aria-current={on ? 'page' : undefined}
							class="cond border px-2.5 py-1 text-[13px] font-bold tracking-[0.12em] transition-colors"
							style="border-color:{on ? '#fff' : 'transparent'};color:{on ? '#fff' : '#7e879c'}">{label}</a>
					{/each}
				</nav>
				<form method="POST" action="/logout" class="ml-auto">
					<button class="cond text-[13px] tracking-wider" style="color:#5b6478">{data.player.name} · OUT</button>
				</form>
			</div>
		</header>
	{/if}
	{@render children()}
</div>
