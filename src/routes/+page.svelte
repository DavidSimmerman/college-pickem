<script lang="ts">
	import { lineFor, mlWin, mlLose, fmtOdds, mlPoints, gradeSpread, gradeMl, type Side } from '$lib/scoring';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	let mode = $state<'spread' | 'ml'>('spread');
	let games = $state(data.games);
	let err = $state('');
	$effect(() => { games = data.games; });

	const et = (iso: string) =>
		new Date(iso).toLocaleString('en-US', {
			weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York'
		}).replace(':00 ', ' ');

	async function pick(g: any, side: Side) {
		if (g.locked) return;
		const key = mode === 'spread' ? 'spread_pick' : 'ml_pick';
		const next = g[key] === side ? null : side;
		const prev = games;
		// immutable swap: keyed {#each} re-renders reliably without relying on proxy depth
		const patch = { [key]: next, ...(mode === 'ml' ? { ml_odds_at: next ? (side === 'home' ? g.ml_home : g.ml_away) : null } : {}) };
		games = games.map((x: any) => (x.id === g.id ? { ...x, ...patch } : x)); // optimistic
		err = '';

		const res = await fetch('/api/pick', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ gameId: g.id, kind: mode, side: next })
		});
		if (!res.ok) {
			games = prev; // roll back
			err = (await res.text().catch(() => '')) || 'Could not save that pick.';
			if (res.status === 409) invalidateAll();
		}
	}

	const spreadPicks = $derived(games.filter((g: any) => g.spread_pick));
	const mlPicks = $derived(games.filter((g: any) => g.ml_pick));
	const atRisk = $derived(
		mlPicks.reduce((t: number, g: any) => t + mlWin(g.ml_odds_at ?? 0), 0)
	);
	const downside = $derived(mlPicks.length * mlLose());

	const outcome = (g: any, kind: 'spread' | 'ml') =>
		kind === 'spread'
			? gradeSpread(g.spread_pick, g.spread_at ?? g.spread, g.home_score, g.away_score)
			: gradeMl(g.ml_pick, g.home_score, g.away_score);
</script>

<svelte:head><title>Week {data.week} — CFB Pick'em</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 pb-24 pt-4">
	<!-- week switcher -->
	<div class="flex gap-1 overflow-x-auto pb-2 -mx-1 px-1" role="tablist" aria-label="Week">
		{#each data.weeks as w}
			<a
				href="?season={data.season}&week={w}"
				role="tab"
				aria-selected={w === data.week}
				class="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors
					{w === data.week ? 'bg-white text-black' : 'bg-white/5 text-neutral-400 hover:bg-white/10'}"
			>Wk {w}{#if w === data.current}<span class="ml-1 text-[9px] opacity-60">now</span>{/if}</a>
		{/each}
	</div>

	<!-- mode toggle -->
	<div class="sticky top-0 z-10 -mx-4 mb-3 bg-[#0a0a0c]/95 px-4 pb-2 pt-2 backdrop-blur">
		<div class="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
			{#each [['spread', 'Spreads', spreadPicks.length], ['ml', 'Moneyline', mlPicks.length]] as const as [m, label, n]}
				<button
					onclick={() => (mode = m)}
					aria-pressed={mode === m}
					class="flex-1 rounded-lg py-2 text-sm font-medium transition-colors
						{mode === m ? (m === 'spread' ? 'bg-emerald-500 text-black' : 'bg-amber-500 text-black') : 'text-neutral-400 hover:text-white'}"
				>
					{label}
					{#if n}<span class="ml-1 rounded px-1.5 py-0.5 text-[10px] {mode === m ? 'bg-black/20' : 'bg-white/10'}">{n}</span>{/if}
				</button>
			{/each}
		</div>
		{#if mode === 'ml' && mlPicks.length}
			<div class="mt-2 flex justify-between px-1 font-mono text-[11px]">
				<span class="text-neutral-500">if all hit <b class="text-emerald-400">+{atRisk.toFixed(2)}</b></span>
				<span class="text-neutral-500">if all miss <b class="text-red-400">{downside.toFixed(2)}</b></span>
			</div>
		{/if}
		{#if err}
			<p role="alert" class="mt-2 rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-300">{err}</p>
		{/if}
	</div>

	<div class="space-y-1.5">
		{#each games as g (g.id)}
			{@const picked = mode === 'spread' ? g.spread_pick : g.ml_pick}
			{@const done = g.state === 'post'}
			<div class="rounded-xl border border-white/10 bg-white/[0.02] p-2 {g.locked ? 'opacity-70' : ''}">
				<div class="mb-1.5 flex justify-between px-1 font-mono text-[10px] text-neutral-600">
					<span>
						{#if g.state === 'in'}<span class="font-bold text-red-400">● {g.detail}</span>
						{:else if done}{g.detail}
						{:else}{et(g.start)}{#if g.tv} · {g.tv}{/if}{/if}
					</span>
					<span>
						{#if g.spread !== null}{g.home_abbr} {g.spread > 0 ? '+' : ''}{g.spread}{/if}
						{#if g.over_under} · O/U {g.over_under}{/if}
						{#if g.locked && !done} · locked{/if}
					</span>
				</div>

				<div class="grid grid-cols-2 gap-1.5">
					{#each ['away', 'home'] as const as side}
						{@const t = { abbr: g[`${side}_abbr`], name: g[`${side}_name`], logo: g[`${side}_logo`], rank: g[`${side}_rank`], score: g[`${side}_score`] }}
						{@const live = side === 'home' ? g.ml_home : g.ml_away}
						<!-- once picked, show the price that was locked in, not the drifted line -->
						{@const odds = picked === side && g.ml_odds_at != null ? g.ml_odds_at : live}
						{@const on = picked === side}
						{@const res = on && done ? outcome(g, mode) : null}
						<button
							onclick={() => pick(g, side)}
							disabled={g.locked || (mode === 'ml' ? live === null : g.spread === null)}
							aria-pressed={on}
							aria-label="{mode === 'spread' ? 'Spread' : 'Moneyline'} pick {t.name}"
							class="relative rounded-lg border p-2 text-left transition-all disabled:cursor-not-allowed
								{on
									? res === 'win' ? 'border-emerald-500 bg-emerald-500/20 ring-1 ring-emerald-500/40'
									: res === 'loss' ? 'border-red-500/70 bg-red-500/15'
									: res === 'push' ? 'border-neutral-500 bg-white/10'
									: mode === 'spread' ? 'border-emerald-500 bg-emerald-500/15 ring-1 ring-emerald-500/40'
									: 'border-amber-500 bg-amber-500/15 ring-1 ring-amber-500/40'
									: 'border-white/10 bg-white/[0.03] enabled:hover:border-white/25'}"
						>
							<div class="flex items-center gap-2">
								{#if t.logo}<img src={t.logo} alt="" class="size-6 shrink-0" loading="lazy" />{/if}
								<div class="min-w-0 flex-1">
									<div class="truncate text-[13px] {on ? 'font-semibold text-white' : 'text-neutral-300'}">
										{#if t.rank < 26}<span class="mr-0.5 font-bold text-amber-500">{t.rank}</span>{/if}{t.name}
									</div>
									<div class="text-[10px] text-neutral-600">
										{side}{#if done || g.state === 'in'} · <b class="text-neutral-400">{t.score ?? 0}</b>{/if}
									</div>
								</div>
								{#if mode === 'spread'}
									<span class="font-mono text-sm {on ? 'font-bold text-emerald-400' : 'text-neutral-500'}">
										{lineFor(on && g.spread_at !== null ? g.spread_at : g.spread, side)}
									</span>
								{:else if odds !== null}
									<div class="text-right leading-none">
										<div class="font-mono text-[13px] {on ? 'font-bold text-amber-400' : 'text-neutral-500'}">{fmtOdds(odds)}</div>
										<div class="mt-0.5 font-mono text-[10px]">
											<span class="text-emerald-500">+{mlWin(odds).toFixed(2)}</span><span class="text-neutral-700"> / </span><span class="text-red-500">-1.00</span>
										</div>
									</div>
								{:else}
									<span class="font-mono text-[10px] text-neutral-700">no line</span>
								{/if}
							</div>
							{#if res && res !== 'pending'}
								<span class="absolute -right-1 -top-1 rounded px-1 py-0.5 text-[9px] font-bold uppercase
									{res === 'win' ? 'bg-emerald-500 text-black' : res === 'loss' ? 'bg-red-500 text-white' : 'bg-neutral-500 text-black'}">
									{res === 'win' ? 'W' : res === 'loss' ? 'L' : 'push'}
									{#if mode === 'ml' && g.ml_odds_at}<span class="ml-0.5">{mlPoints(res, g.ml_odds_at) > 0 ? '+' : ''}{mlPoints(res, g.ml_odds_at).toFixed(2)}</span>{/if}
								</span>
							{/if}
						</button>
					{/each}
				</div>
			</div>
		{:else}
			<p class="py-12 text-center text-sm text-neutral-500">No games loaded for this week yet.</p>
		{/each}
	</div>
</div>
