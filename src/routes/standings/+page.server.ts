import { redirect } from '@sveltejs/kit';
import { all } from '$lib/server/db';
import { gradeSpread, gradeMl, mlPoints, type Side } from '$lib/scoring';
import type { PageServerLoad } from './$types';

type Row = {
	player_id: number; name: string; kind: 'spread' | 'ml'; side: Side;
	spread_at: number | null; odds_at: number | null; spread: number | null;
	home_score: number | null; away_score: number | null;
	week: number; state: string;
	home_abbr: string; away_abbr: string; home_name: string; away_name: string;
	home_logo: string | null; away_logo: string | null;
};

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.player) redirect(303, '/login');

	// Only completed games count. Grading reuses the same functions the UI does.
	const rows = await all<Row>(
		`SELECT pk.player_id, p.name, pk.kind, pk.side, pk.spread_at, pk.odds_at,
              g.spread, g.home_score, g.away_score, g.week, g.state,
              g.home_abbr, g.away_abbr, g.home_name, g.away_name, g.home_logo, g.away_logo
       FROM picks pk
       JOIN players p ON p.id = pk.player_id
       JOIN games g   ON g.id = pk.game_id
       WHERE g.state = 'post' AND g.home_score IS NOT NULL
       ORDER BY g.week, g.start`
	);

	const board = new Map<
		number,
		{ name: string; w: number; l: number; t: number; ml: number; mlW: number; mlL: number; byWeek: Map<number, number> }
	>();
	const ledger: any[] = [];

	for (const r of rows) {
		const e =
			board.get(r.player_id) ??
			board.set(r.player_id, { name: r.name, w: 0, l: 0, t: 0, ml: 0, mlW: 0, mlL: 0, byWeek: new Map() }).get(r.player_id)!;

		if (r.kind === 'spread') {
			const o = gradeSpread(r.side, r.spread_at ?? r.spread, r.home_score, r.away_score);
			if (o === 'win') e.w++;
			else if (o === 'loss') e.l++;
			else if (o === 'push') e.t++;
		} else {
			const o = gradeMl(r.side, r.home_score, r.away_score);
			const pts = mlPoints(o, r.odds_at);
			e.ml += pts;
			if (o === 'win') e.mlW++;
			else if (o === 'loss') e.mlL++;
			e.byWeek.set(r.week, (e.byWeek.get(r.week) ?? 0) + pts);

			if (r.player_id === locals.player!.id) {
				const team = r.side === 'home' ? r.home_name : r.away_name;
				ledger.push({
					team, logo: r.side === 'home' ? r.home_logo : r.away_logo,
					opp: r.side === 'home' ? r.away_abbr : r.home_abbr,
					odds: r.odds_at, pts, outcome: o, week: r.week,
					score: `${Math.max(r.home_score!, r.away_score!)}-${Math.min(r.home_score!, r.away_score!)}`
				});
			}
		}
	}

	// Games of the Week is a straight win/loss record — no odds, no points. Only a
	// submitted board counts, so a half-filled one is worth nothing however good it looks.
	const gotwRows = await all<{ player_id: number; side: Side; home_score: number; away_score: number }>(
		`SELECT sp.player_id, sp.side, g.home_score, g.away_score
       FROM slate_picks sp
       JOIN players p ON p.id = sp.player_id
       JOIN games g   ON g.id = sp.game_id
       JOIN slate s   ON s.game_id = sp.game_id
       JOIN slate_submits sub
         ON sub.player_id = sp.player_id AND sub.season = s.season AND sub.week = s.week
       WHERE g.state = 'post' AND g.home_score IS NOT NULL`
	);

	const cards = new Map<number, { w: number; l: number }>();
	for (const r of gotwRows) {
		const e = cards.get(r.player_id) ?? cards.set(r.player_id, { w: 0, l: 0 }).get(r.player_id)!;
		const o = gradeMl(r.side, r.home_score, r.away_score);
		if (o === 'win') e.w++;
		else if (o === 'loss') e.l++;
	}

	// Games of the Week gets its own board: it is the headline mode, it is win/loss, and
	// folding it into a points column buried it.
	const names = new Map(
		(await all<{ id: number; name: string }>('SELECT id, name FROM players')).map((p) => [p.id, p.name])
	);
	const gotw = [...cards.entries()]
		.map(([id, v]) => ({
			id,
			name: names.get(id) ?? '—',
			w: v.w, l: v.l,
			pct: v.w + v.l ? v.w / (v.w + v.l) : 0
		}))
		.sort((a, b) => b.w - a.w || b.pct - a.pct);

	const players = [...board.entries()]
		.map(([id, v]) => ({
			id, ...v,
			pct: v.w + v.l ? v.w / (v.w + v.l) : 0,
			gotwW: cards.get(id)?.w ?? 0,
			gotwL: cards.get(id)?.l ?? 0,
			byWeek: [...v.byWeek.entries()].sort((a, b) => a[0] - b[0])
		}))
		// Points still order the board; the Games of the Week record breaks ties, since it
		// carries no points of its own.
		.sort((a, b) => b.ml - a.ml || b.gotwW - a.gotwW || b.pct - a.pct);

	return { players, gotw, ledger: ledger.reverse(), me: locals.player.id };
};
