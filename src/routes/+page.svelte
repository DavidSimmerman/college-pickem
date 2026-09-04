<script lang="ts">
	import { lineFor, mlWin, mlLose, mlDead, fmtOdds, fmtPts, mlPoints, gradeSpread, gradeMl, type Side } from '$lib/scoring';
	import { confRank } from '$lib/conferences';
	import { slateScore } from '$lib/slate';
	import { teamBg, inkOn, haloFilter, TINT } from '$lib/colors';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	let mode = $state<'spread' | 'ml' | 'slate'>('slate');
	let games = $state(data.games);
	let slate = $state(data.slate);
	let watched = $state(new Set(data.watched));
	let err = $state('');
	let submitting = $state(false);

	let q = $state('');
	let groupBy = $state<'top25' | 'conf' | 'all'>('top25');
	let sortBy = $state<'time' | 'close' | 'best'>('time');
	let band = $state<'all' | 'close' | 'mid' | 'blowout'>('all');
	let watchedOnly = $state(false);

	$effect(() => {
		games = data.games;
		slate = data.slate;
		watched = new Set(data.watched);
	});

	const et = (iso: string) =>
		new Date(iso)
			.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
			.replace(':00 ', ' ');

	async function pick(g: any, side: Side) {
		if (g.locked || deadSide(g, side)) return;
		if (mode === 'slate') return slatePick(g, side);
		const key = mode === 'spread' ? 'spread_pick' : 'ml_pick';
		const next = g[key] === side ? null : side;
		const prev = games;
		const patch: any = { [key]: next };
		if (mode === 'ml') patch.ml_odds_at = next ? (side === 'home' ? g.ml_home : g.ml_away) : null;
		games = games.map((x: any) => (x.id === g.id ? { ...x, ...patch } : x));
		err = '';

		const res = await fetch('/api/pick', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ gameId: g.id, kind: mode, side: next })
		});
		if (!res.ok) {
			games = prev;
			err = (await res.text().catch(() => '')) || 'Could not save that pick.';
			if (res.status === 409) invalidateAll();
		}
	}

	/** A pick here cannot be cleared, only moved: the board must end up complete. */
	async function slatePick(g: any, side: Side) {
		if (!slate.open) return;
		const prev = slate;
		slate = {
			...slate,
			games: slate.games.map((x: any) => (x.id === g.id ? { ...x, slate_pick: side } : x))
		};
		slate = {
			...slate,
			filled: slate.games.filter((x: any) => x.slate_pick).length,
			openLeft: slate.games.filter((x: any) => !x.slate_pick && !x.locked).length
		};
		err = '';
		const res = await fetch('/api/slate', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ season: data.season, week: data.week, gameId: g.id, side })
		});
		if (!res.ok) {
			slate = prev;
			err = (await res.text().catch(() => '')) || 'Could not save that pick.';
		}
	}

	async function submitSlate() {
		if (slate.openLeft > 0 || !slate.open || submitting) return;
		submitting = true;
		const res = await fetch('/api/slate', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ season: data.season, week: data.week, action: 'submit' })
		});
		submitting = false;
		if (res.ok) slate = { ...slate, submitted: true, open: false };
		else err = (await res.text().catch(() => '')) || 'Could not submit your picks.';
	}

	async function toggleWatch(team: string) {
		const next = new Set(watched);
		next.has(team) ? next.delete(team) : next.add(team);
		const prev = watched;
		watched = next;
		const res = await fetch('/api/watch', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ team })
		});
		if (!res.ok) {
			watched = prev;
			err = 'Could not update your teams.';
		}
	}

	const shown = $derived(
		games.filter((g: any) => {
			const s = Math.abs(g.spread ?? 0);
			if (band === 'close' && s > 3) return false;
			if (band === 'mid' && (s <= 3 || s > 10)) return false;
			if (band === 'blowout' && s <= 10) return false;
			if (watchedOnly && !watched.has(g.home_abbr) && !watched.has(g.away_abbr)) return false;
			if (q.trim()) {
				const t = q.trim().toLowerCase();
				if (!`${g.home_name} ${g.away_name} ${g.home_abbr} ${g.away_abbr} ${g.conf}`.toLowerCase().includes(t))
					return false;
			}
			return true;
		})
	);

	/**
	 * Order inside a group. A finished game has nothing left to decide, so it sinks to
	 * the bottom whatever the sort — you are here to make picks, not read box scores.
	 * `id` breaks remaining ties so the order never wobbles between renders.
	 */
	const order = (list: any[]) =>
		[...list].sort(
			(a, z) =>
				(a.state === 'post' ? 1 : 0) - (z.state === 'post' ? 1 : 0) ||
				(sortBy === 'close'
					? Math.abs(a.spread ?? 999) - Math.abs(z.spread ?? 999)
					: sortBy === 'best'
						? slateScore(z) - slateScore(a)
						: a.start < z.start ? -1 : a.start > z.start ? 1 : 0) ||
				(a.id < z.id ? -1 : 1)
		);

	const groups = $derived.by(() => {
		// ALL is deliberately flat: one list, no headings, nothing to expand.
		if (groupBy === 'all') return [['All games', order(shown)]] as [string, any[]][];

		const m = new Map<string, any[]>();
		const add = (k: string, g: any) => (m.get(k) ?? m.set(k, []).get(k)!).push(g);
		for (const g of shown) {
			if (watched.has(g.home_abbr) || watched.has(g.away_abbr)) add('My teams', g);
			// TOP 25 shows ranked games and stops there — an "everything else" bucket is
			// just the whole board again, which is what ALL is for.
			if (groupBy === 'top25') {
				if (g.top25) add('Top 25', g);
			} else add(g.conf, g);
		}
		const mine = m.get('My teams');
		m.delete('My teams');
		const rest = [...m.entries()];
		if (groupBy === 'conf')
			// strongest league first, then bigger slate as the tiebreak among equals
			rest.sort((a, z) => confRank(a[0]) - confRank(z[0]) || z[1].length - a[1].length);
		const all = mine?.length ? [['My teams', mine], ...rest] : rest;
		return all.map(([name, list]) => [name, order(list as any[])]) as [string, any[]][];
	});

	// Accordion state lives here, not in the DOM. `open={...}` is one-way: picking a
	// team re-derives `groups`, Svelte re-asserts the attribute, and a section the
	// user had opened snapped shut. Explicit choices win; untouched groups follow the
	// default, so filtering down to a handful still auto-expands them.
	let openChoice = $state<Record<string, boolean>>({});
	const defaultOpen = (name: string) => name === 'My teams' || groups.length < 4;
	const isOpen = (name: string) => openChoice[name] ?? defaultOpen(name);

	/**
	 * A side you cannot pick. On the moneyline a price that pays nothing for a correct
	 * pick is pure downside, and a game with no line cannot be priced either way — both
	 * grey out rather than pretending to be a choice. Games of the Week needs no such
	 * rule: it is scored win/loss, and foregone games never make the board to begin with.
	 */
	const deadSide = (g: any, side: Side) =>
		mode === 'ml'
			? mlDead(side === 'home' ? g.ml_home : g.ml_away)
			: mode === 'spread'
				? g.spread === null
				: false;
	const deadGame = (g: any) => deadSide(g, 'home') && deadSide(g, 'away');

	const pickOn = (g: any) =>
		mode === 'spread' ? g.spread_pick : mode === 'ml' ? g.ml_pick : g.slate_pick;

	const mlPicks = $derived(shown.filter((g: any) => g.ml_pick));
	const upside = $derived(mlPicks.reduce((t: number, g: any) => t + mlWin(g.ml_odds_at ?? 0), 0));
	const spreadCount = $derived(shown.filter((g: any) => g.spread_pick).length);

	const outcome = (g: any) =>
		mode === 'spread'
			? gradeSpread(g.spread_pick, g.spread_at ?? g.spread, g.home_score, g.away_score)
			: gradeMl(pickOn(g), g.home_score, g.away_score);

	/** Open or shut every group at once. Writing each name explicitly beats a global
	 *  flag: a later filter change adds groups that then follow the default again. */
	const setAll = (open: boolean) =>
		(openChoice = Object.fromEntries(groups.map(([name]) => [name, open])));

	const BANDS = [['all', 'ALL'], ['close', '≤3'], ['mid', '3–10'], ['blowout', '10+']] as const;
	const GROUPS = [['top25', 'TOP 25'], ['conf', 'CONF'], ['all', 'ALL']] as const;
	const SORTS = [['time', 'TIME'], ['close', 'CLOSE'], ['best', 'BEST']] as const;
</script>

<svelte:head><title>Week {data.week} — CFB Pick'em</title></svelte:head>

<div class="mx-auto max-w-2xl px-3 pb-24 pt-3">
	<div class="mb-3 flex items-end justify-between gap-3">
		<h1 class="display text-[30px] leading-[0.85] text-white">
			WEEK {data.week}<span style="color:var(--hot)">.</span>
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

	<!-- mode: spreads, moneyline, or the weekly card -->
	<div class="sticky top-0 z-30 -mx-3 mb-3 px-3 pb-2 pt-2 backdrop-blur-md" style="background:color-mix(in oklab, var(--bg) 88%, transparent)">
		<div class="flex gap-[3px]">
			{#each [['slate', 'GAMES OF THE WEEK', slate.frozen ? slate.filled : 0, '#f2c14e'], ['spread', 'SPREADS', spreadCount, 'var(--hot)'], ['ml', 'MONEYLINE', mlPicks.length, 'var(--led)']] as const as [m, label, n, hue]}
				<button onclick={() => (mode = m)} aria-pressed={mode === m}
					class="slant cond h-10 flex-1 border text-[13px] font-bold tracking-[0.12em] transition-colors"
					style="border-color:{mode === m ? 'transparent' : 'var(--edge)'};
						background:{mode === m ? hue : 'var(--panel)'};
						color:{mode === m ? '#12141c' : '#8b93a8'}"
				>{label}{#if n}<span class="ml-1.5 opacity-70">{n}</span>{/if}</button>
			{/each}
		</div>
		{#if mode === 'ml' && mlPicks.length}
			<p class="cond mt-1.5 flex justify-between text-[13px] tracking-wider" style="color:var(--dim)">
				<span>ALL HIT <b style="color:var(--ok)">{fmtPts(upside)}</b></span>
				<span>ALL MISS <b style="color:var(--bad)">{fmtPts(mlPicks.length * mlLose())}</b></span>
			</p>
		{/if}
		{#if mode === 'slate' && slate.frozen}
			<div class="mt-1.5 flex items-center gap-2">
				<div class="h-1.5 flex-1 border" style="border-color:var(--edge);background:var(--panel)">
					<div class="h-full transition-all"
						style="width:{slate.needed ? (slate.filled / slate.needed) * 100 : 0}%;background:{slate.submitted ? 'var(--ok)' : '#f2c14e'}"></div>
				</div>
				<span class="cond shrink-0 text-[13px] tracking-wider" style="color:var(--dim)">
					{slate.filled} / {slate.needed}
				</span>
				{#if slate.submitted}
					<span class="cond shrink-0 border px-2 py-0.5 text-[13px] font-bold tracking-wider"
						style="border-color:var(--ok);color:var(--ok)">SUBMITTED</span>
				{:else if !slate.open}
					<span class="cond shrink-0 border px-2 py-0.5 text-[13px] font-bold tracking-wider"
						style="border-color:var(--bad);color:var(--bad)">CLOSED</span>
				{:else}
					{@const owed = slate.openLeft > 0}
					<button onclick={submitSlate} disabled={owed || submitting}
						class="cond shrink-0 border px-3 py-0.5 text-[13px] font-bold tracking-wider transition-colors disabled:cursor-not-allowed"
						title={owed ? `${slate.openLeft} game${slate.openLeft === 1 ? '' : 's'} left to pick` : 'Lock in this card'}
						style="border-color:{owed ? 'var(--edge)' : '#f2c14e'};
							background:{owed ? 'transparent' : '#f2c14e'};
							color:{owed ? '#5b6478' : '#12141c'}"
					>{submitting ? 'SENDING' : 'SUBMIT'}</button>
				{/if}
			</div>
		{/if}
		{#if err}
			<p role="alert" class="cond mt-1.5 border px-3 py-1.5 text-[14px] tracking-wide"
				style="border-color:var(--bad);color:var(--bad);background:color-mix(in oklab, var(--bad) 12%, transparent)">{err}</p>
		{/if}
	</div>

	<!-- search + filters: Games of the Week is a fixed ten, so it has nothing to filter -->
	<div class="mb-4 space-y-2" class:hidden={mode === 'slate'}>
		<label class="block">
			<span class="sr-only">Search teams or conference</span>
			<input type="search" bind:value={q} placeholder="SEARCH TEAM OR CONFERENCE" class="searchbox" />
		</label>
		<div class="flex items-stretch gap-1.5">
			<span class="chiplabel">GROUP</span>
			{#each GROUPS as [k, label]}
				<button onclick={() => (groupBy = k)} aria-pressed={groupBy === k} class="chip flex-1">{label}</button>
			{/each}
		</div>
		<div class="flex items-stretch gap-1.5">
			<span class="chiplabel">SORT</span>
			{#each SORTS as [k, label]}
				<button onclick={() => (sortBy = k)} aria-pressed={sortBy === k} class="chip flex-1"
					title={k === 'time' ? 'Kickoff order' : k === 'close' ? 'Tightest line first' : 'Best games first, ranked the same way as Games of the Week'}
				>{label}</button>
			{/each}
		</div>
		<div class="flex items-stretch gap-1.5">
			<span class="chiplabel">LINE</span>
			{#each BANDS as [k, label]}
				<button onclick={() => (band = k)} aria-pressed={band === k} class="chip flex-1">{label}</button>
			{/each}
			<button onclick={() => (watchedOnly = !watchedOnly)} aria-pressed={watchedOnly} class="chip star"
				aria-label="Only my teams">★ {watched.size}</button>
		</div>
		{#if groupBy !== 'all'}
			<div class="flex items-stretch gap-1.5">
				<span class="chiplabel">ALL</span>
				<button onclick={() => setAll(true)} class="chip flex-1">EXPAND</button>
				<button onclick={() => setAll(false)} class="chip flex-1">COLLAPSE</button>
			</div>
		{/if}
	</div>

	<!-- One game, shared by the grouped board and Games of the Week. -->
	{#snippet gameCard(g: any, seed?: number)}
					{@const ac = teamBg(g.away_color, g.away_alt_color, g.away_logo_color)}
					{@const hc = teamBg(g.home_color, g.home_alt_color, g.home_logo_color)}
					{@const done = g.state === 'post'}
					{@const picked = pickOn(g)}
					{@const shut = deadGame(g) || (mode === 'slate' && !!g.locked)}
					{@const res = picked && done ? outcome(g) : null}
					<article class="border transition-opacity" style="border-color:var(--edge);background:#0f121a;
					{shut ? 'filter:grayscale(1);opacity:0.5' : ''}">
						<div class="flex items-center gap-2 border-b px-2.5 py-1.5" style="border-color:var(--line)">
							<!-- The rank rides inside the header. Sitting outside the card it pushed
							     every game off-centre and left them narrower than the bar above. -->
							{#if seed}
								<span class="display text-[13px] leading-none"
									style="color:{picked ? '#f2c14e' : '#5b6478'}">{seed}</span>
							{/if}
							<span class="cond text-[13px] font-semibold tracking-[0.12em]"
								style="color:{g.state === 'in' ? 'var(--hot)' : 'var(--dim)'}">
								{#if g.state === 'in'}● {g.detail}{:else if done}{g.detail}{:else}{et(g.start)}{/if}
							</span>
							{#if g.tv && !done}<span class="cond text-[12px] tracking-wider" style="color:#5b6478">{g.tv}</span>{/if}
							{#if g.locked && !done}<span class="cond text-[12px] tracking-wider" style="color:#5b6478">LOCKED</span>{/if}
							<span class="ml-auto flex gap-1">
								{#each ['away', 'home'] as const as side}
									{@const abbr = g[`${side}_abbr`]}
									<button onclick={() => toggleWatch(abbr)} aria-pressed={watched.has(abbr)}
										aria-label="Follow {g[`${side}_name`]}"
										class="cond px-1 text-[12px] font-semibold tracking-wide transition-colors"
										style="color:{watched.has(abbr) ? 'var(--led)' : '#41485c'}">★{abbr}</button>
								{/each}
							</span>
						</div>

						<div class="relative grid grid-cols-2">
							{#each ['away', 'home'] as const as side}
								{@const c = side === 'away' ? ac : hc}
								{@const rank = g[`${side}_rank`]}
								{@const odds = side === 'home' ? g.ml_home : g.ml_away}
								{@const lockedAt = mode === 'slate' ? g.slate_odds_at : g.ml_odds_at}
								{@const shownOdds = picked === side && lockedAt != null ? lockedAt : odds}
								{@const on = picked === side}
								{@const fg = on ? inkOn(c) : '#e8eaf0'}
								{@const dimmed = picked && !on}
								{@const off = deadSide(g, side)}
								<button
									onclick={() => pick(g, side)}
									disabled={g.locked || off || (mode === 'slate' && !slate.open)}
									aria-pressed={on}
									aria-label="{mode === 'spread' ? 'Spread' : mode === 'ml' ? 'Moneyline' : 'Game of the week'} pick {g[`${side}_name`]}"
									class="relative overflow-hidden px-2.5 pb-2.5 pt-3 text-left transition-all disabled:cursor-not-allowed"
									class:border-l={side === 'home'}
									class:pl-6={side === 'home'}
									style="border-color:var(--line);
										background:{on ? c : `color-mix(in oklab, ${c} ${TINT * 100}%, #0f121a)`};
										color:{fg};
										{off ? 'filter:grayscale(1);' : ''}
										opacity:{off ? 0.45 : dimmed ? 0.4 : g.locked && !picked ? 0.62 : 1}"
								>
									{#if g[`${side}_logo`]}
										<!-- The logo keeps its own colours, always. When it would otherwise be
										     invisible against a background ESPN derived from it, it gets an ink
										     outline instead of being repainted. -->
										{@const halo = on ? g[`${side}_halo_on`] : g[`${side}_halo_off`]}
										<img src={g[`${side}_logo`]} alt="" loading="lazy"
											class="pointer-events-none absolute right-1.5 top-1.5 w-[62px]"
											style="opacity:{on ? 1 : 0.9}{halo ? `;filter:${haloFilter(fg)}` : ''}" />
									{/if}
									{#if rank < 26}
										<span class="display block text-[11px] leading-none" style="color:{on ? fg : 'var(--led)'}">{rank}</span>
									{/if}
									<span class="display block text-[25px] leading-[0.9]">{g[`${side}_abbr`]}</span>

									{#if mode !== 'ml'}
										<!-- Games of the Week is scored straight up, so the line is context only:
										     shown so you can see who is favoured, never turned into points. -->
										<span class="display mt-1.5 block text-[17px] leading-none">
											{lineFor(on && g.spread_at != null ? g.spread_at : g.spread, side)}
										</span>
										{#if mode === 'spread'}
											<span class="cond block text-[13px] font-semibold" style="opacity:.6">
												{odds !== null ? fmtOdds(odds) : '—'}
											</span>
										{/if}
									{:else if odds !== null}
										<span class="display mt-1.5 block text-[17px] leading-none">{fmtOdds(shownOdds)}</span>
										{#if off}
											<span class="cond block text-[13px] font-semibold" style="opacity:.7">PAYS NOTHING</span>
										{:else}
											<span class="cond block text-[13px] font-semibold">
												<span style="color:{on ? fg : 'var(--ok)'}">{fmtPts(mlWin(shownOdds))}</span>
												<span style="opacity:.45"> / </span>
												<span style="color:{on ? fg : 'var(--bad)'}">{mlLose()}</span>
											</span>
										{/if}
									{:else}
										<span class="cond mt-1.5 block text-[13px]" style="opacity:.5">NO LINE</span>
									{/if}

									{#if done || g.state === 'in'}
										<span class="display absolute bottom-2 right-2.5 text-[22px] leading-none"
											style="opacity:{on ? 1 : 0.75}">{g[`${side}_score`] ?? 0}</span>
									{/if}
									{#if res && res !== 'pending'}
										<span class="display absolute right-0 top-0 px-1.5 py-0.5 text-[10px] leading-none"
											style="background:{res === 'win' ? 'var(--ok)' : res === 'loss' ? 'var(--bad)' : '#6b7488'};color:#0b0d12">
											{res === 'win' ? 'W' : res === 'loss' ? 'L' : 'PUSH'}{#if mode === 'ml' && lockedAt}
												{fmtPts(mlPoints(res, lockedAt))}{/if}
										</span>
									{/if}
								</button>
							{/each}
							<span class="display absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 border px-1.5 py-0.5 text-[10px] leading-none"
								style="background:#0f121a;border-color:var(--edge);color:#6b7488">AT</span>
						</div>
					</article>
	{/snippet}

	{#if mode === 'slate'}
		<div class="space-y-3">
			{#if !slate.frozen}
				<p class="cond py-16 text-center text-[15px] leading-relaxed tracking-wider" style="color:var(--dim)">
					THIS WEEK'S GAMES AREN'T SET YET.<br />
					<span style="opacity:.7">It locks in once ten games have a moneyline.</span>
				</p>
			{:else}
				<p class="cond text-[13px] leading-relaxed tracking-wider" style="color:var(--dim)">
					THE TEN GAMES THAT MATTER, RANKED. PICK EVERY WINNER STRAIGHT UP, THEN SUBMIT.<br />
					<span style="opacity:.7">Win-loss only — no points here.</span>
					<br /><span style="opacity:.7">
					Each game locks at its own kickoff. You can still submit after that — the ones that
					started just drop out.
				</span>
				{#if slate.missed && !slate.submitted}
					<br /><span style="color:var(--bad)">
						{slate.missed} game{slate.missed === 1 ? '' : 's'} kicked off before you picked {slate.missed === 1 ? 'it' : 'them'}.
					</span>
				{/if}
				</p>
				{#each slate.games as g, i (g.id)}
					{@render gameCard(g, i + 1)}
				{/each}
			{/if}
		</div>
	{:else}
	<div class="space-y-3">
		{#if groupBy === 'all'}
			<!-- ALL is a flat board: no heading, no accordion, nothing to collapse. -->
			{#each groups[0]?.[1] ?? [] as g (g.id)}
				{@render gameCard(g)}
			{:else}
				<p class="cond py-16 text-center text-[15px] tracking-wider" style="color:var(--dim)">
					{#if q || band !== 'all' || watchedOnly}NOTHING MATCHES THAT FILTER.{:else}NO GAMES LOADED FOR THIS WEEK YET.{/if}
				</p>
			{/each}
		{:else}
		{#each groups as [name, list] (name)}
			<details bind:open={() => isOpen(name), (v) => (openChoice[name] = v)} class="grp">
				<summary class="flex items-center gap-2 border-b-2 pb-2" style="border-color:var(--edge)">
					<span class="display text-[16px] leading-none" style="color:{name === 'My teams' ? 'var(--led)' : '#fff'}">{name}</span>
					<span class="cond px-1.5 text-[13px] font-bold" style="background:var(--edge);color:#aab2c6">{list.length}</span>
					<span class="caret ml-auto"></span>
				</summary>
				<div class="mt-2 space-y-2.5">
					{#each list as g (g.id)}
						{@render gameCard(g)}
					{/each}
				</div>
			</details>
		{:else}
			<p class="cond py-16 text-center text-[15px] tracking-wider" style="color:var(--dim)">
				{#if q || band !== 'all' || watchedOnly}NOTHING MATCHES THAT FILTER.{:else}NO GAMES LOADED FOR THIS WEEK YET.{/if}
			</p>
		{/each}
		{/if}
	</div>
	{/if}
</div>
