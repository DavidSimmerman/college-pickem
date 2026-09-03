import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { scrapeWeek } from '$lib/server/espn';
import { confName } from '$lib/conferences';
import type { PageServerLoad } from './$types';

/** Week of the next kickoff, falling back to the latest week we have. */
function currentWeek(): { season: number; week: number } {
	const next = db
		.prepare(`SELECT season, week FROM games WHERE datetime(start) >= datetime('now','-6 hours') ORDER BY start LIMIT 1`)
		.get() as { season: number; week: number } | undefined;
	return (
		next ??
		(db.prepare('SELECT season, week FROM games ORDER BY season DESC, week DESC LIMIT 1').get() as any) ?? {
			season: new Date().getFullYear(),
			week: 1
		}
	);
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.player) redirect(303, '/login');

	const empty = (db.prepare('SELECT COUNT(*) AS n FROM games').get() as { n: number }).n === 0;
	if (empty) await scrapeWeek().catch((e) => console.error('[espn] initial scrape:', e.message));

	const cur = currentWeek();
	const week = Number(url.searchParams.get('week')) || cur.week;
	const season = Number(url.searchParams.get('season')) || cur.season;

	// If this week was never fetched, pull it on demand (lines post gradually).
	const have = (db.prepare('SELECT COUNT(*) AS n FROM games WHERE season=? AND week=?').get(season, week) as {
		n: number;
	}).n;
	if (!have) await scrapeWeek({ season, week }).catch((e) => console.error('[espn] week fetch:', e.message));

	const rows = db
		.prepare(
			`SELECT g.*,
              datetime(g.start) <= datetime('now') OR g.state != 'pre' AS locked,
              sp.side AS spread_pick, ml.side AS ml_pick, ml.odds_at AS ml_odds_at, sp.spread_at,
              hlc.color AS home_logo_color, alc.color AS away_logo_color,
              hlc.halo_on AS home_halo_on, hlc.halo_off AS home_halo_off,
              alc.halo_on AS away_halo_on, alc.halo_off AS away_halo_off
       FROM games g
       LEFT JOIN picks sp ON sp.game_id = g.id AND sp.player_id = ? AND sp.kind = 'spread'
       LEFT JOIN picks ml ON ml.game_id = g.id AND ml.player_id = ? AND ml.kind = 'ml'
       -- last-resort team colour, read out of the logo for schools ESPN files as black
       LEFT JOIN logo_colors hlc ON hlc.logo = g.home_logo
       LEFT JOIN logo_colors alc ON alc.logo = g.away_logo
       WHERE g.season = ? AND g.week = ?
       ORDER BY g.start, g.id`
		)
		.all(locals.player.id, locals.player.id, season, week) as any[];

	const games = rows.map((g) => ({
		...g,
		conf: confName(g.home_conf, g.away_conf),
		top25: Math.min(g.home_rank ?? 99, g.away_rank ?? 99) < 26
	}));

	const weeks = db.prepare('SELECT DISTINCT week FROM games WHERE season = ? ORDER BY week').all(season) as {
		week: number;
	}[];

	const watched = (
		db.prepare('SELECT team FROM watches WHERE player_id = ?').all(locals.player.id) as { team: string }[]
	).map((w) => w.team);

	return { games, week, season, weeks: weeks.map((w) => w.week), current: cur.week, watched };
};
