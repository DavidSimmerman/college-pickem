<script lang="ts">
	import { enhance } from '$app/forms';
	import { MAX_WIN, RISK } from '$lib/scoring';
	let { data, form } = $props();

	// The failed action decides which tab you land back on, so an error never appears
	// under the wrong heading.
	let mode = $state<'signin' | 'signup'>(form?.mode === 'signup' ? 'signup' : 'signin');
	let show = $state(false);
	let busy = $state(false);
	const isUp = $derived(mode === 'signup');
</script>

<svelte:head><title>{isUp ? 'Create an account' : 'Sign in'} — CFB Pick'em</title></svelte:head>

<div class="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-10">
	<h1 class="display text-[46px] leading-[0.82] text-white">
		CFB<br />PICK<span style="color:var(--hot)">'</span>EM
	</h1>
	<p class="cond mt-3 text-[16px] leading-snug tracking-wide" style="color:var(--dim)">
		TEN GAMES A WEEK. PICK SPREADS. HUNT UPSETS.
	</p>

	<div class="mt-7 flex gap-[3px]" role="tablist" aria-label="Sign in or create an account">
		{#each [['signin', 'SIGN IN'], ['signup', 'CREATE ACCOUNT']] as const as [m, label]}
			<button type="button" role="tab" aria-selected={mode === m} onclick={() => (mode = m)}
				class="slant cond h-10 flex-1 border text-[13px] font-bold tracking-[0.12em] transition-colors"
				style="border-color:{mode === m ? 'transparent' : 'var(--edge)'};
					background:{mode === m ? 'var(--hot)' : 'var(--panel)'};
					color:{mode === m ? '#12141c' : '#8b93a8'}"
			>{label}</button>
		{/each}
	</div>

	{#if data.notice}
		<p role="alert" class="cond mt-2.5 border px-3 py-2 text-[14px] leading-snug tracking-wide"
			style="border-color:var(--bad);color:var(--bad);background:color-mix(in oklab, var(--bad) 12%, transparent)">
			{data.notice}
		</p>
	{/if}

	<!-- One form, two actions: the button you press decides which, so the server never
	     has to guess whether you meant to sign in or sign up. -->
	<form method="POST" action="?/{mode}" class="mt-2.5 space-y-2.5"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => { await update(); busy = false; };
		}}>
		<div>
			<label for="name" class="cond mb-1 block text-[12px] tracking-[0.16em]" style="color:#565e73">NAME</label>
			<input id="name" name="name" value={form?.name ?? ''} required maxlength="24"
				autocomplete="username" autocapitalize="none" spellcheck="false"
				placeholder={isUp ? 'PICK A NAME' : 'YOUR NAME'} class="searchbox" />
		</div>

		<div>
			<label for="pass" class="cond mb-1 block text-[12px] tracking-[0.16em]" style="color:#565e73">PASSCODE</label>
			<div class="relative">
				<input id="pass" name="pass" type={show ? 'text' : 'password'} required minlength="4"
					autocomplete={isUp ? 'new-password' : 'current-password'} class="searchbox pr-14" />
				<button type="button" onclick={() => (show = !show)}
					class="cond absolute right-2 top-1/2 -translate-y-1/2 px-1 text-[12px] tracking-wider"
					style="color:#7e879c">{show ? 'HIDE' : 'SHOW'}</button>
			</div>
			{#if isUp}
				<p class="cond mt-1 text-[12px] tracking-wide" style="color:#565e73">At least 4 characters.</p>
			{/if}
		</div>

		{#if isUp}
			<div>
				<label for="again" class="cond mb-1 block text-[12px] tracking-[0.16em]" style="color:#565e73">PASSCODE AGAIN</label>
				<input id="again" name="again" type={show ? 'text' : 'password'} required minlength="4"
					autocomplete="new-password" class="searchbox" />
			</div>
		{/if}

		<!-- An error belongs to the tab that produced it; switching tabs drops it rather
		     than leaving "that name is taken" sitting under Sign in. -->
		{#if form?.msg && form.mode === mode}
			<p role="alert" class="cond border px-3 py-2 text-[14px] leading-snug tracking-wide"
				style="border-color:var(--bad);color:var(--bad);background:color-mix(in oklab, var(--bad) 12%, transparent)">
				{form.msg}
			</p>
		{/if}

		<button disabled={busy} class="display slant h-12 w-full text-[16px] disabled:opacity-60"
			style="background:var(--hot);color:#12141c">
			{busy ? 'ONE SECOND' : isUp ? 'CREATE ACCOUNT' : 'SIGN IN'}
		</button>
	</form>

	{#if data.google}
		<div class="mt-5 flex items-center gap-3">
			<span class="h-px flex-1" style="background:var(--edge)"></span>
			<span class="cond text-[12px] tracking-[0.16em]" style="color:#565e73">OR</span>
			<span class="h-px flex-1" style="background:var(--edge)"></span>
		</div>
		<a href="/auth/google"
			class="cond mt-3 flex h-12 items-center justify-center gap-2.5 border text-[14px] font-bold tracking-[0.1em] transition-colors"
			style="border-color:var(--edge);background:#fff;color:#12141c">
			<svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
				<path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v9h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.5 6.6-16.4z"/>
				<path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.2 15.5 46 24 46z"/>
				<path fill="#FBBC05" d="M11.8 28.3c-.4-1.3-.7-2.7-.7-4.3s.3-2.9.7-4.3v-5.7H4.5C2.9 17.1 2 20.4 2 24s.9 6.9 2.5 10l7.3-5.7z"/>
				<path fill="#EA4335" d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.1 29.9 2 24 2 15.5 2 8.1 6.8 4.5 14l7.3 5.7c1.7-5.2 6.5-9 12.2-9z"/>
			</svg>
			SIGN IN WITH GOOGLE
		</a>
	{/if}

	<div class="mt-8 border-t pt-4" style="border-color:var(--edge)">
		<p class="cond text-[13px] leading-relaxed tracking-wide" style="color:#5b6478">
			GAMES OF THE WEEK IS TEN CURATED GAMES, PICKED STRAIGHT UP, WIN/LOSS ONLY.
			SPREADS ARE WIN/LOSS TOO. MONEYLINE PAYS THE ODDS AND COSTS
			<b style="color:var(--bad)">{RISK}</b> WHEN IT MISSES —
			A <b style="color:var(--ok)">+350</b> DOG EARNS <b style="color:var(--ok)">35</b>,
			A <b style="color:var(--led)">-400</b> FAVOURITE EARNS <b style="color:var(--led)">3</b>,
			CAPPED AT <b style="color:var(--ok)">{MAX_WIN}</b>. CHASING CHALK BLEEDS YOU.
		</p>
	</div>
</div>
