import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COOKIE_NAME,
  DUMMY_HASH,
  MAX_PASSWORD_LENGTH,
  SESSION_TTL_MS,
  createSessionStore,
  hashPassword,
  rateLimit,
  readCookie,
  verifyPassword,
} from './auth.js';
import { initSchema, toObjects } from './db.js';
import { isIsoDate, todayUtc } from './dates.js';
import { createEntryStore, normalizeTags, parseEntry } from './entries.js';
import { buildStats } from './stats.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PAGE_SIZE = 100;

const clampInt = (value, fallback, min, max) => {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? fallback : Math.min(max, Math.max(min, n));
};
const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** @param db a @libsql/client client (local file or hosted Turso database) */
export function createApp({ db, allowSignup = true, registerLimit = 10 }) {
  const app = express();
  const sessions = createSessionStore(db);
  const entries = createEntryStore(db);

  // Create the tables (idempotent) before the first request that needs them.
  const ready = initSchema(db);
  ready.catch((err) => console.error('Database setup failed:', err));

  app.disable('x-powered-by');
  // Behind a proxy (Vercel, a load balancer) the real scheme and client IP come from
  // X-Forwarded-* headers; Vercel is always behind exactly one.
  const trustProxy = process.env.TRUST_PROXY ?? (process.env.VERCEL ? '1' : undefined);
  if (trustProxy) app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);

  // Keep in step with the `headers` in vercel.json, which covers static files on Vercel.
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    });
    next();
  });

  // ---- static frontend (on Vercel, public/ is served by its CDN instead) -----
  app.use(express.static(path.join(ROOT, 'public')));

  app.use(async (req, res, next) => {
    await ready;
    next();
  });

  // Liveness check for the host; also proves the database is reachable.
  app.get('/health', async (req, res) => {
    await db.execute('SELECT 1');
    res.json({ ok: true });
  });

  // ---- api plumbing -------------------------------------------------------
  app.use('/api', express.json({ limit: '300kb' }));

  // Cookies are SameSite=Lax; on top of that refuse state-changing requests that
  // announce a different origin.
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    const origin = req.get('origin');
    if (origin) {
      let host = null;
      try {
        host = new URL(origin).host;
      } catch {}
      if (host !== req.get('host')) return res.status(403).json({ error: 'Cross-origin request blocked.' });
    }
    next();
  });

  app.use('/api', async (req, res, next) => {
    req.sessionToken = readCookie(req, COOKIE_NAME);
    req.user = req.sessionToken ? await sessions.user(req.sessionToken) : null;
    next();
  });
  const requireUser = (req, res, next) =>
    req.user ? next() : res.status(401).json({ error: 'Please sign in.' });

  /** Signs the user in and returns the freshly signed-in user. */
  async function startSession(req, res, userId) {
    const token = await sessions.create(userId);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure,
      maxAge: SESSION_TTL_MS,
      path: '/',
    });
    return sessions.user(token);
  }

  // ---- auth ---------------------------------------------------------------
  const loginLimiter = rateLimit({
    db,
    name: 'login',
    windowMs: 15 * 60_000,
    max: 10,
    key: (req) => `${req.ip}|${String(req.body?.email ?? '').toLowerCase()}`,
  });
  const registerLimiter = rateLimit({ db, name: 'register', windowMs: 60 * 60_000, max: registerLimit, key: (req) => req.ip });

  app.get('/api/auth/me', (req, res) => res.json({ user: req.user, allowSignup }));

  app.post('/api/auth/register', registerLimiter, async (req, res) => {
    if (!allowSignup) return res.status(403).json({ error: 'Sign-ups are disabled on this instance.' });
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim()) || email.length > 254) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters.` });
    }
    let userId;
    try {
      const info = await db.execute({
        sql: 'INSERT INTO users (email, password_hash) VALUES (?, ?)',
        args: [email.trim(), await hashPassword(password)],
      });
      userId = Number(info.lastInsertRowid);
    } catch (err) {
      if (/UNIQUE constraint failed/i.test(err.message)) {
        return res.status(409).json({ error: 'An account with that email already exists.' });
      }
      throw err;
    }
    res.status(201).json({ user: await startSession(req, res, userId) });
  });

  app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string' || password.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const result = await db.execute({ sql: 'SELECT id, password_hash FROM users WHERE email = ?', args: [email.trim()] });
    const row = toObjects(result)[0];
    const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
    if (!row || !ok) return res.status(401).json({ error: 'Incorrect email or password.' });

    await loginLimiter.reset(req);
    res.json({ user: await startSession(req, res, row.id) });
  });

  app.post('/api/auth/logout', async (req, res) => {
    if (req.sessionToken) await sessions.destroy(req.sessionToken);
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  });

  app.patch('/api/me', requireUser, async (req, res) => {
    const { default_cadence } = req.body ?? {};
    if (default_cadence !== 'daily' && default_cadence !== 'weekly') {
      return res.status(400).json({ error: 'default_cadence must be "daily" or "weekly".' });
    }
    await db.execute({ sql: 'UPDATE users SET default_cadence = ? WHERE id = ?', args: [default_cadence, req.user.id] });
    res.json({ user: { ...req.user, default_cadence } });
  });

  // ---- entries ------------------------------------------------------------
  app.get('/api/entries', requireUser, async (req, res) => {
    const { q, from, to, cadence } = req.query;
    if ((from && !isIsoDate(from)) || (to && !isIsoDate(to))) {
      return res.status(400).json({ error: 'from/to must be YYYY-MM-DD dates.' });
    }
    const result = await entries.search(req.user.id, {
      q: typeof q === 'string' ? q.trim().slice(0, 200) : '',
      tags: normalizeTags(asList(req.query.tag)),
      from,
      to,
      cadence: cadence === 'daily' || cadence === 'weekly' ? cadence : null,
      limit: clampInt(req.query.limit, 20, 1, MAX_PAGE_SIZE),
      offset: clampInt(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER),
    });
    res.json(result);
  });

  app.post('/api/entries', requireUser, async (req, res) => {
    const { value, error } = parseEntry(req.body);
    if (error) return res.status(400).json({ error });
    const id = await entries.create(req.user.id, value);
    res.status(201).json({ entry: await entries.get(req.user.id, id) });
  });

  const entryId = (req) => {
    const id = Number(req.params.id);
    return Number.isSafeInteger(id) ? id : null;
  };

  app.get('/api/entries/:id', requireUser, async (req, res) => {
    const id = entryId(req);
    const entry = id && (await entries.get(req.user.id, id));
    if (!entry) return res.status(404).json({ error: 'Entry not found.' });
    res.json({ entry });
  });

  app.put('/api/entries/:id', requireUser, async (req, res) => {
    const id = entryId(req);
    const { value, error } = parseEntry(req.body);
    if (error) return res.status(400).json({ error });
    if (id == null || (await entries.update(req.user.id, id, value)) == null) {
      return res.status(404).json({ error: 'Entry not found.' });
    }
    res.json({ entry: await entries.get(req.user.id, id) });
  });

  app.delete('/api/entries/:id', requireUser, async (req, res) => {
    const id = entryId(req);
    if (id == null || !(await entries.remove(req.user.id, id))) {
      return res.status(404).json({ error: 'Entry not found.' });
    }
    res.json({ ok: true });
  });

  app.get('/api/tags', requireUser, async (req, res) => res.json({ tags: await entries.allTags(req.user.id) }));

  app.get('/api/stats', requireUser, async (req, res) => {
    const today = isIsoDate(req.query.today) ? req.query.today : todayUtc();
    const weeks = clampInt(req.query.weeks, 12, 1, 104);
    const stats = buildStats(await entries.statRows(req.user.id), today, weeks);
    res.json({ ...stats, topTags: await entries.topTagsSince(req.user.id, stats.range.from) });
  });

  // ---- fallthrough --------------------------------------------------------
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That is too large to save.' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });

  // Housekeeping: expired sessions and rate-limit windows. Best effort, never fatal.
  const purge = () => ready.then(() => sessions.purgeExpired()).catch((err) => console.error('Purge failed:', err));
  purge();
  setInterval(purge, 60 * 60_000).unref();

  return app;
}
