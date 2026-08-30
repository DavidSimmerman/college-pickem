import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
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

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.player) redirect(303, '/login');

	// Only completed games count. Grading reuses the same functions the UI does.
	const rows = db
		.prepare(
			`SELECT pk.player_id, p.name, pk.kind, pk.side, pk.spread_at, pk.odds_at,
              g.spread, g.home_score, g.away_score, g.week, g.state,
              g.home_abbr, g.away_abbr, g.home_name, g.away_name, g.home_logo, g.away_logo
       FROM picks pk
       JOIN players p ON p.id = pk.player_id
       JOIN games g   ON g.id = pk.game_id
       WHERE g.state = 'post' AND g.home_score IS NOT NULL
       ORDER BY g.week, g.start`
		)
		.all() as Row[];

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

	const players = [...board.entries()]
		.map(([id, v]) => ({
			id, ...v,
			pct: v.w + v.l ? v.w / (v.w + v.l) : 0,
			byWeek: [...v.byWeek.entries()].sort((a, b) => a[0] - b[0])
		}))
		.sort((a, b) => b.ml - a.ml || b.pct - a.pct);

	return { players, ledger: ledger.reverse(), me: locals.player.id };
};
