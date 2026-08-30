import { db } from './db';

const API = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard';

/** Missing/blank must be null, never 0 — `Number('')` is 0 and would fake a pick'em line. */
const num = (v: unknown): number | null => {
	if (v === null || v === undefined || v === '') return null;
	const n = Number(String(v).replace('+', ''));
	return Number.isFinite(n) ? n : null;
};

/** American odds are never 0; treat that as "no price". */
const odds = (v: unknown): number | null => num(v) || null;

export type WeekRef = { season: number; week: number };

/**
 * ESPN drops the odds block the moment a game kicks off, so a line is only ever
 * readable while the game is still `pre`. We snapshot it on every poll and freeze
 * it at kickoff — that frozen row is the closing line.
 */
export async function scrapeWeek(ref?: WeekRef): Promise<{ ref: WeekRef; games: number; priced: number }> {
	const qs = new URLSearchParams({ groups: '80', limit: '400' });
	if (ref) qs.set('year', String(ref.season)), qs.set('seasontype', '2'), qs.set('week', String(ref.week));

	const res = await fetch(`${API}?${qs}`, { signal: AbortSignal.timeout(20_000) });
	if (!res.ok) throw new Error(`ESPN ${res.status} ${res.statusText}`);
	const data = (await res.json()) as any;

	const season: number = data?.season?.year ?? ref?.season ?? new Date().getFullYear();
	const week: number = data?.week?.number ?? ref?.week ?? 1;
	const events: any[] = Array.isArray(data?.events) ? data.events : [];

	const upsert = db.prepare(`
    INSERT INTO games (id, season, week, start, state, detail,
      home_abbr, home_name, home_logo, home_rank, home_score,
      away_abbr, away_name, away_logo, away_rank, away_score,
      spread, ml_home, ml_away, over_under, venue, tv, odds_frozen, updated_at)
    VALUES (?,?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?,?,?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      start=excluded.start, state=excluded.state, detail=excluded.detail,
      home_rank=excluded.home_rank, home_score=excluded.home_score,
      away_rank=excluded.away_rank, away_score=excluded.away_score,
      tv=excluded.tv, updated_at=datetime('now'),
      -- only overwrite the price while the game has not started
      spread     = CASE WHEN games.odds_frozen = 1 THEN games.spread     ELSE COALESCE(excluded.spread, games.spread) END,
      ml_home    = CASE WHEN games.odds_frozen = 1 THEN games.ml_home    ELSE COALESCE(excluded.ml_home, games.ml_home) END,
      ml_away    = CASE WHEN games.odds_frozen = 1 THEN games.ml_away    ELSE COALESCE(excluded.ml_away, games.ml_away) END,
      over_under = CASE WHEN games.odds_frozen = 1 THEN games.over_under ELSE COALESCE(excluded.over_under, games.over_under) END,
      odds_frozen = MAX(games.odds_frozen, excluded.odds_frozen)
  `);

	let priced = 0;
	for (const e of events) {
		const c = e?.competitions?.[0];
		if (!c) continue;
		const side = (s: string) => c.competitors?.find((x: any) => x.homeAway === s);
		const home = side('home'),
			away = side('away');
		if (!home || !away) continue;

		const state: string = c.status?.type?.state ?? 'pre';
		const live = state !== 'pre';
		const o = c.odds?.[0];
		const spread = num(o?.spread);
		const mlH = odds(o?.moneyline?.home?.close?.odds ?? o?.moneyline?.home?.open?.odds);
		const mlA = odds(o?.moneyline?.away?.close?.odds ?? o?.moneyline?.away?.open?.odds);
		if (spread !== null || mlH !== null) priced++;

		const team = (t: any) => [
			t.team?.abbreviation ?? '?',
			t.team?.shortDisplayName ?? t.team?.displayName ?? '?',
			t.team?.logo ?? null,
			t.curatedRank?.current ?? 99,
			live ? num(t.score) : null
		];

		upsert.run(
			String(e.id), season, week, String(e.date), state, c.status?.type?.shortDetail ?? null,
			...team(home), ...team(away),
			spread, mlH, mlA, num(o?.overUnder),
			c.venue?.fullName ?? null, c.broadcasts?.[0]?.names?.[0] ?? null,
			live ? 1 : 0
		);
	}
	return { ref: { season, week }, games: events.length, priced };
}

/** Any game currently in progress, or kicking off within the next 15 minutes. */
export function gamesLive(): boolean {
	const r = db
		.prepare(
			`SELECT COUNT(*) AS n FROM games
       WHERE state = 'in'
          OR (state = 'pre' AND datetime(start) BETWEEN datetime('now') AND datetime('now','+15 minutes'))`
		)
		.get() as { n: number };
	return r.n > 0;
}

let timer: NodeJS.Timeout | null = null;

/**
 * Self-scheduling poller: every 5 min while anything is live, hourly otherwise.
 * ponytail: a setTimeout in the server process, not a systemd timer or a cron dep.
 */
export function startScraper() {
	if (timer) return;
	const tick = async () => {
		try {
			const r = await scrapeWeek();
			console.log(`[espn] wk${r.ref.week} ${r.games} games, ${r.priced} priced`);
		} catch (err) {
			console.error('[espn] scrape failed:', (err as Error).message); // keep polling; transient
		}
		const live = gamesLive();
		timer = setTimeout(tick, (live ? 5 : 60) * 60_000);
		(timer as any).unref?.();
	};
	tick();
}
