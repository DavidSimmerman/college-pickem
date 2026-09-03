import { redirect } from '@sveltejs/kit';
import { createSession, hashPass } from '$lib/server/db';
import { configured, exchange, resolveAccount, stateMatches } from '$lib/server/google';
import { randomBytes } from 'node:crypto';
import type { RequestHandler } from './$types';

// Annotated on the variable, not just the arrow: that is the only form TypeScript
// treats as terminating, so every guard below narrows without a non-null assertion.
const back: (msg: string) => never = (msg) => redirect(303, `/login?e=${encodeURIComponent(msg)}`);

export const GET: RequestHandler = async ({ url, cookies }) => {
	const wanted = cookies.get('g_state');
	const link = cookies.get('g_link');
	cookies.delete('g_state', { path: '/auth/google' });
	cookies.delete('g_link', { path: '/auth/google' });

	if (!configured()) back('Google sign-in is not set up on this server.');
	if (url.searchParams.get('error')) back('Google sign-in was cancelled.');

	const code = url.searchParams.get('code');
	// A mismatched state means this callback was not started by us: drop it.
	if (!code || !stateMatches(url.searchParams.get('state') ?? undefined, wanted)) {
		back('That sign-in link expired. Try again.');
	}

	let profile;
	try {
		profile = await exchange(code, url.origin);
	} catch (e) {
		console.error('[google]', (e as Error).message);
		back('Google would not complete the sign-in. Try again.');
	}

	// A Google-made account gets an unguessable passcode, so the password form can never
	// match it — there is no password to leak or to reset into.
	const out = await resolveAccount(profile, link ? Number(link) : null, () =>
		hashPass(randomBytes(32).toString('hex'))
	);
	if ('error' in out) back(out.error);

	cookies.set('sid', await createSession(out.id), {
		path: '/', httpOnly: true, sameSite: 'lax',
		secure: url.protocol === 'https:',
		maxAge: 60 * 60 * 24 * 180
	});
	redirect(303, link ? '/me' : '/');
};
