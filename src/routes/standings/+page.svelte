<script lang="ts">
	import { fmtOdds } from '$lib/scoring';
	let { data } = $props();
	const sgn = (n: number) => (n > 0 ? '+' : '') + n.toFixed(2);
	const peak = $derived(
		Math.max(1, ...data.players.flatMap((p) => p.byWeek.map(([, v]) => Math.abs(v))))
	);
</script>

<svelte:head><title>Standings — CFB Pick'em</title></svelte:head>

<div class="mx-auto max-w-3xl space-y-6 px-4 py-6">
	<section>
		<h2 class="mb-3 font-mono text-[10px] uppercase tracking-widest text-neutral-500">Leaderboard</h2>
		<div class="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
			<table class="w-full text-sm">
				<caption class="sr-only">Season standings, ranked by moneyline points</caption>
				<thead>
					<tr class="border-b border-white/10 font-mono text-[10px] uppercase tracking-wider text-neutral-600">
						<th scope="col" class="px-3 py-2 text-left font-normal">#</th>
						<th scope="col" class="py-2 text-left font-normal">Player</th>
						<th scope="col" class="py-2 text-right font-normal">ATS</th>
						<th scope="col" class="py-2 text-right font-normal">Win%</th>
						<th scope="col" class="py-2 text-right font-normal">ML</th>
						<th scope="col" class="px-3 py-2 text-right font-normal">Points</th>
					</tr>
				</thead>
				<tbody>
					{#each data.players as p, i}
						<tr class="border-b border-white/5 last:border-0 {p.id === data.me ? 'bg-white/[0.04]' : ''}">
							<td class="px-3 py-2.5 font-mono text-xs text-neutral-600">{i + 1}</td>
							<td class="py-2.5 {i === 0 ? 'font-medium text-white' : 'text-neutral-300'}">{p.name}</td>
							<td class="py-2.5 text-right font-mono text-xs text-neutral-400">{p.w}-{p.l}{p.t ? `-${p.t}` : ''}</td>
							<td class="py-2.5 text-right font-mono text-xs text-neutral-500">{p.w + p.l ? (p.pct * 100).toFixed(0) + '%' : '—'}</td>
							<td class="py-2.5 text-right font-mono text-xs text-neutral-500">{p.mlW}-{p.mlL}</td>
							<td class="px-3 py-2.5 text-right font-mono text-sm tabular-nums {p.ml > 0 ? 'text-emerald-400' : p.ml < 0 ? 'text-red-400' : 'text-neutral-500'}">{sgn(p.ml)}</td>
						</tr>
					{:else}
						<tr><td colspan="6" class="px-3 py-8 text-center text-xs text-neutral-500">Nothing graded yet — standings fill in as games go final.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	{#if data.players.some((p) => p.byWeek.length)}
		<section>
			<h2 class="mb-3 font-mono text-[10px] uppercase tracking-widest text-neutral-500">Moneyline points by week</h2>
			<div class="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
				{#each data.players.filter((p) => p.byWeek.length) as p}
					<div class="flex items-center gap-3">
						<span class="w-20 shrink-0 truncate text-xs {p.id === data.me ? 'text-white' : 'text-neutral-400'}">{p.name}</span>
						<div class="flex h-8 flex-1 items-center gap-0.5">
							{#each p.byWeek as [wk, v]}
								<div class="group relative flex h-full flex-1 flex-col justify-center" title="Week {wk}: {sgn(v)}">
									<div class="w-full rounded-sm {v >= 0 ? 'bg-emerald-500/70' : 'bg-red-500/70'}"
										style="height: {Math.max(8, (Math.abs(v) / peak) * 100)}%"></div>
								</div>
							{/each}
						</div>
						<span class="w-14 shrink-0 text-right font-mono text-xs tabular-nums {p.ml > 0 ? 'text-emerald-400' : 'text-red-400'}">{sgn(p.ml)}</span>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<section>
		<h2 class="mb-3 font-mono text-[10px] uppercase tracking-widest text-neutral-500">Your moneyline ledger</h2>
		<div class="rounded-xl border border-white/10 bg-white/[0.02] p-2">
			{#each data.ledger as l}
				<div class="flex items-center gap-2 border-b border-white/5 px-1 py-2 last:border-0">
					<span class="size-1.5 shrink-0 rounded-full {l.outcome === 'win' ? 'bg-emerald-500' : l.outcome === 'loss' ? 'bg-red-500' : 'bg-neutral-600'}"></span>
					{#if l.logo}<img src={l.logo} alt="" class="size-5 shrink-0" loading="lazy" />{/if}
					<span class="min-w-0 flex-1 truncate text-[13px] text-neutral-300">{l.team} <span class="text-neutral-600">vs {l.opp}</span></span>
					<span class="shrink-0 font-mono text-[10px] text-neutral-600">wk{l.week} · {l.score}</span>
					<span class="w-12 shrink-0 text-right font-mono text-[11px] text-neutral-500">{fmtOdds(l.odds)}</span>
					<span class="w-14 shrink-0 text-right font-mono text-xs tabular-nums {l.pts > 0 ? 'text-emerald-400' : l.pts < 0 ? 'text-red-400' : 'text-neutral-500'}">{sgn(l.pts)}</span>
				</div>
			{:else}
				<p class="px-3 py-8 text-center text-xs text-neutral-500">No graded moneyline picks yet.</p>
			{/each}
		</div>
	</section>
</div>
