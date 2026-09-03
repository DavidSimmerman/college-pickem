# Deploying to Coolify behind a Cloudflare tunnel

Six steps. Do them in order; each one is finished before the next begins.

1. Create the Postgres database in Coolify
2. Create the application, pointed at this repo
3. Set the environment variables
4. Deploy, and watch it fill itself in
5. Point a Cloudflare tunnel at it
6. Add Google sign-in (optional)

There is nothing to seed and nothing to migrate. The schema creates itself on first
boot and the poller pulls the current week from ESPN a moment later.

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
it against the `Origin` header on every form post, so a mismatch means sign-in fails
with a 403 while everything else looks fine.

Leave `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` unset for now. Step 6 adds them.

## 4. Deploy

Hit **Deploy** and watch the logs. Four lines, in this order:

```
[db] schema ready
Listening on http://0.0.0.0:3000
[espn] wk1 99 games, 91 priced
[espn] measured 186 logo(s); 81 need an outline when picked
```

The first two arrive immediately. The third is the poller's first pass at ESPN. The
fourth takes a minute or two — it downloads each team's logo once to work out how to
draw it, then never fetches it again.

The Games of the Week board is chosen the first time somebody signed in loads the page,
once ten games have a moneyline — not during the scrape. So on a brand new deployment
the first person to create an account is also the one who sets the week's board. Before
that the tab says the week's games are not set yet, which is the correct thing for it to
say.

A wrong database URL fails loudly and immediately: the container exits with
`DATABASE_URL is not set` or a connection error rather than starting and misbehaving
later.

## 5. Point the Cloudflare tunnel at it

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

If `cloudflared` runs on the host rather than inside Coolify's network, point it at
`http://localhost:<the port Coolify published>` instead — Coolify shows that port on the
application page.

Whatever hostname you choose here has to equal `ORIGIN` from step 3.

## 6. Google sign-in (optional)

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
its own; otherwise hit Deploy. Every schema statement is `IF NOT EXISTS`, so a redeploy
against a populated database is a no-op — accounts and picks are untouched.

**Scaling.** The ESPN poller runs inside the server process, so run exactly one
instance. Two containers would poll ESPN twice and race each other on writes. For a
friend-group league one container is comfortably enough.
