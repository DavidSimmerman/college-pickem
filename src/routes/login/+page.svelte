<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head><title>Sign in — CFB Pick'em</title></svelte:head>

<div class="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
	<h1 class="text-2xl font-semibold tracking-tight text-white">CFB Pick'em</h1>
	<p class="mt-1 text-sm text-neutral-500">
		Pick spreads and hunt upsets. New name? Just pick one — it signs you up.
	</p>

	<form method="POST" class="mt-6 space-y-3">
		<div>
			<label for="name" class="mb-1 block text-xs text-neutral-400">Name</label>
			<input id="name" name="name" value={form?.name ?? ''} required maxlength="24" autocomplete="username"
				list="players" placeholder="e.g. David"
				class="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-emerald-500" />
			<datalist id="players">{#each data.players as p}<option value={p.name}></option>{/each}</datalist>
		</div>
		<div>
			<label for="pass" class="mb-1 block text-xs text-neutral-400">Passcode</label>
			<input id="pass" name="pass" type="password" required minlength="4" autocomplete="current-password"
				class="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
		</div>
		{#if form?.msg}<p role="alert" class="rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-300">{form.msg}</p>{/if}
		<button class="w-full rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-black hover:bg-emerald-400">
			Continue
		</button>
	</form>
	<p class="mt-4 text-[11px] leading-relaxed text-neutral-600">
		Spread picks are straight win/loss. Moneyline picks pay the odds and cost one point when
		they miss — a +350 dog earns 3.50, a -400 favorite earns only 0.25. Chasing chalk bleeds you.
	</p>
</div>
