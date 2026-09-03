// One-shot import of the old SQLite database into Postgres.
//
//   DATABASE_URL=postgres://... node --experimental-strip-types scripts/import-sqlite.ts [path]
//
// Idempotent: every insert is ON CONFLICT DO NOTHING, so running it twice changes
// nothing the second time. Player ids are carried across verbatim so picks, sessions
// and watches keep pointing at the right person — and the identity sequence is bumped
// past them afterwards, or the next sign-up would collide with an imported id.
//
// Safe to run against a live Postgres: it only inserts, never updates or deletes.

import { DatabaseSync } from 'node:sqlite';
import { migrate, pool, run, one } from '../src/lib/server/db.ts';

const path = process.argv[2] ?? 'data/pickem.db';
const src = new DatabaseSync(path, { readOnly: true });
const rows = (sql: string) => src.prepare(sql).all() as Record<string, unknown>[];

// SQLite stored timestamps as 'YYYY-MM-DD HH:MM:SS' in UTC, with no zone marker;
// Postgres needs to be told, or it reads them as local time and shifts everything.
const utc = (v: unknown) => (typeof v === 'string' ? `${v.replace(' ', 'T')}Z` : v);
const bool = (v: unknown) => v === 1 || v === true;

async function main() {
	await migrate();
	const n: Record<string, number> = {};
	const count = async (table: string, sql: string, ...p: unknown[]) => {
		n[table] = (n[table] ?? 0) + (await run(sql, ...p));
	};

	for (const g of rows('SELECT * FROM games'))
		await count('games',
			`INSERT INTO games (id, season, week, start, state, detail,
        home_abbr, home_name, home_logo, home_rank, home_score, home_conf, home_color, home_alt_color,
        away_abbr, away_name, away_logo, away_rank, away_score, away_conf, away_color, away_alt_color,
        spread, ml_home, ml_away, over_under, venue, tv, odds_frozen, updated_at)
       VALUES (?,?,?,?,?,?, ?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?)
       ON CONFLICT (id) DO NOTHING`,
			g.id, g.season, g.week, g.start, g.state, g.detail,
			g.home_abbr, g.home_name, g.home_logo, g.home_rank, g.home_score, g.home_conf, g.home_color, g.home_alt_color,
			g.away_abbr, g.away_name, g.away_logo, g.away_rank, g.away_score, g.away_conf, g.away_color, g.away_alt_color,
			g.spread, g.ml_home, g.ml_away, g.over_under, g.venue, g.tv, bool(g.odds_frozen), utc(g.updated_at));

	for (const p of rows('SELECT * FROM players'))
		await count('players',
			`INSERT INTO players (id, name, pass, google_sub, email, created_at)
       VALUES (?,?,?,?,?,?) ON CONFLICT (id) DO NOTHING`,
			p.id, p.name, p.pass, p.google_sub ?? null, p.email ?? null, utc(p.created_at));

	// Imported ids came in explicitly, so the sequence still starts at 1 and the next
	// sign-up would collide. Push it past the highest id we just wrote.
	await run(
		`SELECT setval(pg_get_serial_sequence('players','id'), GREATEST((SELECT COALESCE(MAX(id),0) FROM players), 1))`
	);

	for (const s of rows('SELECT * FROM sessions'))
		await count('sessions',
			'INSERT INTO sessions (token, player_id, created_at) VALUES (?,?,?) ON CONFLICT (token) DO NOTHING',
			s.token, s.player_id, utc(s.created_at));

	for (const w of rows('SELECT * FROM watches'))
		await count('watches',
			'INSERT INTO watches (player_id, team) VALUES (?,?) ON CONFLICT DO NOTHING',
			w.player_id, w.team);

	for (const k of rows('SELECT * FROM picks'))
		await count('picks',
			`INSERT INTO picks (player_id, game_id, kind, side, spread_at, odds_at, created_at)
       VALUES (?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`,
			k.player_id, k.game_id, k.kind, k.side, k.spread_at, k.odds_at, utc(k.created_at));

	for (const s of rows('SELECT * FROM slate'))
		await count('slate',
			'INSERT INTO slate (season, week, game_id, seed, frozen_at) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING',
			s.season, s.week, s.game_id, s.seed, utc(s.frozen_at));

	for (const s of rows('SELECT * FROM slate_picks'))
		await count('slate_picks',
			'INSERT INTO slate_picks (player_id, game_id, side, odds_at, created_at) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING',
			s.player_id, s.game_id, s.side, s.odds_at, utc(s.created_at));

	for (const s of rows('SELECT * FROM slate_submits'))
		await count('slate_submits',
			'INSERT INTO slate_submits (player_id, season, week, submitted_at) VALUES (?,?,?,?) ON CONFLICT DO NOTHING',
			s.player_id, s.season, s.week, utc(s.submitted_at));

	for (const l of rows('SELECT * FROM logo_colors'))
		await count('logo_colors',
			`INSERT INTO logo_colors (logo, color, bg, halo_on, halo_off, fetched_at)
       VALUES (?,?,?,?,?,?) ON CONFLICT (logo) DO NOTHING`,
			l.logo, l.color, l.bg, bool(l.halo_on), bool(l.halo_off), utc(l.fetched_at));

	console.log(`imported from ${path}:`);
	for (const [t, c] of Object.entries(n)) console.log(`  ${t.padEnd(14)} ${c}`);

	const check = await one<{ players: number; picks: number }>(
		`SELECT (SELECT COUNT(*) FROM players) AS players, (SELECT COUNT(*) FROM picks) AS picks`
	);
	console.log(`postgres now holds ${check?.players} players and ${check?.picks} picks`);
	await pool.end();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
