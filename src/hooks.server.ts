import type { Handle, HandleServerError } from '@sveltejs/kit';
import { migrate, playerForToken } from '$lib/server/db';
import { startScraper } from '$lib/server/espn';

startScraper();

export const handle: Handle = async ({ event, resolve }) => {
	// Cheap after the first call: migrate() memoises its promise.
	await migrate();
	event.locals.player = await playerForToken(event.cookies.get('sid'));
	return resolve(event);
};

export const handleError: HandleServerError = ({ error, event }) => {
	console.error(`[error] ${event.request.method} ${event.url.pathname}:`, error);
	return { message: 'Something went wrong. Try again.' };
};
