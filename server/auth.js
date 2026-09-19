import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const COST = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 64;

export const COOKIE_NAME = 'devlog_sid';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_PASSWORD_LENGTH = 200;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, KEY_LEN, COST);
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  const [alg, N, r, p, salt, key] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return crypto.timingSafeEqual(actual, expected);
}

// Verified against when the email is unknown, so "no such user" and "wrong
// password" take the same time.
export const DUMMY_HASH = await hashPassword(crypto.randomBytes(16).toString('hex'));

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

/** Opaque random tokens in a cookie; only their hash is stored server-side. */
export function createSessionStore(db) {
  const insert = db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)');
  const find = db.prepare(`
    SELECT u.id, u.email, u.default_cadence
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?`);
  const remove = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
  const purge = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');

  return {
    create(userId) {
      const token = crypto.randomBytes(32).toString('base64url');
      insert.run(sha256(token), userId, Date.now() + SESSION_TTL_MS);
      return token;
    },
    user: (token) => find.get(sha256(token), Date.now()) ?? null,
    destroy: (token) => remove.run(sha256(token)),
    purgeExpired: () => purge.run(Date.now()),
  };
}

export function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Fixed-window in-memory limiter. Enough to blunt password guessing on a personal instance. */
export function rateLimit({ windowMs, max, key }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs).unref();

  const middleware = (req, res, next) => {
    const now = Date.now();
    const k = key(req);
    let hit = hits.get(k);
    if (!hit || hit.resetAt <= now) {
      hit = { count: 0, resetAt: now + windowMs };
      hits.set(k, hit);
    }
    if (++hit.count > max) {
      res.set('Retry-After', String(Math.ceil((hit.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
    }
    next();
  };
  middleware.reset = (req) => hits.delete(key(req));
  return middleware;
}
