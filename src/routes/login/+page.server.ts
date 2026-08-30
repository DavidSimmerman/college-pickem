import { fail, redirect } from '@sveltejs/kit';
import { db, hashPass, verifyPass, createSession } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.player) redirect(303, '/');
	return { players: db.prepare('SELECT name FROM players ORDER BY name').all() as { name: string }[] };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const pass = String(form.get('pass') ?? '');

		if (name.length < 2 || name.length > 24) return fail(400, { name, msg: 'Name must be 2–24 characters.' });
		if (!/^[\p{L}\p{N} '._-]+$/u.test(name)) return fail(400, { name, msg: 'Letters, numbers, spaces and . _ - only.' });
		if (pass.length < 4) return fail(400, { name, msg: 'Passcode must be at least 4 characters.' });

		const existing = db.prepare('SELECT id, pass FROM players WHERE name = ?').get(name) as
			| { id: number; pass: string }
			| undefined;

		let id: number;
		if (existing) {
			if (!verifyPass(pass, existing.pass)) return fail(400, { name, msg: 'Wrong passcode for that name.' });
			id = existing.id;
		} else {
			id = Number(
				db.prepare('INSERT INTO players (name, pass) VALUES (?, ?) RETURNING id').get(name, hashPass(pass))!.id
			);
		}

		cookies.set('sid', createSession(id), {
			path: '/', httpOnly: true, sameSite: 'lax',
			secure: process.env.NODE_ENV === 'production',
			maxAge: 60 * 60 * 24 * 180
		});
		redirect(303, '/');
	}
};
