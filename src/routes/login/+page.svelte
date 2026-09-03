<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head><title>Sign in — CFB Pick'em</title></svelte:head>

<div class="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
	<h1 class="display text-[46px] leading-[0.82] text-white">
		CFB<br />PICK<span style="color:var(--hot)">'</span>EM
	</h1>
	<p class="cond mt-3 text-[16px] leading-snug tracking-wide" style="color:var(--dim)">
		PICK SPREADS. HUNT UPSETS. NEW NAME SIGNS YOU UP.
	</p>

	<form method="POST" class="mt-7 space-y-2.5">
		<div>
			<label for="name" class="cond mb-1 block text-[12px] tracking-[0.16em]" style="color:#565e73">NAME</label>
			<input id="name" name="name" value={form?.name ?? ''} required maxlength="24" autocomplete="username"
				list="players" placeholder="DAVID" class="searchbox" />
			<datalist id="players">{#each data.players as p}<option value={p.name}></option>{/each}</datalist>
		</div>
		<div>
			<label for="pass" class="cond mb-1 block text-[12px] tracking-[0.16em]" style="color:#565e73">PASSCODE</label>
			<input id="pass" name="pass" type="password" required minlength="4" autocomplete="current-password" class="searchbox" />
		</div>
		{#if form?.msg}
			<p role="alert" class="cond border px-3 py-2 text-[14px] tracking-wide"
				style="border-color:var(--bad);color:var(--bad);background:color-mix(in oklab, var(--bad) 12%, transparent)">{form.msg}</p>
		{/if}
		<button class="display slant h-12 w-full text-[16px]" style="background:var(--hot);color:#12141c">ENTER</button>
	</form>

	<div class="mt-8 border-t pt-4" style="border-color:var(--edge)">
		<p class="cond text-[13px] leading-relaxed tracking-wide" style="color:#5b6478">
			SPREADS ARE STRAIGHT WIN/LOSS. MONEYLINE PAYS THE ODDS AND COSTS ONE POINT WHEN IT MISSES —
			A <b style="color:var(--ok)">+350</b> DOG EARNS <b style="color:var(--ok)">3.50</b>,
			A <b style="color:var(--led)">-400</b> FAVOURITE EARNS <b style="color:var(--led)">0.25</b>.
			CHASING CHALK BLEEDS YOU.
		</p>
	</div>
</div>
