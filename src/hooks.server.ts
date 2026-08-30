import type { Handle, HandleServerError } from '@sveltejs/kit';
import { playerForToken } from '$lib/server/db';
import { startScraper } from '$lib/server/espn';

startScraper();

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.player = playerForToken(event.cookies.get('sid'));
	return resolve(event);
};

export const handleError: HandleServerError = ({ error, event }) => {
	console.error(`[error] ${event.request.method} ${event.url.pathname}:`, error);
	return { message: 'Something went wrong. Try again.' };
};
