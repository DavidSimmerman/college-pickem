// Freezing and reading Games of the Week. The ranking itself lives in $lib/slate; this
// module is only about when a week's slate becomes real and who may still change it.

import { db } from './db';
import { buildSlate, SLATE_SIZE, type SlateGame } from '$lib/slate';

export type SlateState = {
	games: any[];
	frozen: boolean;
	submitted: boolean;
	deadline: string | null; // first kickoff on the board
	open: boolean; // still accepting picks and a submission
	filled: number; // games with a pick, of any kind
	openLeft: number; // games still pickable that have no pick — these block submitting
	missed: number; // games that kicked off before you got to them
	size: number;
};

/**
 * Lines post gradually through the week, so a card frozen on Tuesday off three priced
 * games would be junk that nobody could unfreeze. We hold off until a full slate's worth
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

/** One week's Games of the Week from one player's point of view. */
export function getSlate(playerId: number, season: number, week: number): SlateState {
	const frozen = freezeIfReady(season, week);
	if (!frozen) {
		return {
			games: [], frozen: false, submitted: false, deadline: null,
			open: false, filled: 0, openLeft: 0, missed: 0, size: SLATE_SIZE
		};
	}

	const games = db
		.prepare(
			`SELECT g.*, s.seed,
              sp.side AS slate_pick, sp.odds_at AS slate_odds_at,
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

	// Each game locks at its own kickoff rather than the whole board locking at the
	// first one. So the card stays open all week: started games grey out, and what you
	// still owe is a pick on every game that has not kicked off yet.
	const first = db
		.prepare(
			`SELECT MIN(datetime(g.start)) AS d
       FROM slate s JOIN games g ON g.id = s.game_id WHERE s.season = ? AND s.week = ?`
		)
		.get(season, week) as { d: string | null };

	return {
		games,
		frozen: true,
		submitted,
		deadline: first?.d ?? null,
		open: !submitted,
		filled: games.filter((g) => g.slate_pick).length,
		openLeft: games.filter((g) => !g.slate_pick && !g.locked).length,
		missed: games.filter((g) => !g.slate_pick && g.locked).length,
		size: games.length
	};
}
