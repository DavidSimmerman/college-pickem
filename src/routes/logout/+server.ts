import { redirect } from '@sveltejs/kit';
import { dropSession } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ cookies }) => {
	const sid = cookies.get('sid');
	if (sid) dropSession(sid);
	cookies.delete('sid', { path: '/' });
	redirect(303, '/login');
};
