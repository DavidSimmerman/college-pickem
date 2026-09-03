import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getCard } from '$lib/server/slate';
import { mlDead } from '$lib/scoring';
import type { RequestHandler } from './$types';

/**
 * Card picks and card submission. Every rule is re-checked here — the client decides
 * what to grey out, but it never decides what counts.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.player) error(401, 'sign in first');
	const body = (await request.json().catch(() => ({}))) as any;
	const season = Number(body.season);
	const week = Number(body.week);
	if (!Number.isInteger(season) || !Number.isInteger(week)) error(400, 'bad week');

	const card = getCard(locals.player.id, season, week);
	if (!card.frozen) error(409, 'the card for this week is not set yet');
	if (card.submitted) error(409, 'card already submitted');
	if (!card.open) error(409, 'the card closed when the first game kicked off');

	if (body.action === 'submit') {
		if (card.filled < card.size) error(409, `pick all ${card.size} games first`);
		db.prepare('INSERT INTO slate_submits (player_id, season, week) VALUES (?,?,?)').run(
			locals.player.id, season, week
		);
		return json({ ok: true, submitted: true });
	}

	const { gameId, side } = body;
	if (typeof gameId !== 'string' || !gameId) error(400, 'bad gameId');
	if (side !== 'home' && side !== 'away') error(400, 'bad side');
	// A game can only be picked if it is on this week's card.
	const g = db
		.prepare(
			`SELECT g.ml_home, g.ml_away, g.state, datetime(g.start) <= datetime('now') AS started
       FROM slate s JOIN games g ON g.id = s.game_id
       WHERE s.season = ? AND s.week = ? AND s.game_id = ?`
		)
		.get(season, week, gameId) as
		| { ml_home: number | null; ml_away: number | null; state: string; started: number }
		| undefined;
	if (!g) error(404, 'that game is not on this card');
	if (g.state !== 'pre' || g.started) error(409, 'game has started');

	const price = side === 'home' ? g.ml_home : g.ml_away;
	if (mlDead(price)) error(409, 'that side pays nothing — pick the other one');

	db.prepare(
		`INSERT INTO slate_picks (player_id, game_id, side, odds_at) VALUES (?,?,?,?)
     ON CONFLICT(player_id, game_id) DO UPDATE SET
       side = excluded.side, odds_at = excluded.odds_at, created_at = datetime('now')`
	).run(locals.player.id, gameId, side, price);

	const after = getCard(locals.player.id, season, week);
	return json({ ok: true, side, filled: after.filled, size: after.size });
};
