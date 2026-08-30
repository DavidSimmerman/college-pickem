import { DatabaseSync } from 'node:sqlite'; // ponytail: stdlib. no ORM, no Postgres.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';

mkdirSync('data', { recursive: true });
export const db = new DatabaseSync('data/pickem.db');
// busy_timeout matters: the background scraper writes while requests do, and
// without it a concurrent write fails outright instead of waiting its turn.
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS players (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS games (
  id          TEXT PRIMARY KEY,
  season      INTEGER NOT NULL,
  week        INTEGER NOT NULL,
  start       TEXT NOT NULL,
  state       TEXT NOT NULL,          -- pre | in | post
  detail      TEXT,
  home_abbr   TEXT, home_name TEXT, home_logo TEXT, home_rank INTEGER, home_score INTEGER,
  away_abbr   TEXT, away_name TEXT, away_logo TEXT, away_rank INTEGER, away_score INTEGER,
  spread      REAL, ml_home INTEGER, ml_away INTEGER, over_under REAL,
  venue       TEXT, tv TEXT,
  odds_frozen INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS games_week ON games(season, week, start);
CREATE TABLE IF NOT EXISTS picks (
  player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  game_id    TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('spread','ml')),
  side       TEXT NOT NULL CHECK (side IN ('home','away')),
  spread_at  REAL,      -- line locked in at pick time
  odds_at    INTEGER,   -- price locked in at pick time
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (player_id, game_id, kind)
);
`);

/* ---------- auth (scrypt + opaque session tokens; both stdlib) ---------- */

export function hashPass(pass: string): string {
	const salt = randomBytes(16);
	return `${salt.toString('hex')}:${scryptSync(pass, salt, 64).toString('hex')}`;
}

export function verifyPass(pass: string, stored: string): boolean {
	const [saltHex, keyHex] = stored.split(':');
	if (!saltHex || !keyHex) return false;
	const key = Buffer.from(keyHex, 'hex');
	const test = scryptSync(pass, Buffer.from(saltHex, 'hex'), key.length);
	return timingSafeEqual(key, test);
}

export function createSession(playerId: number): string {
	const token = randomBytes(32).toString('base64url');
	db.prepare('INSERT INTO sessions (token, player_id) VALUES (?, ?)').run(token, playerId);
	return token;
}

export function playerForToken(token: string | undefined) {
	if (!token) return null;
	return (db
		.prepare(
			'SELECT p.id, p.name FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.token = ?'
		)
		.get(token) ?? null) as { id: number; name: string } | null;
}

export const dropSession = (token: string) =>
	db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
