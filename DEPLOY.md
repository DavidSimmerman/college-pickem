# Deploying to Coolify behind a Cloudflare tunnel

Seven steps. Do them in order; each one is finished before the next begins.

1. Create the Postgres database in Coolify
2. Create the application, pointed at this repo
3. Set the environment variables
4. Deploy, and confirm the schema created itself
5. Import your old SQLite data (skip if this is a fresh league)
6. Point a Cloudflare tunnel at it
7. Add Google sign-in (optional)

---

## 1. Create the Postgres database

In Coolify: **Project → New Resource → Database → PostgreSQL**. Any recent version; 16
or 17 is what this was built against. Give it a name you will recognise, start it, and
leave it alone — Coolify handles the volume and the backups.

Copy the **internal** connection URL it shows you. It looks like:

```
postgres://postgres:SOMEPASSWORD@zk4s8wg:5432/postgres
```

That hostname is the container's name on Coolify's private network. Use the internal
URL, not the public one — the app runs on the same network, so the database never needs
to be exposed at all.

## 2. Create the application

**New Resource → Application → Public Repository** (or Private, with your GitHub app
connected), pointed at:

```
https://github.com/DavidSimmerman/college-pickem
```

- **Branch**: `main`
- **Build Pack**: `Dockerfile`
- **Port**: `3000`

There is a `Dockerfile` in the repo root; Coolify will find it without configuration.

## 3. Set the environment variables

Under the application's **Environment Variables**:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the internal URL from step 1 |
| `ORIGIN` | your public URL, e.g. `https://pickem.simmerman.cc` |
| `DATABASE_SSL` | `false` |

`ORIGIN` has to match exactly — scheme included, no trailing slash. SvelteKit compares
it against the `Origin` header on every form post, so a mismatch means sign-in silently
fails with a 403 and nothing else looks wrong.

Leave `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` unset for now. Step 7 adds them.

## 4. Deploy

Hit **Deploy** and watch the logs. You are looking for two lines:

```
[db] schema ready
Listening on http://0.0.0.0:3000
```

The schema creates itself on first boot — there is no migration step to run. A minute
or so later the scraper reports in:

```
[espn] wk1 99 games, 91 priced
```

If the database URL is wrong, the container exits immediately with `DATABASE_URL is not
set` or a connection error, rather than starting and failing later.

## 5. Import your old data

Only if you are moving an existing league across. From this machine, with the SQLite
file in hand and the Postgres URL reachable:

```sh
DATABASE_URL='postgres://...' \
  node --experimental-strip-types scripts/import-sqlite.ts data/pickem.db
```

It prints a row count per table. Every insert is `ON CONFLICT DO NOTHING`, so running it
twice is harmless, and it only ever inserts — it cannot overwrite or delete anything
already in Postgres.

If Coolify's Postgres is not reachable from outside, run it from a terminal inside the
app container instead (**Coolify → application → Terminal**), after uploading the
`.db` file there.

## 6. Point the Cloudflare tunnel at it

In **Cloudflare Zero Trust → Networks → Tunnels**, either use your existing tunnel or
create one. Add a public hostname:

| Field | Value |
|---|---|
| Subdomain | `pickem` |
| Domain | your domain |
| Service type | `HTTP` |
| URL | the app's internal address, e.g. `http://college-pickem:3000` |

Use the container name and internal port, the same way the database URL does. The app
never needs a published port on the host, and nothing has to be opened on your router.

If `cloudflared` runs on the host rather than in Coolify's network, point it at
`http://localhost:<the port Coolify published>` instead — Coolify shows that port on the
application page.

Whatever hostname you choose here has to equal `ORIGIN` from step 3.

## 7. Google sign-in (optional)

At <https://console.cloud.google.com/apis/credentials>:

1. **Create Credentials → OAuth client ID → Web application**
2. Under **Authorised redirect URIs**, add exactly:
   `https://YOUR-DOMAIN/auth/google/callback`
3. Copy the client ID and secret into Coolify as `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`, then redeploy.

The button appears once both are set. If either is missing it stays hidden and the
passcode form is unaffected, so a half-finished setup cannot break sign-in.

Existing accounts: sign in with your passcode first, then use **Connect Google** on My
Picks. Google will not merge into an account by name or email on its own — that is
deliberate, since a display name is not proof of anything.

---

## Notes

**Backups.** Coolify backs up the Postgres resource on whatever schedule you set under
the database's **Backups** tab. Nothing in the application container is worth keeping;
it can be rebuilt from the repo at any time.

**Updating.** Push to `main`. If you enabled automatic deployments Coolify redeploys on
its own; otherwise hit Deploy. The schema statements are all `IF NOT EXISTS`, so a
redeploy against a populated database is a no-op.

**Scaling.** The ESPN poller runs inside the server process, so run exactly one
instance. Two containers would poll ESPN twice and race each other on writes. For a
friend-group league one container is comfortably enough.
