import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../server/app.js';
import { connect } from '../server/db.js';

const APP_URL = 'https://app.example';
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

/** A fresh app + database per test, so the (per-IP) rate limits never leak between tests. */
async function harness({ mailer, appUrl = APP_URL } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devlog-reset-'));
  const db = connect({ url: `file:${path.join(dir, 't.db')}` });
  const sent = [];
  const mail = mailer ?? { enabled: true, async send(m) { sent.push(m); } };
  const server = createApp({ db, mailer: mail, appUrl, registerLimit: Infinity }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const client = () => {
    let cookie = '';
    return async (method, p, body, headers = {}) => {
      const res = await fetch(base + p, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
      const sc = res.headers.getSetCookie().find((c) => c.startsWith('devlog_sid='));
      if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
      return { status: res.status, body: await res.json().catch(() => null), cookie };
    };
  };
  /** Raw request, so the Host header can be forged (fetch won't let us). */
  const raw = (method, p, body, host) =>
    new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : undefined;
      const req = http.request({ host: '127.0.0.1', port, path: p, method, headers: { host, ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}) } }, (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => resolve({ status: res.statusCode, body: chunks ? JSON.parse(chunks) : null }));
      });
      req.on('error', reject);
      req.end(data);
    });
  const close = async () => { await new Promise((r) => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); };
  const tokenFrom = (mail) => mail.text.match(/#\/reset\?token=([\w-]+)/)[1];
  return { client, raw, db, sent, close, tokenFrom };
}

async function withUser(h, email = 'ada@example.com', password = 'correct horse') {
  const api = h.client();
  const res = await api('POST', '/api/auth/register', { email, password });
  assert.equal(res.status, 201);
  return { api, email, password };
}

test('forgot: emails a link to a real account, and stores only a hash of the token', async () => {
  const h = await harness();
  try {
    await withUser(h);
    const res = await h.client()('POST', '/api/auth/forgot', { email: 'ADA@example.com' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });

    assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0].to, 'ada@example.com');
    assert.match(h.sent[0].text, /^https?:|https:\/\/app\.example\/#\/reset\?token=/m);
    const token = h.tokenFrom(h.sent[0]);
    assert.equal(token.length, 43, '256 random bits, base64url');

    const rows = (await h.db.execute('SELECT token_hash, expires_at FROM password_resets')).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].token_hash, sha256(token));
    assert.notEqual(rows[0].token_hash, token, 'the database never holds the token itself');
    const ttl = rows[0].expires_at - Date.now();
    assert.ok(ttl > 29 * 60_000 && ttl <= 30 * 60_000, `expires in ~30 minutes (${Math.round(ttl / 60000)})`);
  } finally { await h.close(); }
});

test('forgot: identical answer for unknown accounts, nothing sent, and bad input is rejected', async () => {
  const h = await harness();
  try {
    await withUser(h);
    const api = h.client();
    const known = await api('POST', '/api/auth/forgot', { email: 'ada@example.com' });
    const unknown = await api('POST', '/api/auth/forgot', { email: 'nobody@example.com' });
    assert.equal(unknown.status, 200);
    assert.deepEqual(unknown.body, known.body, 'no way to tell who is registered');
    assert.equal(h.sent.length, 1, 'only the real account got an email');
    assert.equal((await api('POST', '/api/auth/forgot', { email: 'not-an-email' })).status, 400);
    assert.equal((await api('POST', '/api/auth/forgot', {})).status, 400);
  } finally { await h.close(); }
});

test('forgot: the emailed link never comes from the Host header', async () => {
  // Configured address wins even when the request claims to be somewhere else.
  const a = await harness();
  try {
    await withUser(a);
    assert.equal((await a.raw('POST', '/api/auth/forgot', { email: 'ada@example.com' }, 'evil.example')).status, 200);
    assert.ok(a.sent[0].text.includes('https://app.example/#/reset?token='));
    assert.ok(!a.sent[0].text.includes('evil.example'));
  } finally { await a.close(); }

  // With no configured address, only localhost is trusted: a forged Host gets nothing.
  const b = await harness({ appUrl: null }); // null, not undefined: undefined would pick up the default
  try {
    await withUser(b);
    const me = await b.raw('GET', '/api/auth/me', undefined, 'evil.example');
    assert.equal(me.body.resetEnabled, false);
    const res = await b.raw('POST', '/api/auth/forgot', { email: 'ada@example.com' }, 'evil.example');
    assert.equal(res.status, 503);
    assert.equal(b.sent.length, 0);
    // ...while plain localhost (development) is fine
    const local = await b.client()('POST', '/api/auth/forgot', { email: 'ada@example.com' });
    assert.equal(local.status, 200);
    assert.match(b.sent[0].text, /http:\/\/127\.0\.0\.1:\d+\/#\/reset\?token=/);
  } finally { await b.close(); }
});

test('me: resetEnabled follows whether mail can really be sent', async () => {
  const on = await harness();
  const off = await harness({ mailer: { enabled: false, async send() { throw new Error('nope'); } } });
  try {
    assert.equal((await on.client()('GET', '/api/auth/me')).body.resetEnabled, true);
    assert.equal((await off.client()('GET', '/api/auth/me')).body.resetEnabled, false);
    await withUser(off);
    assert.equal((await off.client()('POST', '/api/auth/forgot', { email: 'ada@example.com' })).status, 503);
  } finally { await on.close(); await off.close(); }
});

test('forgot: a failing mail provider is logged, not revealed', async () => {
  const errors = [];
  const original = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  const h = await harness({ mailer: { enabled: true, async send() { throw new Error('Brevo responded 400: Sender not verified'); } } });
  try {
    await withUser(h);
    const res = await h.client()('POST', '/api/auth/forgot', { email: 'ada@example.com' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.ok(errors.some((e) => e.includes('Sender not verified')), 'the owner can see why in the logs');
  } finally { console.error = original; await h.close(); }
});

test('forgot: rate limited per email and per IP', async () => {
  const h = await harness();
  try {
    const api = h.client();
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await api('POST', '/api/auth/forgot', { email: 'spam@example.com' })).status);
    assert.deepEqual(statuses, [200, 200, 200, 429], 'the 4th request for one address in an hour is refused');
    assert.equal((await api('POST', '/api/auth/forgot', { email: 'other@example.com' })).status, 200, 'other addresses are unaffected');

    let last;
    for (let i = 0; i < 12; i++) last = await api('POST', '/api/auth/forgot', { email: `user${i}@example.com` });
    assert.equal(last.status, 429, 'and one IP cannot try endless addresses');
  } finally { await h.close(); }
});

test('reset: a valid link sets the new password, works once, and signs every session out', async () => {
  const h = await harness();
  try {
    const { api } = await withUser(h);                       // this browser is signed in
    assert.ok((await api('GET', '/api/auth/me')).body.user);
    const other = h.client();
    assert.equal((await other('POST', '/api/auth/login', { email: 'ada@example.com', password: 'correct horse' })).status, 200);

    await h.client()('POST', '/api/auth/forgot', { email: 'ada@example.com' });
    const token = h.tokenFrom(h.sent[0]);
    const anon = h.client();
    const done = await anon('POST', '/api/auth/reset', { token, password: 'a brand new passphrase' });
    assert.equal(done.status, 200);

    assert.equal((await api('GET', '/api/auth/me')).body.user, null, 'existing sessions are gone');
    assert.equal((await other('GET', '/api/auth/me')).body.user, null);
    assert.equal((await anon('POST', '/api/auth/login', { email: 'ada@example.com', password: 'correct horse' })).status, 401, 'old password no longer works');
    assert.equal((await anon('POST', '/api/auth/login', { email: 'ada@example.com', password: 'a brand new passphrase' })).status, 200);

    const again = await anon('POST', '/api/auth/reset', { token, password: 'yet another passphrase' });
    assert.equal(again.status, 400, 'a link works once');
    assert.match(again.body.error, /invalid or has expired/);
  } finally { await h.close(); }
});

test('reset: expired, garbage and mismatched links are refused; a weak password does not burn the link', async () => {
  const h = await harness();
  try {
    await withUser(h);
    const api = h.client();
    await api('POST', '/api/auth/forgot', { email: 'ada@example.com' });
    const token = h.tokenFrom(h.sent[0]);

    assert.equal((await api('POST', '/api/auth/reset', { token: 'x'.repeat(43), password: 'long enough pw' })).status, 400, 'unknown token');
    assert.equal((await api('POST', '/api/auth/reset', { token: 'short', password: 'long enough pw' })).status, 400);
    assert.equal((await api('POST', '/api/auth/reset', { password: 'long enough pw' })).status, 400, 'no token');

    const weak = await api('POST', '/api/auth/reset', { token, password: 'short' });
    assert.equal(weak.status, 400);
    assert.match(weak.body.error, /at least 8/);
    assert.equal((await api('POST', '/api/auth/reset', { token, password: 'x'.repeat(201) })).status, 400, 'too long');

    // the link survived those mistakes...
    await h.db.execute({ sql: 'UPDATE password_resets SET expires_at = ?', args: [Date.now() - 1000] });
    // ...but not its own expiry
    assert.equal((await api('POST', '/api/auth/reset', { token, password: 'long enough pw' })).status, 400, 'expired');
    assert.equal((await api('POST', '/api/auth/login', { email: 'ada@example.com', password: 'correct horse' })).status, 200, 'password untouched');
  } finally { await h.close(); }
});

test('reset: the link still works after a mistyped (too-short) password', async () => {
  const h = await harness();
  try {
    await withUser(h);
    const api = h.client();
    await api('POST', '/api/auth/forgot', { email: 'ada@example.com' });
    const token = h.tokenFrom(h.sent[0]);
    assert.equal((await api('POST', '/api/auth/reset', { token, password: 'short' })).status, 400);
    assert.equal((await api('POST', '/api/auth/reset', { token, password: 'a good long password' })).status, 200);
  } finally { await h.close(); }
});

test('forgot: asking again cancels the earlier link', async () => {
  const h = await harness();
  try {
    await withUser(h);
    const api = h.client();
    await api('POST', '/api/auth/forgot', { email: 'ada@example.com' });
    await api('POST', '/api/auth/forgot', { email: 'ada@example.com' });
    const [first, second] = h.sent.map(h.tokenFrom);
    assert.notEqual(first, second);
    assert.equal((await api('POST', '/api/auth/reset', { token: first, password: 'long enough pw' })).status, 400, 'old link is dead');
    assert.equal((await api('POST', '/api/auth/reset', { token: second, password: 'long enough pw' })).status, 200);
  } finally { await h.close(); }
});

test('reset: guessing links is rate limited', async () => {
  const h = await harness();
  try {
    const api = h.client();
    let last;
    for (let i = 0; i < 11; i++) last = await api('POST', '/api/auth/reset', { token: 'g'.repeat(43), password: 'long enough pw' });
    assert.equal(last.status, 429);
  } finally { await h.close(); }
});

test('change password: needs the current one, signs out other devices, keeps this one', async () => {
  const h = await harness();
  try {
    const { api } = await withUser(h);
    const phone = h.client();
    await phone('POST', '/api/auth/login', { email: 'ada@example.com', password: 'correct horse' });
    await h.client()('POST', '/api/auth/forgot', { email: 'ada@example.com' });   // a reset link is pending

    assert.equal((await h.client()('POST', '/api/auth/password', { current: 'x', next: 'long enough pw' })).status, 401, 'must be signed in');
    const wrong = await api('POST', '/api/auth/password', { current: 'not it', next: 'long enough pw' });
    assert.equal(wrong.status, 400);
    assert.match(wrong.body.error, /current password is incorrect/);
    assert.equal((await api('POST', '/api/auth/password', { current: 'correct horse', next: 'short' })).status, 400);
    assert.equal((await api('POST', '/api/auth/password', { next: 'long enough pw' })).status, 400, 'current is required');

    assert.equal((await api('POST', '/api/auth/password', { current: 'correct horse', next: 'a new long password' })).status, 200);
    assert.ok((await api('GET', '/api/auth/me')).body.user, 'this device stays signed in');
    assert.equal((await phone('GET', '/api/auth/me')).body.user, null, 'the other device is signed out');
    assert.equal((await h.client()('POST', '/api/auth/login', { email: 'ada@example.com', password: 'correct horse' })).status, 401);
    assert.equal((await h.client()('POST', '/api/auth/login', { email: 'ada@example.com', password: 'a new long password' })).status, 200);
    assert.equal((await h.db.execute('SELECT COUNT(*) AS n FROM password_resets')).rows[0].n, 0, 'pending reset links are cancelled');
  } finally { await h.close(); }
});

test('change password: guessing the current password is rate limited', async () => {
  const h = await harness();
  try {
    const { api } = await withUser(h);
    let last;
    for (let i = 0; i < 11; i++) last = await api('POST', '/api/auth/password', { current: `guess ${i}`, next: 'long enough pw' });
    assert.equal(last.status, 429);
  } finally { await h.close(); }
});
