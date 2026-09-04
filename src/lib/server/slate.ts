// Freezing and reading Games of the Week. The ranking itself lives in $lib/slate; this
// module is only about when a week's slate becomes real and who may still change it.

import { all, one, run } from './db.ts';
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
	size: number; // how many games are on the board
	needed: number; // how many you can still be judged on — size minus the ones missed
};

/**
 * Lines post gradually through the week, so a card frozen on Tuesday off three priced
 * games would be junk that nobody could unfreeze. We hold off until a full slate's worth
 * of games are actually pickable, then freeze once and never look again.
 */
async function freezeIfReady(season: number, week: number): Promise<boolean> {
	const already = await one<{ n: number }>(
		'SELECT COUNT(*) AS n FROM slate WHERE season = ? AND week = ?', season, week);
	if (already && already.n > 0) return true;

	const rows = await all<SlateGame>(
		`SELECT id, spread, ml_home, ml_away, home_rank, away_rank, home_conf, away_conf
       FROM games WHERE season = ? AND week = ?`,
		season, week
	);

	const picked = buildSlate(rows);
	if (picked.length < SLATE_SIZE) return false; // not enough priced games yet

	for (const [i, g] of picked.entries())
		await run(
			'INSERT INTO slate (season, week, game_id, seed) VALUES (?,?,?,?) ON CONFLICT DO NOTHING',
			season, week, g.id, i + 1
		);
	console.log(`[slate] froze ${picked.length} games for ${season} wk${week}`);
	return true;
}

/** One week's Games of the Week from one player's point of view. */
export async function getSlate(playerId: number, season: number, week: number): Promise<SlateState> {
	const frozen = await freezeIfReady(season, week);
	if (!frozen) {
		return {
			games: [], frozen: false, submitted: false, deadline: null,
			open: false, filled: 0, openLeft: 0, missed: 0, size: SLATE_SIZE, needed: SLATE_SIZE
		};
	}

	const games = await all<any>(
		`SELECT g.*, s.seed,
              sp.side AS slate_pick, sp.odds_at AS slate_odds_at,
              (g.start <= now() OR g.state <> 'pre') AS locked,
              hlc.color AS home_logo_color, alc.color AS away_logo_color,
              hlc.halo_on AS home_halo_on, hlc.halo_off AS home_halo_off,
              alc.halo_on AS away_halo_on, alc.halo_off AS away_halo_off
       FROM slate s
       JOIN games g ON g.id = s.game_id
       LEFT JOIN slate_picks sp ON sp.game_id = g.id AND sp.player_id = ?
       LEFT JOIN logo_colors hlc ON hlc.logo = g.home_logo
       LEFT JOIN logo_colors alc ON alc.logo = g.away_logo
       WHERE s.season = ? AND s.week = ?
       ORDER BY s.seed`,
		playerId, season, week
	);

	const submitted = !!(await one(
		'SELECT 1 FROM slate_submits WHERE player_id = ? AND season = ? AND week = ?',
		playerId, season, week
	));

	// Each game locks at its own kickoff rather than the whole board locking at the
	// first one. So the card stays open all week: started games grey out, and what you
	// still owe is a pick on every game that has not kicked off yet.
	const first = await one<{ d: Date | null }>(
		`SELECT MIN(g.start) AS d
       FROM slate s JOIN games g ON g.id = s.game_id WHERE s.season = ? AND s.week = ?`,
		season, week
	);

	// A game that kicked off with no pick on it is out of reach, so it stops counting
	// toward the card. The denominator shrinks with it — a board where one game got
	// away is out of nine, not a permanent nine out of ten.
	const missed = games.filter((g) => !g.slate_pick && g.locked).length;

	return {
		games,
		frozen: true,
		submitted,
		deadline: first?.d ? first.d.toISOString() : null,
		open: !submitted,
		filled: games.filter((g) => g.slate_pick).length,
		openLeft: games.filter((g) => !g.slate_pick && !g.locked).length,
		missed,
		size: games.length,
		needed: games.length - missed
	};
}
