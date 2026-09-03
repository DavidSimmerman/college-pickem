import { json, error } from '@sveltejs/kit';
import { one, run } from '$lib/server/db';
import { getSlate } from '$lib/server/slate';
import type { RequestHandler } from './$types';

/**
 * Games of the Week: picks and submission. Every rule is re-checked here — the client
 * decides what to grey out, but it never decides what counts.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.player) error(401, 'sign in first');
	const body = (await request.json().catch(() => ({}))) as any;
	const season = Number(body.season);
	const week = Number(body.week);
	if (!Number.isInteger(season) || !Number.isInteger(week)) error(400, 'bad week');

	const card = await getSlate(locals.player.id, season, week);
	if (!card.frozen) error(409, "this week's games are not set yet");
	if (card.submitted) error(409, 'already submitted');
	if (!card.open) error(409, 'this card is closed');

	if (body.action === 'submit') {
		// Only games that can still be picked are owed. One that kicked off before you
		// got to it is gone, and holding the whole card hostage to it helps nobody.
		if (card.openLeft > 0)
			error(409, `pick the ${card.openLeft} game${card.openLeft === 1 ? '' : 's'} that ${card.openLeft === 1 ? 'has' : 'have'} not kicked off yet`);
		await run('INSERT INTO slate_submits (player_id, season, week) VALUES (?,?,?)',
			locals.player.id, season, week);
		return json({ ok: true, submitted: true });
	}

	const { gameId, side } = body;
	if (typeof gameId !== 'string' || !gameId) error(400, 'bad gameId');
	if (side !== 'home' && side !== 'away') error(400, 'bad side');
	// A game can only be picked if it is on this week's card.
	const g = await one<{
		ml_home: number | null; ml_away: number | null; state: string; started: boolean;
	}>(
		`SELECT g.ml_home, g.ml_away, g.state, g.start <= now() AS started
       FROM slate s JOIN games g ON g.id = s.game_id
       WHERE s.season = ? AND s.week = ? AND s.game_id = ?`,
		season, week, gameId
	);
	if (!g) error(404, 'that game is not on this week\'s board');
	if (g.state !== 'pre' || g.started) error(409, 'game has started');

	// Kept only as a record of how the game was priced when the pick was made — Games of
	// the Week is win/loss, so this never feeds a score.
	const price = side === 'home' ? g.ml_home : g.ml_away;

	await run(
		`INSERT INTO slate_picks (player_id, game_id, side, odds_at) VALUES (?,?,?,?)
     ON CONFLICT (player_id, game_id) DO UPDATE SET
       side = excluded.side, odds_at = excluded.odds_at, created_at = now()`,
		locals.player.id, gameId, side, price
	);

	const after = await getSlate(locals.player.id, season, week);
	return json({ ok: true, side, filled: after.filled, size: after.size });
};
