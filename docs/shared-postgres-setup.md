# Shared Postgres setup (jv-update branch)

Business data AND user accounts (`_users`, `_sessions`) now live in the shared Railway Postgres
(project **supply-chain-app**, service **Postgres**). Everyone sees the same user list and the same
business data. `server/auth.mjs` picks SQLite or Postgres for accounts based on `BACKEND`
(`local` = SQLite, `pg` = Postgres) — same switch the business data already used.

Branch: `jv-update` (based on `main`, merged with `yhelie-update`'s UI). Not pushed to `main` yet.

## One-time setup

1. Install Railway CLI: `npm install -g @railway/cli`
2. `railway login` (opens browser)
3. In the repo folder: `railway link --project "supply-chain-app"` then pick environment `production`
4. `railway service Postgres`
5. Generate an SSH key if you don't have one:
   `ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\id_ed25519" -C "your-email@example.com"`
   (blank passphrase is fine for this local dev key)
6. Register it with Railway: `railway ssh keys add`

## Every time you want to run the app

1. Open the tunnel (keep this terminal open, it stays running):
   ```
   railway connect Postgres --tunnel-only
   ```
   It prints a **different local port each time** plus a password, e.g.:
   ```
   Host:     127.0.0.1
   Port:     59122
   User:     postgres
   Password: ...
   Database: railway
   URL:      postgresql://postgres:...@127.0.0.1:59122/railway
   ```
2. Copy that `URL:` line into your own `.env` as `DATABASE_URL=...` (update the port every time it changes).
3. Make sure `.env` also has:
   ```
   BACKEND=pg
   PORT=4000
   ADMIN_EMAIL=<your username>
   ADMIN_PASSWORD=<your password>
   ```
4. `npm install`
5. `npm run dev` → http://localhost:4000

## Login

Login field accepts a plain username now, not just email (`server/auth.mjs` `isEmail` regex was
widened: 3-32 chars, letters/digits/dot/underscore/hyphen — real emails still work too).

First run with `ADMIN_EMAIL`/`ADMIN_PASSWORD` set creates the admin account automatically.
Forces a password change on first login.

### "No account" / login fails even though the admin account definitely exists

This means your `localhost` is reading from your own **local SQLite** database, not the shared
Postgres — a completely separate, usually-empty `_users` table. Happens when `BACKEND` isn't set
to `pg`, or the tunnel from step 1 above isn't running. Check your `.env` has:

```
BACKEND=pg
DATABASE_URL=postgresql://postgres:...@127.0.0.1:<port>/railway   (current tunnel session's port/password)
```

If `BACKEND=local` or missing, or `DATABASE_URL` is stale/not set, the app silently falls back to
SQLite (`data/app.db`) instead of erroring — so the server still starts fine, it's just reading
the wrong account list. Re-run `railway connect Postgres --tunnel-only`, copy its fresh `URL:`
line into `DATABASE_URL`, confirm `BACKEND=pg`, and restart `npm run dev`. The startup log line
`[pg] connected; schema ready (...)` only appears when it's actually using Postgres — if you don't
see that line, you're on local SQLite.

## Notes

- Railway's tunnel password and port are session-specific — don't hardcode them anywhere shared, re-copy each session.
- `.env` is gitignored, never commit it.
- Business tables are empty on Postgres right now. Load mock data with `npm run seed` if needed.
- Zoho Creator backend/adapter was removed in this branch (`yhelie-update`'s commit). Only `local` (SQLite)
  and `pg` (Postgres) backends exist now, via `BACKEND` env var.
- First person to run the app with `BACKEND=pg` and `ADMIN_EMAIL`/`ADMIN_PASSWORD` set creates the shared
  admin account. Don't set those two vars again after that (they only act on an empty `_users` table) —
  everyone else just signs in with whatever account an admin made for them via **Manage users**.
- Current admin login: username `HCADMIN`, ask for the password out of band (not written here).
