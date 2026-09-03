import { all, one, run, migrate } from './db.ts';
import { dominantColor, visibleFraction } from './logo-color.ts';
import { hasHue, teamBg, teamTint } from '$lib/colors';

// Share of a logo's solid pixels that must read against its background before we leave
// it bare. Below this the mark is painted in the colour behind it and needs an outline.
const HALO_BELOW = 0.35;

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

	const UPSERT = `
    INSERT INTO games (id, season, week, start, state, detail,
      home_abbr, home_name, home_logo, home_rank, home_score, home_conf, home_color, home_alt_color,
      away_abbr, away_name, away_logo, away_rank, away_score, away_conf, away_color, away_alt_color,
      spread, ml_home, ml_away, over_under, venue, tv, odds_frozen, updated_at)
    VALUES (?,?,?,?,?,?, ?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?, now())
    ON CONFLICT(id) DO UPDATE SET
      start=excluded.start, state=excluded.state, detail=excluded.detail,
      home_rank=excluded.home_rank, home_score=excluded.home_score,
      away_rank=excluded.away_rank, away_score=excluded.away_score,
      home_conf=excluded.home_conf, away_conf=excluded.away_conf,
      home_color=excluded.home_color, away_color=excluded.away_color,
      home_alt_color=excluded.home_alt_color, away_alt_color=excluded.away_alt_color,
      tv=excluded.tv, updated_at=now(),
      -- only overwrite the price while the game has not started
      spread     = CASE WHEN games.odds_frozen THEN games.spread     ELSE COALESCE(excluded.spread, games.spread) END,
      ml_home    = CASE WHEN games.odds_frozen THEN games.ml_home    ELSE COALESCE(excluded.ml_home, games.ml_home) END,
      ml_away    = CASE WHEN games.odds_frozen THEN games.ml_away    ELSE COALESCE(excluded.ml_away, games.ml_away) END,
      over_under = CASE WHEN games.odds_frozen THEN games.over_under ELSE COALESCE(excluded.over_under, games.over_under) END,
      -- once frozen, always frozen: SQLite's MAX() over 0/1 is OR over booleans here
      odds_frozen = games.odds_frozen OR excluded.odds_frozen
  `;

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
			live ? num(t.score) : null,
			num(t.team?.conferenceId),
			t.team?.color ? `#${t.team.color}` : null,
			t.team?.alternateColor ? `#${t.team.alternateColor}` : null
		];

		await run(
			UPSERT,
			String(e.id), season, week, String(e.date), state, c.status?.type?.shortDetail ?? null,
			...team(home), ...team(away),
			spread, mlH, mlA, num(o?.overUnder),
			c.venue?.fullName ?? null, c.broadcasts?.[0]?.names?.[0] ?? null,
			live
		);
	}
	await backfillLogoColors();
	return { ref: { season, week }, games: events.length, priced };
}

/**
 * Work out, once per team, how its logo should be drawn. Two things come out of the
 * same download: a colour for the schools ESPN files as flat #000000, and whether the
 * logo needs an outline to read on the colour it gets painted on — many do, because
 * ESPN derives a team's colour from its own logo. The logo itself is never recoloured.
 */
async function backfillLogoColors(): Promise<void> {
	const rows = await all<{ logo: string; color: string | null; alt: string | null }>(
		`SELECT DISTINCT logo, color, alt FROM (
         SELECT home_logo AS logo, home_color AS color, home_alt_color AS alt FROM games
         UNION SELECT away_logo, away_color, away_alt_color FROM games) t
       WHERE logo IS NOT NULL`
	);

	const cached = new Map(
		(
			await all<{ logo: string; color: string | null; bg: string | null }>(
				'SELECT logo, color, bg FROM logo_colors'
			)
		).map((r) => [r.logo, r])
	);
	// Postgres has no INSERT OR REPLACE; the primary key drives an upsert instead.
	const SAVE = `INSERT INTO logo_colors (logo, color, bg, halo_on, halo_off) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (logo) DO UPDATE SET
                  color = excluded.color, bg = excluded.bg,
                  halo_on = excluded.halo_on, halo_off = excluded.halo_off,
                  fetched_at = now()`;

	let done = 0;
	let haloed = 0;
	for (const r of rows) {
		// A team's colours barely ever change, so only re-measure when they do.
		const prev = cached.get(r.logo);
		if (prev && prev.bg === teamBg(r.color, r.alt, prev.color)) continue;
		try {
			const res = await fetch(r.logo);
			if (!res.ok) continue; // transient: stay uncached so the next scrape retries
			const png = Buffer.from(await res.arrayBuffer());
			const derived = hasHue(r.color) || hasHue(r.alt) ? null : dominantColor(png);
			const bg = teamBg(r.color, r.alt, derived);
			const on = visibleFraction(png, bg) < HALO_BELOW;
			const off = visibleFraction(png, teamTint(bg)) < HALO_BELOW;
			await run(SAVE, r.logo, derived, bg, on, off);
			done++;
			if (on) haloed++;
		} catch {
			// a failed fetch should not poison the cache
		}
	}
	if (done) console.log(`[espn] measured ${done} logo(s); ${haloed} need an outline when picked`);
}

/** Any game currently in progress, or kicking off within the next 15 minutes. */
export async function gamesLive(): Promise<boolean> {
	const r = await one<{ n: number }>(
		`SELECT COUNT(*) AS n FROM games
       WHERE state = 'in'
          OR (state = 'pre' AND start BETWEEN now() AND now() + interval '15 minutes')`
	);
	return (r?.n ?? 0) > 0;
}

/** Seconds until the next kickoff, or null if nothing is scheduled. */
export async function secondsToNextKickoff(): Promise<number | null> {
	const r = await one<{ s: number | null }>(
		`SELECT CAST(EXTRACT(EPOCH FROM (MIN(start) - now())) AS INTEGER) AS s
       FROM games WHERE state = 'pre' AND start > now()`
	);
	return r?.s ?? null;
}

// Module state resets on every dev-server reload but the process does not, so the
// live timer is parked on globalThis: adopt-and-replace instead of stacking pollers.
const RUNNING = Symbol.for('cfb-pickem.scraper');
const g = globalThis as any;

/**
 * Self-scheduling poller: every 5 min while anything is live, hourly otherwise.
 * ponytail: a setTimeout in the server process, not a systemd timer or a cron dep.
 */
export function startScraper() {
	if (g[RUNNING]) clearTimeout(g[RUNNING]); // drop the previous module's poller
	const tick = async () => {
		try {
			await migrate(); // first thing the process does: make sure the schema is there
			const r = await scrapeWeek();
			console.log(`[espn] wk${r.ref.week} ${r.games} games, ${r.priced} priced`);
		} catch (err) {
			console.error('[espn] scrape failed:', (err as Error).message); // keep polling; transient
		}
		// 5 min while anything is live, hourly otherwise — but never sleep past the
		// next kickoff, or we would freeze a line up to an hour stale as the closing one.
		let mins = (await gamesLive()) ? 5 : 60;
		const toKick = await secondsToNextKickoff();
		if (toKick !== null) mins = Math.min(mins, Math.max(1, (toKick - 10 * 60) / 60));
		g[RUNNING] = setTimeout(tick, mins * 60_000);
		g[RUNNING].unref?.();
	};
	tick();
}
