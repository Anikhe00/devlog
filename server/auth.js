import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { toObjects } from './db.js';

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
export const hashToken = sha256;
export const newToken = () => crypto.randomBytes(32).toString('base64url');

/** The one place the password rules live. Returns a message, or null when the password is fine. */
export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > MAX_PASSWORD_LENGTH) return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
  return null;
}

/** Opaque random tokens in a cookie; only their hash is stored server-side. */
export function createSessionStore(db) {
  return {
    async create(userId) {
      const token = crypto.randomBytes(32).toString('base64url');
      await db.execute({
        sql: 'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
        args: [sha256(token), userId, Date.now() + SESSION_TTL_MS],
      });
      return token;
    },
    async user(token) {
      const result = await db.execute({
        sql: `SELECT u.id, u.email, u.default_cadence
              FROM sessions s JOIN users u ON u.id = s.user_id
              WHERE s.token_hash = ? AND s.expires_at > ?`,
        args: [sha256(token), Date.now()],
      });
      return toObjects(result)[0] ?? null;
    },
    destroy: (token) => db.execute({ sql: 'DELETE FROM sessions WHERE token_hash = ?', args: [sha256(token)] }),
    async purgeExpired() {
      const now = Date.now();
      await db.batch(
        [
          { sql: 'DELETE FROM sessions WHERE expires_at <= ?', args: [now] },
          { sql: 'DELETE FROM rate_limits WHERE reset_at <= ?', args: [now] },
          { sql: 'DELETE FROM password_resets WHERE expires_at <= ?', args: [now] },
        ],
        'write',
      );
    },
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

// One atomic statement: start a new window if the old one expired, otherwise count up.
const HIT = `
  INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
  ON CONFLICT(key) DO UPDATE SET
    count    = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
    reset_at = CASE WHEN reset_at <= ? THEN ? ELSE reset_at END
  RETURNING count, reset_at`;

/**
 * Fixed-window limiter, stored in the database so it holds across serverless instances.
 * Enough to blunt password guessing on a small instance.
 */
export function rateLimit({ db, name, windowMs, max, key }) {
  const bucket = (req) => `${name}:${key(req)}`;

  const middleware = async (req, res, next) => {
    const now = Date.now();
    const result = await db.execute({ sql: HIT, args: [bucket(req), now + windowMs, now, now, now + windowMs] });
    const { count, reset_at } = toObjects(result)[0];
    if (count > max) {
      res.set('Retry-After', String(Math.ceil((reset_at - now) / 1000)));
      return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
    }
    next();
  };
  middleware.reset = (req) => db.execute({ sql: 'DELETE FROM rate_limits WHERE key = ?', args: [bucket(req)] });
  return middleware;
}
