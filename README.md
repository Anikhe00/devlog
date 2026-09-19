# DevLog

A personal work journal for developers. Instead of a blank page, every entry is a short guided form, so there's never a "what do I even write?" moment.

## Run it

```bash
npm install
npm start          # http://localhost:3000
```

Create an account on the sign-in screen and start writing. Requires Node 22. Locally your entries live in a SQLite file at `data/devlog.db` (created on first run).

| Env var               | Default            | Purpose                                                                                     |
| --------------------- | ------------------ | ------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | `file:` + `data/devlog.db` | A local SQLite file (`file:/path/to/devlog.db`) or a hosted Turso database (`libsql://…`) |
| `DATABASE_AUTH_TOKEN` | unset              | Token for a hosted Turso database (not needed for a local file)                             |
| `ALLOW_SIGNUP`        | `true`             | Set to `false` to stop new accounts being created                                           |
| `PORT`                | `3000`             | Port for `npm start`                                                                        |
| `HOST`                | `127.0.0.1`        | Bind address for `npm start`. Localhost-only by default because this is personal data       |
| `TRUST_PROXY`         | unset (`1` on Vercel) | Number of proxies in front of the app, so cookies get `Secure` and rate limits see the real client IP |

`npm run dev` restarts on file changes; `npm test` runs the test suite.

## How it works

**Guided entries.** Five labelled prompts (worked on, learned, shipped, blockers, next), each with a coaching hint and an example placeholder, plus optional tags and a 1–5 mood/energy rating. Any single prompt is enough to save. Fields are Markdown (bold, `code`, lists, `- [ ]` tasks, fenced blocks) with a Write/Preview toggle. Unsaved new entries are kept as a local draft.

**Daily or weekly.** Choose per entry; set your default in Settings. Same structure, different framing. A weekly log is stored against its Monday (weeks run Mon–Sun).

**Streaks.** Day streak = consecutive days with a *daily* log. Week streak = consecutive weeks with *any* log. A streak isn't broken until you skip a whole period, so an unlogged "today" doesn't reset it yet.

**History.** Newest first, grouped by month. Search keywords (all prompts and tags), filter by one or more tags (all must match), date range, and log type. Filters live in the URL, so a filtered view can be bookmarked. A weekly log matches any date range that overlaps its week.

**Stats.** Entries per week, average mood per week, most-used tags, over 12/26/52 weeks. Charts are keyboard-navigable and every chart has a "view as table" fallback.

## Design / security notes

- Passwords are hashed with scrypt. Sessions are random tokens in an `HttpOnly`, `SameSite=Lax` cookie; only a hash of the token is stored. Login and sign-up are rate limited, and login timing doesn't reveal whether an email exists.
- All queries are scoped to the signed-in user and parameterised.
- Markdown is sanitised with DOMPurify, and a strict CSP (`default-src 'self'`) is sent with every response. There are no external fonts, scripts or requests.
- The client sends its own local date for "today", so streaks follow *your* timezone, not the server's.

## Deploy for free: Vercel + Turso

Free hosts wipe the disk on restart, so a SQLite *file* can't live there. Instead the app runs on **Vercel** and keeps its data in **Turso**, a hosted database that speaks SQLite. As of writing, both have free plans that need no credit card (Vercel's Hobby plan is for personal, non-commercial use, which suits a portfolio project).

**1. Create the database** (needs the [Turso CLI](https://docs.turso.tech/cli/installation)):

```bash
brew install tursodatabase/tap/turso
turso auth signup
turso db create devlog            # leave off --tursodb: this app uses the libSQL engine
turso db show devlog --url        # copy this: it is your DATABASE_URL
turso db tokens create devlog     # copy this: it is your DATABASE_AUTH_TOKEN
```

**2. Deploy the app:** in Vercel choose **Add New → Project**, import this GitHub repo, and before deploying add two environment variables, `DATABASE_URL` and `DATABASE_AUTH_TOKEN`, with the values above. Deploy. The tables are created automatically on the first request, so there's nothing to migrate.

**3. Open the `vercel.app` URL**, create your account, and share the link. Pushes to your default branch redeploy automatically.

Good to know:

- **Open sign-up** is the default. To stop new accounts (for example once your friends have joined), add `ALLOW_SIGNUP=false` in Vercel's environment variables and redeploy.
- **Privacy:** passwords are hashed, but entries are stored as plain text in your Turso database, so whoever runs the deployment can read them. Tell your users; the sign-up form says so too.
- **Rate limiting** lives in the database (not memory), so it holds across Vercel's short-lived instances. It keys on the client IP Vercel reports, and failed logins are also limited per email.
- **Static files** (the `public/` folder) are served by Vercel's CDN, so `vercel.json` sets the security headers for them.
- After deploying, check in your browser's dev tools that the `devlog_sid` cookie is marked `Secure`.
- You can also run it on any Node host with a persistent disk: `npm start` with `DATABASE_URL=file:/path/on/the/disk/devlog.db`.

## Layout

```
index.js  Entry point: the Express app (Vercel runs it; server/index.js listens on it)
server/   API, auth, entries, stats, database access (libSQL client)
public/   Static frontend: vanilla ES modules, no build step
scripts/  copy-vendor.js copies the browser libraries into public/vendor on install
test/     node:test unit + API tests
```

Not included: password reset (there's no email service, so keep your password safe and back up your database) and data export.

## Licence

[MIT](LICENSE)
