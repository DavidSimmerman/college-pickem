import { json, error } from '@sveltejs/kit';
import { one, run } from '$lib/server/db';
import type { RequestHandler } from './$types';

/** Toggle a watched team for the signed-in player. */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.player) error(401, 'sign in first');

	const { team } = await request.json().catch(() => ({}) as any);
	if (typeof team !== 'string' || !/^[A-Za-z0-9&'.-]{1,10}$/.test(team)) error(400, 'bad team');

	// only accept abbreviations that actually appear on the schedule
	const known = await one('SELECT 1 AS ok FROM games WHERE home_abbr = ? OR away_abbr = ? LIMIT 1', team, team);
	if (!known) error(404, 'no such team');

	const had = await one('DELETE FROM watches WHERE player_id = ? AND team = ? RETURNING team',
		locals.player.id, team);
	if (!had) await run('INSERT INTO watches (player_id, team) VALUES (?, ?)', locals.player.id, team);

	return json({ watching: !had });
};
