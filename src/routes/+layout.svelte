<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	let { children, data } = $props();
	const nav = [['/', 'PICKS'], ['/standings', 'STANDINGS']];
</script>

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
