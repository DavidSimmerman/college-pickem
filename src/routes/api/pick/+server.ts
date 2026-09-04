import { json, error } from '@sveltejs/kit';
import { one, run } from '$lib/server/db';
import { spDead, lineOn } from '$lib/scoring';
import type { RequestHandler } from './$types';

/** Toggle a single pick. Locks are enforced here, never trusted from the client. */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.player) error(401, 'sign in first');

	const { gameId, kind, side } = await request.json().catch(() => ({}) as any);
	if (typeof gameId !== 'string' || !gameId) error(400, 'bad gameId');
	if (kind !== 'spread' && kind !== 'ml') error(400, 'bad kind');
	if (side !== 'home' && side !== 'away' && side !== null) error(400, 'bad side');

	const g = await one<{
		state: string; spread: number | null;
		ml_home: number | null; ml_away: number | null; started: boolean;
	}>('SELECT state, spread, ml_home, ml_away, start <= now() AS started FROM games WHERE id = ?', gameId);
	if (!g) error(404, 'no such game');
	if (g.state !== 'pre' || g.started) error(409, 'game has started');

	if (side !== null && g.spread === null) error(409, 'no line posted yet');
	// Both modes are priced off the spread now, so both need one. Backing a favourite
	// this heavy is not a decision; the UI greys it out and the server refuses it, so a
	// hand-rolled request cannot slip one through.
	if (side !== null && kind === 'ml' && spDead(lineOn(g.spread, side))) error(409, 'that side is too heavy a favourite');

	if (side === null) {
		await run('DELETE FROM picks WHERE player_id = ? AND game_id = ? AND kind = ?',
			locals.player.id, gameId, kind);
		return json({ ok: true, side: null });
	}

	await run(
		`INSERT INTO picks (player_id, game_id, kind, side, spread_at, odds_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT (player_id, game_id, kind) DO UPDATE SET
       side = excluded.side, spread_at = excluded.spread_at,
       odds_at = excluded.odds_at, created_at = now()`,
		locals.player.id, gameId, kind, side,
		g.spread,
		kind === 'ml' ? (side === 'home' ? g.ml_home : g.ml_away) : null
	);
	return json({ ok: true, side });
};
