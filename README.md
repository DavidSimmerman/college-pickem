# CFB Pick'em

Weekly college-football pick'em for you and your friends. Three ways to play, scored
independently, all off the same board.

| Mode | What you pick | How it scores |
|---|---|---|
| **Games of the Week** | The winner of ten curated games, straight up | Win / loss. No points. |
| **Spreads** | A side against the line you locked in | Win / loss / push |
| **Moneyline** | A side at the price you locked in | Points, scaled to the odds |

## Games of the Week

Ten games a week, ranked, picked straight up. You have to pick every game that has not
kicked off yet, then submit — an unsubmitted card counts for nothing.

The ranking looks for what a Saturday show would: a close game between two teams worth
watching, weighted toward the power conferences. Quality is carried mostly by the
*weaker* side, so a top-five team against a cupcake never makes it. At least one pure
mid-major game is guaranteed a spot, because the ranking would otherwise never reach
one. Games with no line, or with one side so short it is a foregone conclusion, are left
off entirely — they are not decisions.

The board freezes once for the week and is never recomputed, so a line moving on Friday
cannot reshuffle a card someone already filled in. Each game locks at its own kickoff:
started games grey out, and you can still submit the rest.

## Moneyline scoring

A hit pays the odds; a miss always costs the same. Points are whole numbers.

| You pick | If it hits | If it misses |
|---|---|---|
| `+350` underdog | **+35** | −10 |
| `-110` coin flip | +9 | −10 |
| `-400` favorite | +3 | −10 |

Heavy favorites are punished through the *ratio*, not the penalty: a `-400` favorite
risks 10 points to win 3, so it has to hit 80% of the time just to break even. A side
priced so short that a correct pick pays nothing is not offered at all — it greys out,
and the server refuses it.

Payouts cap at `MAX_WIN` so one lucky longshot cannot decide the season. Every constant
lives in `src/lib/scoring.ts`, which also carries an assert-based self-test:

```sh
node --experimental-strip-types src/lib/scoring.ts
node --experimental-strip-types src/lib/slate.ts
```

## Data

Schedules, spreads, moneylines and final scores come from ESPN's public scoreboard
endpoint — no API key. ESPN **drops the odds block the moment a game kicks off**, so the
poller snapshots each line while the game is still scheduled and freezes it at kickoff;
that frozen row is the closing line. Picks store the line *you* took, so a later move
never re-grades your pick.

The poller self-schedules: every **5 minutes** while anything is live or about to kick,
**hourly** otherwise, and never sleeps past the next kickoff. It runs inside the server
process (`startScraper()` in `src/lib/server/espn.ts`) — no cron, no external scheduler.

Team colours come from ESPN too, which derives them from each school's logo — so a logo
is often painted in exactly the colour it sits on. Every logo is measured once against
the background it will be drawn on; the ones that would disappear get an ink outline
rather than being recoloured. For the handful of schools ESPN files as flat black, the
colour is read out of the logo itself by a small PNG decoder in
`src/lib/server/logo-color.ts`.

## Running locally

```sh
pnpm install
createdb pickem                       # or point DATABASE_URL at any Postgres
cp .env.example .env                  # then fill in DATABASE_URL
pnpm dev                              # http://localhost:5192
```

The schema creates itself on first boot. Coming from the old SQLite build, import it:

```sh
DATABASE_URL=postgres://... node --experimental-strip-types scripts/import-sqlite.ts data/pickem.db
```

That import is idempotent — running it twice changes nothing the second time.

## Signing in

A name plus a passcode (scrypt-hashed), or Google if the server has
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` set. Without them the Google button never
renders and nothing else changes.

Google never merges into an existing account by name or email. To put both on one
account, sign in with your passcode and use **Connect Google** on My Picks.

## Deploying

See [DEPLOY.md](DEPLOY.md) — Coolify, Postgres, and a Cloudflare tunnel.
