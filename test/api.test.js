import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../server/app.js';
import { addDays, todayUtc, weekStart } from '../server/dates.js';
import { openDb } from '../server/db.js';

let server;
let base;

before(async () => {
  server = createApp({ db: openDb(':memory:'), registerLimit: Infinity }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

/** A tiny fetch wrapper that keeps its own cookie jar, like one browser. */
function client() {
  let cookie = '';
  return async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.getSetCookie().find((c) => c.startsWith('devlog_sid='));
    if (setCookie) cookie = setCookie.split(';')[0].endsWith('=') ? '' : setCookie.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => null), headers: res.headers, setCookie };
  };
}

const today = todayUtc();
const entry = (overrides = {}) => ({
  cadence: 'daily',
  period_date: today,
  worked_on: 'Wired up the **auth** flow',
  tags: ['frontend'],
  ...overrides,
});

test('everything under /api except auth requires a session', async () => {
  const api = client();
  assert.equal((await api('GET', '/api/entries')).status, 401);
  assert.equal((await api('GET', '/api/stats')).status, 401);
  const me = await api('GET', '/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user, null);
});

test('register, sign out, sign in', async () => {
  const api = client();
  assert.equal((await api('POST', '/api/auth/register', { email: 'nope', password: 'longenough1' })).status, 400);
  assert.equal((await api('POST', '/api/auth/register', { email: 'a@example.com', password: 'short' })).status, 400);

  const created = await api('POST', '/api/auth/register', { email: 'Ada@Example.com', password: 'correct horse' });
  assert.equal(created.status, 201);
  assert.equal(created.body.user.default_cadence, 'daily');
  assert.match(created.setCookie, /HttpOnly/i);
  assert.match(created.setCookie, /SameSite=Lax/i);
  assert.equal((await api('GET', '/api/auth/me')).body.user.email, 'Ada@Example.com');

  const dup = await client()('POST', '/api/auth/register', { email: 'ada@example.com', password: 'another one' });
  assert.equal(dup.status, 409, 'emails are unique case-insensitively');

  await api('POST', '/api/auth/logout');
  assert.equal((await api('GET', '/api/entries')).status, 401, 'session is gone after logout');

  const wrong = await api('POST', '/api/auth/login', { email: 'ada@example.com', password: 'wrong' });
  assert.equal(wrong.status, 401);
  const unknown = await api('POST', '/api/auth/login', { email: 'nobody@example.com', password: 'wrong' });
  assert.deepEqual(unknown.body, wrong.body, 'no hint about which emails exist');

  const ok = await api('POST', '/api/auth/login', { email: 'ADA@example.com', password: 'correct horse' });
  assert.equal(ok.status, 200);
  assert.equal((await api('GET', '/api/entries')).status, 200);
});

test('repeated failed logins get rate limited', async () => {
  const api = client();
  let last;
  for (let i = 0; i < 11; i++) {
    last = await api('POST', '/api/auth/login', { email: 'limit@example.com', password: 'nope' });
  }
  assert.equal(last.status, 429);
});

test('cross-origin writes are refused', async () => {
  const api = client();
  const res = await api('POST', '/api/auth/register', { email: 'evil@example.com', password: 'longenough1' }, { origin: 'https://evil.test' });
  assert.equal(res.status, 403);
});

test('preferences: default cadence', async () => {
  const api = client();
  await api('POST', '/api/auth/register', { email: 'prefs@example.com', password: 'longenough1' });
  assert.equal((await api('PATCH', '/api/me', { default_cadence: 'monthly' })).status, 400);
  assert.equal((await api('PATCH', '/api/me', { default_cadence: 'weekly' })).status, 200);
  assert.equal((await api('GET', '/api/auth/me')).body.user.default_cadence, 'weekly');
});

test('entries: validation', async () => {
  const api = client();
  await api('POST', '/api/auth/register', { email: 'valid@example.com', password: 'longenough1' });
  const bad = async (patch) => assert.equal((await api('POST', '/api/entries', entry(patch))).status, 400, JSON.stringify(patch));

  await bad({ worked_on: '   ' }); // nothing written
  await bad({ cadence: 'monthly' });
  await bad({ period_date: '2026-13-01' });
  await bad({ period_date: addDays(today, 5) });
  await bad({ mood: 6 });
  await bad({ mood: 3.5 });
  await bad({ learned: 42 });
  await bad({ learned: 'x'.repeat(20_001) });

  const ok = await api('POST', '/api/entries', entry({ worked_on: '', shipped: 'Merged #42', mood: 4 }));
  assert.equal(ok.status, 201, 'any single prompt is enough');
});

test('entries: create, read, update, delete', async () => {
  const api = client();
  await api('POST', '/api/auth/register', { email: 'crud@example.com', password: 'longenough1' });

  const created = await api('POST', '/api/entries', entry({ tags: ['#Frontend', 'bug fix', 'frontend', ''], mood: 4 }));
  assert.equal(created.status, 201);
  const { id, tags, mood } = created.body.entry;
  assert.deepEqual(tags, ['frontend', 'bug-fix'], 'tags are normalised and de-duplicated');
  assert.equal(mood, 4);

  const updated = await api('PUT', `/api/entries/${id}`, entry({ worked_on: 'Rewrote it', tags: ['refactor'], mood: null }));
  assert.equal(updated.status, 200);
  assert.equal(updated.body.entry.worked_on, 'Rewrote it');
  assert.deepEqual(updated.body.entry.tags, ['refactor']);
  assert.equal(updated.body.entry.mood, null);

  assert.equal((await api('DELETE', `/api/entries/${id}`)).status, 200);
  assert.equal((await api('GET', `/api/entries/${id}`)).status, 404);
  assert.equal((await api('DELETE', `/api/entries/${id}`)).status, 404);
  assert.equal((await api('GET', '/api/entries/not-a-number')).status, 404);
});

test('weekly entries snap to the Monday of their week', async () => {
  const api = client();
  await api('POST', '/api/auth/register', { email: 'weekly@example.com', password: 'longenough1' });
  const res = await api('POST', '/api/entries', entry({ cadence: 'weekly', period_date: today }));
  assert.equal(res.body.entry.period_date, weekStart(today));
});

test('entries: users only ever see their own', async () => {
  const alice = client();
  const bob = client();
  await alice('POST', '/api/auth/register', { email: 'alice@example.com', password: 'longenough1' });
  await bob('POST', '/api/auth/register', { email: 'bob@example.com', password: 'longenough1' });

  const { id } = (await alice('POST', '/api/entries', entry({ tags: ['secret'] }))).body.entry;

  assert.equal((await bob('GET', `/api/entries/${id}`)).status, 404);
  assert.equal((await bob('PUT', `/api/entries/${id}`, entry())).status, 404);
  assert.equal((await bob('DELETE', `/api/entries/${id}`)).status, 404);
  assert.equal((await bob('GET', '/api/entries')).body.total, 0);
  assert.deepEqual((await bob('GET', '/api/tags')).body.tags, []);
  assert.equal((await alice('GET', `/api/entries/${id}`)).status, 200, 'and bob could not delete it');
});

test('history: filter by tag, keyword, cadence and date range', async () => {
  const api = client();
  await api('POST', '/api/auth/register', { email: 'history@example.com', password: 'longenough1' });
  const monday = weekStart(today);

  const seed = [
    entry({ period_date: addDays(today, -10), worked_on: 'Fixed the flaky checkout test', tags: ['bug', 'testing'] }),
    entry({ period_date: addDays(today, -5), worked_on: 'Read about 100% coverage', learned: 'snake_case vs camelCase', tags: ['learning'] }),
    entry({ period_date: addDays(today, -1), worked_on: 'Built the dashboard', tags: ['frontend', 'bug'] }),
    entry({ cadence: 'weekly', period_date: addDays(monday, -14), worked_on: 'Sprint recap', tags: [] }),
  ];
  for (const e of seed) assert.equal((await api('POST', '/api/entries', e)).status, 201);

  const list = async (qs) => (await api('GET', `/api/entries?${qs}`)).body;

  const all = await list('');
  assert.equal(all.total, 4);
  assert.deepEqual(
    all.entries.map((e) => e.period_date),
    all.entries.map((e) => e.period_date).sort().reverse(),
    'newest first',
  );

  assert.equal((await list('tag=bug')).total, 2);
  assert.equal((await list('tag=bug&tag=testing')).total, 1, 'multiple tags must all match');
  assert.equal((await list('tag=%23BUG')).total, 2, 'tag filter is normalised like stored tags');
  assert.equal((await list('q=CHECKOUT')).total, 1, 'keyword search is case-insensitive');
  assert.equal((await list('q=camelcase')).total, 1, 'searches every prompt, not just the first');
  assert.equal((await list('q=learning')).total, 1, 'and tags');
  assert.equal((await list('q=100%25')).total, 1, 'LIKE wildcards are matched literally');
  assert.equal((await list('q=snake_case')).total, 1);
  assert.equal((await list('q=snakeXcase')).total, 0, '_ is not a wildcard');
  assert.equal((await list('cadence=weekly')).total, 1);
  assert.equal((await list(`from=${addDays(today, -6)}`)).total, 2);
  assert.equal((await list(`from=${addDays(today, -6)}&to=${addDays(today, -2)}`)).total, 1);
  assert.equal((await list(`from=${addDays(monday, -12)}&to=${addDays(monday, -12)}`)).total, 1, 'a weekly log matches any day in its week');
  assert.equal((await api('GET', '/api/entries?from=garbage')).status, 400);

  const page = await list('limit=2&offset=2');
  assert.equal(page.entries.length, 2);
  assert.equal(page.total, 4);
});

test('stats: streaks, weekly buckets, top tags', async () => {
  const api = client();
  await api('POST', '/api/auth/register', { email: 'stats@example.com', password: 'longenough1' });
  for (const offset of [0, -1, -2, -4]) {
    await api('POST', '/api/entries', entry({ period_date: addDays(today, offset), tags: ['a', 'b'], mood: 4 }));
  }
  await api('POST', '/api/entries', entry({ period_date: addDays(today, -3), tags: ['a'] }));

  const { status, body } = await api('GET', `/api/stats?today=${today}&weeks=4`);
  assert.equal(status, 200);
  assert.deepEqual(body.streaks.daily, { current: 5, longest: 5 });
  assert.equal(body.logged.daily, true);
  assert.equal(body.totals.entries, 5);
  assert.equal(body.totals.avgMood, 4);
  assert.equal(body.perWeek.length, 4);
  assert.deepEqual(body.topTags, [{ tag: 'a', count: 5 }, { tag: 'b', count: 4 }]);
});
