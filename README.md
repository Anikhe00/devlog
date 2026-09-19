# DevLog

A personal work journal for developers. Instead of a blank page, every entry is a short guided form, so there's never a "what do I even write?" moment.

## Run it

```bash
npm install
npm start          # http://localhost:3000
```

Create an account on the sign-in screen and start writing. Requires Node 20+.

| Env var        | Default              | Purpose                                                              |
| -------------- | -------------------- | -------------------------------------------------------------------- |
| `PORT`         | `3000`               | Port to listen on                                                    |
| `HOST`         | `127.0.0.1`          | Bind address. Localhost-only by default because this is personal data |
| `DEVLOG_DB`    | `data/devlog.db`     | SQLite file (created on first run)                                   |
| `ALLOW_SIGNUP` | `true`               | Set to `false` after creating your account to close registration     |
| `TRUST_PROXY`  | unset                | Set (e.g. `1`) when behind an HTTPS reverse proxy so cookies get `Secure` |

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

## Layout

```
server/   Express API + SQLite (auth, entries, stats)
public/   Static frontend: vanilla ES modules, no build step
test/     node:test unit + API tests
```

Not included: password reset (there's no email service, so back up `data/devlog.db` and keep your password safe) and data export.
