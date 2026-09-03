import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

/** Toggle a watched team for the signed-in player. */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.player) error(401, 'sign in first');

	const { team } = await request.json().catch(() => ({}) as any);
	if (typeof team !== 'string' || !/^[A-Za-z0-9&'.-]{1,10}$/.test(team)) error(400, 'bad team');

	// only accept abbreviations that actually appear on the schedule
	const known = db
		.prepare('SELECT 1 AS ok FROM games WHERE home_abbr = ? OR away_abbr = ? LIMIT 1')
		.get(team, team) as { ok: number } | undefined;
	if (!known) error(404, 'no such team');

	const had = db
		.prepare('DELETE FROM watches WHERE player_id = ? AND team = ? RETURNING team')
		.get(locals.player.id, team);
	if (!had) db.prepare('INSERT INTO watches (player_id, team) VALUES (?, ?)').run(locals.player.id, team);

	return json({ watching: !had });
};
