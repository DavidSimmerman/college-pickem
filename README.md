# CFB Pick'em

Weekly college-football pick'em for you and your friends. Two independent picks per game:

- **Spread** — straight win / loss / push against the line you locked in.
- **Moneyline** — optional, and scored off the price so the payout scales with the upset.

## Moneyline scoring

A hit pays the odds; a miss always costs exactly **one point**.

| You pick | If it hits | If it misses |
|---|---|---|
| `+350` underdog | **+3.50** | −1.00 |
| `-110` coin flip | +0.91 | −1.00 |
| `-400` favorite | +0.25 | −1.00 |

Heavy favorites are punished through the *ratio*, not the penalty: a `-400` favorite
risks a full point to win 0.25, so it has to hit 80% of the time just to break even.

**Why the loss is flat.** The obvious rule — pay `b` on a hit, charge `1/b` on a miss, so
blowing a `-400` favorite costs 4.00 — makes every underdog strictly +EV. The dominant
strategy becomes "take every longshot on the board every week," and the leaderboard measures
pick volume instead of skill. Requiring a pick to break even against a fair line,
`EV = p·b − (1−p)·L = 0` with `b = (1−p)/p`, forces `L = 1` uniquely: keeping the upset
payouts means the loss *must* be flat.

Verified against 2,316 real games with real closing lines (2023–25). Every no-skill
strategy lands at or below zero points per pick; only beating the market pays:

| Strategy | Picks | Hit% | Points/pick |
|---|---|---|---|
| every underdog | 2316 | 25.6% | −0.167 |
| dogs +500 or longer | 612 | 5.6% | −0.469 |
| every favorite | 2316 | 74.4% | −0.023 |
| heavy favs −500 or worse | 837 | 91.6% | −0.004 |
| always home | 2316 | 60.6% | −0.022 |
| random | 2316 | 50.3% | −0.085 |
| **beats the market by 3%** | 2316 | 67.6% | **+0.014** |

Payouts cap at `MAX_WIN` (15) so one lucky `+5000` cupcake can't decide the season.
Both constants live in `src/lib/scoring.ts`.

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
