import { redirect } from '@sveltejs/kit';
import { all, one } from '$lib/server/db';
import { gradeSpread, gradeMl, spPoints, lineOn, type Side, type Outcome } from '$lib/scoring';
import { configured } from '$lib/server/google';
import type { PageServerLoad } from './$types';

type Tally = { w: number; l: number; t: number; pts: number };
const empty = (): Tally => ({ w: 0, l: 0, t: 0, pts: 0 });
const record = (t: Tally, o: Outcome) => {
	if (o === 'win') t.w++;
	else if (o === 'loss') t.l++;
	else if (o === 'push') t.t++;
};

type Row = {
	kind: 'spread' | 'ml';
	side: Side;
	spread_at: number | null;
	odds_at: number | null;
	week: number;
	spread: number | null;
	state: string;
	start: string | Date;
	home_score: number | null;
	away_score: number | null;
	home_abbr: string; away_abbr: string;
	home_name: string; away_name: string;
	home_logo: string | null; away_logo: string | null;
};

type SlateRow = Omit<Row, 'kind' | 'spread_at' | 'odds_at'> & { odds_at: number | null; seed: number };

/** Every graded outcome for one player, split by mode. Ungraded games are skipped. */
function tallies(rows: Row[], slateRows: SlateRow[]) {
	const spread = empty(), ml = empty(), gotw = empty();
	for (const r of rows) {
		if (r.state !== 'post' || r.home_score === null) continue;
		if (r.kind === 'spread') {
			record(spread, gradeSpread(r.side, r.spread_at ?? r.spread, r.home_score, r.away_score));
		} else {
			const o = gradeMl(r.side, r.home_score, r.away_score);
			record(ml, o);
			ml.pts += spPoints(o, lineOn(r.spread_at, r.side));
		}
	}
	for (const r of slateRows) {
		if (r.state !== 'post' || r.home_score === null) continue;
		record(gotw, gradeMl(r.side, r.home_score, r.away_score));
	}
	return { spread, ml, gotw };
}

const GAME_COLS = `g.week, g.spread, g.state, g.start, g.home_score, g.away_score,
   g.home_abbr, g.away_abbr, g.home_name, g.away_name, g.home_logo, g.away_logo`;

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.player) redirect(303, '/login');
	const me = locals.player.id;

	const latest = await one<{ season: number; week: number }>(
		'SELECT season, week FROM games ORDER BY season DESC, week DESC LIMIT 1');
	const season = Number(url.searchParams.get('season')) || latest?.season || new Date().getFullYear();
	const week = Number(url.searchParams.get('week')) || latest?.week || 1;

	const picksFor = (w: number | null) =>
		all<Row>(
			`SELECT pk.kind, pk.side, pk.spread_at, pk.odds_at, ${GAME_COLS}
         FROM picks pk JOIN games g ON g.id = pk.game_id
         WHERE pk.player_id = ? AND g.season = ?${w === null ? '' : ' AND g.week = ?'}
         ORDER BY g.start, g.id`,
			...(w === null ? [me, season] : [me, season, w])
		);

	// Only a submitted board counts, here as everywhere else.
	const slateFor = (w: number | null) =>
		all<SlateRow>(
			`SELECT sp.side, sp.odds_at, s.seed, ${GAME_COLS}
         FROM slate_picks sp
         JOIN games g ON g.id = sp.game_id
         JOIN slate s ON s.game_id = sp.game_id
         JOIN slate_submits sub
           ON sub.player_id = sp.player_id AND sub.season = s.season AND sub.week = s.week
         WHERE sp.player_id = ? AND s.season = ?${w === null ? '' : ' AND s.week = ?'}
         ORDER BY s.week, s.seed`,
			...(w === null ? [me, season] : [me, season, w])
		);

	const [weekPicks, weekSlate, allPicks, allSlate] = await Promise.all([
		picksFor(week), slateFor(week), picksFor(null), slateFor(null)
	]);

	// A pick the player can still see the shape of before it grades.
	const shape = (r: Row | SlateRow, kind: string, seed?: number) => {
		const graded = r.state === 'post' && r.home_score !== null;
		const side = r.side;
		const o: Outcome = !graded
			? 'pending'
			: kind === 'spread'
				? gradeSpread(side, (r as Row).spread_at ?? r.spread, r.home_score, r.away_score)
				: gradeMl(side, r.home_score, r.away_score);
		// Slate rows carry no locked line of their own, so they fall back to the game's.
		const line = (r as Row).spread_at ?? r.spread;
		return {
			kind, seed, side,
			start: r.start instanceof Date ? r.start.toISOString() : r.start,
			state: r.state,
			team: side === 'home' ? r.home_name : r.away_name,
			abbr: side === 'home' ? r.home_abbr : r.away_abbr,
			logo: side === 'home' ? r.home_logo : r.away_logo,
			opp: side === 'home' ? r.away_abbr : r.home_abbr,
			line,
			odds: r.odds_at,
			outcome: o,
			pts: kind === 'ml' ? spPoints(o, lineOn(line, side)) : null,
			// Your team's score first: this page is about your pick, not about the venue.
			score: graded
				? side === 'home'
					? `${r.home_score}-${r.away_score}`
					: `${r.away_score}-${r.home_score}`
				: null
		};
	};

	const linked = !!(await one<{ google_sub: string | null }>(
		'SELECT google_sub FROM players WHERE id = ?', me))?.google_sub;

	return {
		season,
		week,
		google: { available: configured(), linked },
		weeks: (
			await all<{ week: number }>('SELECT DISTINCT week FROM games WHERE season = ? ORDER BY week', season)
		).map((w) => w.week),
		picks: [
			...weekPicks.filter((r) => r.kind === 'spread').map((r) => shape(r, 'spread')),
			...weekPicks.filter((r) => r.kind === 'ml').map((r) => shape(r, 'ml')),
			...weekSlate.map((r) => shape(r, 'gotw', r.seed))
		],
		thisWeek: tallies(weekPicks, weekSlate),
		season_: tallies(allPicks, allSlate)
	};
};
