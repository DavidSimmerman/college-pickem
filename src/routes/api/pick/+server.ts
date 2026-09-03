import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { mlDead } from '$lib/scoring';
import type { RequestHandler } from './$types';

/** Toggle a single pick. Locks are enforced here, never trusted from the client. */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.player) error(401, 'sign in first');

	const { gameId, kind, side } = await request.json().catch(() => ({}) as any);
	if (typeof gameId !== 'string' || !gameId) error(400, 'bad gameId');
	if (kind !== 'spread' && kind !== 'ml') error(400, 'bad kind');
	if (side !== 'home' && side !== 'away' && side !== null) error(400, 'bad side');

	const g = db
		.prepare(`SELECT state, spread, ml_home, ml_away, datetime(start) <= datetime('now') AS started FROM games WHERE id = ?`)
		.get(gameId) as
		| { state: string; spread: number | null; ml_home: number | null; ml_away: number | null; started: number }
		| undefined;
	if (!g) error(404, 'no such game');
	if (g.state !== 'pre' || g.started) error(409, 'game has started');

	const price = kind === 'ml' ? (side === 'home' ? g.ml_home : g.ml_away) : g.spread;
	if (side !== null && price === null) error(409, 'no line posted yet');
	// A side that pays nothing for a correct pick is pure downside; the UI greys it out
	// and the server refuses it, so a hand-rolled request cannot bank a free -RISK.
	if (side !== null && kind === 'ml' && mlDead(price)) error(409, 'that side pays nothing');

	if (side === null) {
		db.prepare('DELETE FROM picks WHERE player_id = ? AND game_id = ? AND kind = ?').run(
			locals.player.id, gameId, kind
		);
		return json({ ok: true, side: null });
	}

	db.prepare(
		`INSERT INTO picks (player_id, game_id, kind, side, spread_at, odds_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(player_id, game_id, kind) DO UPDATE SET
       side = excluded.side, spread_at = excluded.spread_at,
       odds_at = excluded.odds_at, created_at = datetime('now')`
	).run(
		locals.player.id, gameId, kind, side,
		g.spread,
		kind === 'ml' ? price : null
	);
	return json({ ok: true, side });
};
