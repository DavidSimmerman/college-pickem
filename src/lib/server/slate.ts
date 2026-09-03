// Freezing and reading the picks-of-the-week card. The ranking itself lives in
// $lib/slate; this module is only about when a card becomes real and who may change it.

import { db } from './db';
import { buildSlate, SLATE_SIZE, type SlateGame } from '$lib/slate';

export type Card = {
	games: any[];
	frozen: boolean;
	submitted: boolean;
	deadline: string | null; // first kickoff on the card
	open: boolean; // still editable
	filled: number;
	size: number;
};

/**
 * Lines post gradually through the week, so a card frozen on Tuesday off three priced
 * games would be junk that nobody could unfreeze. We hold off until a full card's worth
 * of games are actually pickable, then freeze once and never look again.
 */
function freezeIfReady(season: number, week: number): boolean {
	const already = (
		db.prepare('SELECT COUNT(*) AS n FROM slate WHERE season = ? AND week = ?').get(season, week) as { n: number }
	).n;
	if (already) return true;

	const rows = db
		.prepare(
			`SELECT id, spread, ml_home, ml_away, home_rank, away_rank, home_conf, away_conf
       FROM games WHERE season = ? AND week = ?`
		)
		.all(season, week) as SlateGame[];

	const picked = buildSlate(rows);
	if (picked.length < SLATE_SIZE) return false; // not enough priced games yet

	const ins = db.prepare('INSERT OR IGNORE INTO slate (season, week, game_id, seed) VALUES (?,?,?,?)');
	picked.forEach((g, i) => ins.run(season, week, g.id, i + 1));
	console.log(`[slate] froze ${picked.length} games for ${season} wk${week}`);
	return true;
}

/** The card for one week from one player's point of view. */
export function getCard(playerId: number, season: number, week: number): Card {
	const frozen = freezeIfReady(season, week);
	if (!frozen) {
		return { games: [], frozen: false, submitted: false, deadline: null, open: false, filled: 0, size: SLATE_SIZE };
	}

	const games = db
		.prepare(
			`SELECT g.*, s.seed,
              sp.side AS card_pick, sp.odds_at AS card_odds_at,
              datetime(g.start) <= datetime('now') OR g.state != 'pre' AS locked,
              hlc.color AS home_logo_color, alc.color AS away_logo_color,
              hlc.halo_on AS home_halo_on, hlc.halo_off AS home_halo_off,
              alc.halo_on AS away_halo_on, alc.halo_off AS away_halo_off
       FROM slate s
       JOIN games g ON g.id = s.game_id
       LEFT JOIN slate_picks sp ON sp.game_id = g.id AND sp.player_id = ?
       LEFT JOIN logo_colors hlc ON hlc.logo = g.home_logo
       LEFT JOIN logo_colors alc ON alc.logo = g.away_logo
       WHERE s.season = ? AND s.week = ?
       ORDER BY s.seed`
		)
		.all(playerId, season, week) as any[];

	const submitted = !!db
		.prepare('SELECT 1 FROM slate_submits WHERE player_id = ? AND season = ? AND week = ?')
		.get(playerId, season, week);

	// One deadline for the whole card, not per game: a card you cannot finish is worse
	// than one you never started, so it closes the moment its first game kicks off.
	const first = db
		.prepare(
			`SELECT MIN(datetime(g.start)) AS d, MIN(datetime(g.start)) <= datetime('now') AS gone
       FROM slate s JOIN games g ON g.id = s.game_id WHERE s.season = ? AND s.week = ?`
		)
		.get(season, week) as { d: string | null; gone: number };

	return {
		games,
		frozen: true,
		submitted,
		deadline: first?.d ?? null,
		open: !submitted && !first?.gone,
		filled: games.filter((g) => g.card_pick).length,
		size: games.length
	};
}
