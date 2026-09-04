<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	let { children, data } = $props();
	// Full labels everywhere: the phone gets them in a menu rather than a squeeze.
	const nav = [
		['/', 'PICKS'],
		['/me', 'MY PICKS'],
		['/standings', 'STANDINGS']
	];

	let menu = $state(false);

	// Navigating is the end of the menu's job. SvelteKit routes on the client, so the
	// panel would otherwise still be sitting open over the page you asked for.
	$effect(() => {
		page.url.pathname;
		menu = false;
	});

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

<svelte:window onkeydown={(e) => e.key === 'Escape' && (menu = false)} />

<div class="min-h-screen antialiased">
	{#if data.player}
		<header class="relative border-b" style="border-color:var(--edge)">
			<div class="mx-auto flex max-w-2xl items-center gap-3 px-3 py-2.5">
				<span class="display shrink-0 whitespace-nowrap text-[15px] leading-none text-white"
					>PICK<span style="color:var(--hot)">'</span>EM</span>

				<!-- Wide enough for the words: the inline nav. -->
				<nav class="hidden gap-1 sm:flex">
					{#each nav as [href, label]}
						{@const on = page.url.pathname === href}
						<a {href} aria-current={on ? 'page' : undefined}
							class="cond border px-2.5 py-1 text-[13px] font-bold whitespace-nowrap tracking-[0.12em] transition-colors"
							style="border-color:{on ? '#fff' : 'transparent'};color:{on ? '#fff' : '#7e879c'}">{label}</a>
					{/each}
				</nav>
				<form method="POST" action="/logout" class="ml-auto hidden shrink-0 sm:block">
					<button class="cond whitespace-nowrap text-[13px] tracking-wider" style="color:#5b6478"
						>{data.player.name} ·&nbsp;OUT</button>
				</form>

				<!-- Narrow: one button, and the labels get to stay full inside it. -->
				<button type="button" onclick={() => (menu = !menu)}
					aria-expanded={menu} aria-controls="mobile-nav"
					aria-label={menu ? 'Close menu' : 'Open menu'}
					class="ml-auto -mr-1 flex h-9 w-9 shrink-0 items-center justify-center sm:hidden">
					<svg width="19" height="14" viewBox="0 0 19 14" aria-hidden="true"
						stroke={menu ? '#fff' : '#9aa2b8'} stroke-width="2" stroke-linecap="round">
						{#if menu}
							<path d="M3 2 L16 12" /><path d="M16 2 L3 12" />
						{:else}
							<path d="M1 2 H18" /><path d="M1 7 H18" /><path d="M1 12 H18" />
						{/if}
					</svg>
				</button>
			</div>

			{#if menu}
				<!-- Dimming the board behind does two jobs: the panel stops blending into a
				     page that is nearly the same colour, and tapping away closes it. -->
				<button type="button" aria-label="Close menu" tabindex="-1"
					onclick={() => (menu = false)}
					class="fixed inset-0 z-40 cursor-default sm:hidden"
					style="background:rgba(6,8,12,.6)"></button>
				<!-- Anchored to the header rather than pushing the page down, so opening the
				     menu never shifts the board underneath it. -->
				<nav id="mobile-nav"
					class="absolute inset-x-0 top-full z-50 border-b shadow-2xl sm:hidden"
					style="border-color:var(--edge);background:#171c2a">
					{#each nav as [href, label]}
						{@const on = page.url.pathname === href}
						<a {href} aria-current={on ? 'page' : undefined}
							class="cond block border-b px-4 py-3 text-[15px] font-bold tracking-[0.14em] transition-colors"
							style="border-color:var(--line);color:{on ? '#fff' : '#7e879c'};
								box-shadow:{on ? 'inset 3px 0 0 var(--hot)' : 'none'}">{label}</a>
					{/each}
					<form method="POST" action="/logout" class="flex items-center justify-between px-4 py-3">
						<span class="cond text-[14px] tracking-wider" style="color:#5b6478">{data.player.name}</span>
						<button class="cond text-[14px] font-bold tracking-[0.14em]" style="color:var(--bad)">SIGN OUT</button>
					</form>
				</nav>
			{/if}
		</header>
	{/if}
	{@render children()}
</div>
