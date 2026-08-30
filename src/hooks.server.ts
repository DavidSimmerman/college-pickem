import type { Handle } from '@sveltejs/kit';
import { playerForToken } from '$lib/server/db';
import { startScraper } from '$lib/server/espn';

startScraper();

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.player = playerForToken(event.cookies.get('sid'));
	return resolve(event);
};
