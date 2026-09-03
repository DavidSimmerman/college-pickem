import { fail, redirect } from '@sveltejs/kit';
import { db, hashPass, verifyPass, createSession } from '$lib/server/db';
import { configured } from '$lib/server/google';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.player) redirect(303, '/');
	return {
		google: configured(),
		// Carries a message back from the Google callback, which cannot use `fail`.
		notice: url.searchParams.get('e')
	};
};

const NAME_OK = /^[\p{L}\p{N} '._-]+$/u;

function check(name: string, pass: string) {
	if (name.length < 2 || name.length > 24) return 'Name must be 2–24 characters.';
	if (!NAME_OK.test(name)) return 'Letters, numbers, spaces and . _ - only.';
	if (pass.length < 4) return 'Passcode must be at least 4 characters.';
	return null;
}

function signIn(cookies: Parameters<Actions[string]>[0]['cookies'], id: number, secure: boolean) {
	cookies.set('sid', createSession(id), {
		path: '/', httpOnly: true, sameSite: 'lax', secure,
		maxAge: 60 * 60 * 24 * 180
	});
}

/**
 * Two explicit actions instead of one that guesses. The old single form signed you in
 * when the name existed and quietly created an account when it did not, so one typo in
 * your own name started a fresh season under a near-identical name. Now each path says
 * what it will do and refuses to do the other one.
 */
export const actions: Actions = {
	signin: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const pass = String(form.get('pass') ?? '');
		const bad = check(name, pass);
		if (bad) return fail(400, { mode: 'signin', name, msg: bad });

		const player = db.prepare('SELECT id, pass FROM players WHERE name = ?').get(name) as
			| { id: number; pass: string }
			| undefined;
		if (!player) return fail(400, { mode: 'signin', name, msg: `No player called ${name}. Create an account instead?` });
		if (!verifyPass(pass, player.pass))
			return fail(400, { mode: 'signin', name, msg: 'Wrong passcode for that name.' });

		signIn(cookies, player.id, url.protocol === 'https:');
		redirect(303, '/');
	},

	signup: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const pass = String(form.get('pass') ?? '');
		const again = String(form.get('again') ?? '');
		const bad = check(name, pass);
		if (bad) return fail(400, { mode: 'signup', name, msg: bad });
		if (pass !== again) return fail(400, { mode: 'signup', name, msg: 'The two passcodes do not match.' });

		if (db.prepare('SELECT 1 FROM players WHERE name = ?').get(name))
			return fail(400, { mode: 'signup', name, msg: `${name} is taken. Sign in instead?` });

		const id = Number(
			db.prepare('INSERT INTO players (name, pass) VALUES (?, ?) RETURNING id').get(name, hashPass(pass))!.id
		);
		signIn(cookies, id, url.protocol === 'https:');
		redirect(303, '/');
	}
};
