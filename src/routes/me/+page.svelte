<script lang="ts">
	import { fmtOdds, fmtPts, lineFor } from '$lib/scoring';
	let { data } = $props();

	const et = (iso: string) =>
		new Date(iso)
			.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
			.replace(':00 ', ' ');

	const MODES = [
		['gotw', 'GAMES OF THE WEEK', '#f2c14e'],
		['spread', 'SPREADS', 'var(--hot)'],
		['ml', 'MONEYLINE', 'var(--led)']
	] as const;

	const rec = (t: { w: number; l: number; t: number }) =>
		t.w + t.l + t.t ? `${t.w}-${t.l}${t.t ? `-${t.t}` : ''}` : '—';
	const pct = (t: { w: number; l: number }) =>
		t.w + t.l ? `${((t.w / (t.w + t.l)) * 100).toFixed(0)}%` : '—';

	const byMode = (kind: string) => data.picks.filter((p: any) => p.kind === kind);
	const outColor = (o: string) =>
		o === 'win' ? 'var(--ok)' : o === 'loss' ? 'var(--bad)' : o === 'push' ? '#6b7488' : 'var(--dim)';
</script>

<svelte:head><title>My picks — Week {data.week}</title></svelte:head>

<div class="mx-auto max-w-2xl px-3 pb-24 pt-3">
	<div class="mb-3 flex items-end justify-between gap-3">
		<h1 class="display text-[30px] leading-[0.85] text-white">
			MY PICKS<span style="color:var(--hot)">.</span>
		</h1>
		<div class="flex gap-1 overflow-x-auto" role="tablist" aria-label="Week">
			{#each data.weeks as w}
				<a href="?season={data.season}&week={w}" role="tab" aria-selected={w === data.week}
					class="cond shrink-0 border px-2.5 py-1 text-[13px] font-bold tracking-wider transition-colors"
					style="border-color:{w === data.week ? '#fff' : 'var(--edge)'};background:{w === data.week ? '#fff' : 'transparent'};color:{w === data.week ? '#12141c' : '#9099ad'}"
				>{w}</a>
			{/each}
		</div>
	</div>

	<!-- Week beside season, so a hot week is visible against the body of work. -->
	{#each [['WEEK ' + data.week, data.thisWeek], ['SEASON', data.season_]] as const as [label, t]}
		<section class="mb-3">
			<h2 class="cond mb-1.5 text-[13px] tracking-[0.16em]" style="color:var(--dim)">{label}</h2>
			<div class="grid grid-cols-3 gap-1.5">
				{#each MODES as [kind, name, hue]}
					{@const s = kind === 'gotw' ? t.gotw : kind === 'spread' ? t.spread : t.ml}
					<div class="border px-2.5 py-2" style="border-color:var(--edge);background:var(--panel)">
						<div class="cond text-[11px] leading-tight tracking-[0.1em]" style="color:{hue}">
							{kind === 'gotw' ? 'GOTW' : name}
						</div>
						<div class="display mt-1 text-[22px] leading-none text-white">{rec(s)}</div>
						<div class="cond mt-0.5 text-[12px] tracking-wider" style="color:var(--dim)">
							{#if kind === 'ml'}{s.w + s.l ? fmtPts(s.pts) + ' pts' : '—'}{:else}{pct(s)}{/if}
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/each}

	{#each MODES as [kind, name, hue]}
		{@const list = byMode(kind)}
		<section class="mb-4">
			<h2 class="display mb-2 border-b-2 pb-1.5 text-[16px] leading-none"
				style="border-color:var(--edge);color:{hue}">
				{name}<span class="cond ml-2 text-[13px]" style="color:var(--dim)">{list.length}</span>
			</h2>
			{#if !list.length}
				<p class="cond py-4 text-[14px] tracking-wider" style="color:var(--dim)">NO PICKS THIS WEEK.</p>
			{:else}
				<div class="space-y-1.5">
					{#each list as p (p.kind + p.abbr + p.start)}
						<div class="flex items-center gap-2.5 border px-2.5 py-2"
							style="border-color:var(--line);background:#0f121a">
							{#if p.seed}
								<span class="display w-4 shrink-0 text-right text-[13px] leading-none" style="color:{hue}">{p.seed}</span>
							{/if}
							{#if p.logo}
								<img src={p.logo} alt="" loading="lazy" class="h-7 w-7 shrink-0 object-contain" />
							{/if}
							<div class="min-w-0 flex-1">
								<div class="display truncate text-[15px] leading-none text-white">{p.abbr}</div>
								<div class="cond mt-1 truncate text-[12px] tracking-wider" style="color:var(--dim)">
									vs {p.opp} · {et(p.start)}
								</div>
							</div>
							<div class="shrink-0 text-right">
								<div class="display text-[14px] leading-none" style="color:#aab2c6">
									{#if kind === 'spread'}{lineFor(p.line, p.side)}
									{:else if kind === 'ml'}{p.odds !== null ? fmtOdds(p.odds) : '—'}
									{:else}{lineFor(p.line, p.side)}{/if}
								</div>
								{#if p.score}
									<div class="cond mt-1 text-[12px] tracking-wider" style="color:var(--dim)">{p.score}</div>
								{/if}
							</div>
							<span class="display flex w-16 shrink-0 items-baseline justify-end gap-1 text-right text-[14px] leading-none"
								style="color:{outColor(p.outcome)}">
								{#if p.outcome === 'pending'}<span>—</span>
								{:else if p.outcome === 'push'}<span>PUSH</span>
								{:else}
									<span>{p.outcome === 'win' ? 'W' : 'L'}</span>
									{#if kind === 'ml' && p.pts !== null}<span>{fmtPts(p.pts)}</span>{/if}
								{/if}
							</span>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/each}
</div>
