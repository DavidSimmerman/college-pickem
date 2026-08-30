# CFB Pick'em

Weekly college-football pick'em for you and your friends. Two independent picks per game:

- **Spread** — straight win / loss / push against the line you locked in.
- **Moneyline** — optional, and scored off the price so the payout scales with the upset.

## Moneyline scoring

Points come straight from the American odds:

| You pick | If it hits | If it misses |
|---|---|---|
| `+350` underdog | **+3.50** | −0.29 |
| `-110` coin flip | +0.91 | −1.10 |
| `-400` favorite | +0.25 | **−4.00** |

Rule: pick a favorite at `-X` → win `100/X`, lose `X/100`. Pick a dog at `+Y` → win `Y/100`, lose `100/Y`.
Chasing upsets is cheap; blowing a heavy favorite hurts.

Payouts are clamped to `+25` / `−10` (`MAX_WIN` / `MAX_LOSS` in `src/lib/scoring.ts`) so a single
`-20000` cupcake game can't erase a season. The caps only bite outside roughly `-1000` / `+2500`.

## Data

Schedules, spreads, moneylines and final scores come from ESPN's public scoreboard endpoint —
no API key. ESPN **drops the odds block the moment a game kicks off**, so the poller snapshots
each line while the game is still scheduled and freezes it at kickoff; that frozen row is the
closing line. Picks store the line *you* took, so a later line move never re-grades your pick.

The poller self-schedules: every **5 minutes** while anything is live or about to kick, **hourly**
otherwise. It runs inside the server process (`startScraper()` in `src/lib/server/espn.ts`) —
no cron, no external scheduler.

## Running

```sh
pnpm install
pnpm dev          # http://localhost:5192
pnpm test         # scoring self-test + end-to-end browser checks
```

SQLite lives at `data/pickem.db` via Node's built-in `node:sqlite` — no database server, no ORM.
Sign-in is a name plus a passcode (scrypt-hashed); an unknown name signs you up.

Picks lock at kickoff, enforced server-side in `src/routes/api/pick/+server.ts` — the client
can't bypass it.
