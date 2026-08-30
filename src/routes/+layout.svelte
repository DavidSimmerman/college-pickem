<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	let { children, data } = $props();
	const nav = [['/', 'Picks'], ['/standings', 'Standings']];
</script>

<div class="min-h-screen bg-[#0a0a0c] text-neutral-200 antialiased">
	{#if data.player}
		<header class="border-b border-white/10">
			<div class="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3">
				<span class="text-sm font-semibold tracking-tight text-white">CFB Pick'em</span>
				<nav class="flex gap-1">
					{#each nav as [href, label]}
						<a {href} aria-current={page.url.pathname === href ? 'page' : undefined}
							class="rounded-lg px-2.5 py-1 text-xs transition-colors
								{page.url.pathname === href ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white'}">{label}</a>
					{/each}
				</nav>
				<form method="POST" action="/logout" class="ml-auto">
					<button class="text-xs text-neutral-500 hover:text-white">{data.player.name} · sign out</button>
				</form>
			</div>
		</header>
	{/if}
	{@render children()}
</div>
