import { redirect, error } from '@sveltejs/kit';
import { authUrl, configured, newState } from '$lib/server/google';
import type { RequestHandler } from './$types';

/**
 * Start the Google flow. Signed in already, this links Google to the current account
 * instead of making a second one — recorded in the state cookie so the callback knows
 * which it was without trusting anything the browser sends back.
 */
export const GET: RequestHandler = ({ url, cookies, locals }) => {
	if (!configured()) error(503, 'Google sign-in is not configured on this server');

	const state = newState();
	cookies.set('g_state', state, {
		path: '/auth/google',
		httpOnly: true,
		sameSite: 'lax', // survives Google's top-level GET redirect back to us
		secure: url.protocol === 'https:',
		maxAge: 600
	});
	cookies.set('g_link', locals.player ? String(locals.player.id) : '', {
		path: '/auth/google',
		httpOnly: true,
		sameSite: 'lax',
		secure: url.protocol === 'https:',
		maxAge: 600
	});
	redirect(303, authUrl(url.origin, state));
};
