import assert from 'node:assert/strict';
import test from 'node:test';
import { addDays, diffDays, isIsoDate, weekStart } from '../server/dates.js';
import { buildStats, streaks } from '../server/stats.js';

// 2026-09-19 is a Saturday; its week starts Monday 2026-09-14.
const TODAY = '2026-09-19';

test('dates: validation, arithmetic and Monday-based weeks', () => {
  assert.ok(isIsoDate('2026-02-28'));
  assert.ok(!isIsoDate('2026-02-30'));
  assert.ok(!isIsoDate('2026-2-3'));
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(diffDays('2026-09-14', '2026-09-19'), 5);
  assert.equal(weekStart('2026-09-19'), '2026-09-14'); // Saturday
  assert.equal(weekStart('2026-09-14'), '2026-09-14'); // Monday
  assert.equal(weekStart('2026-09-20'), '2026-09-14'); // Sunday belongs to the week before
  assert.equal(weekStart('2026-09-21'), '2026-09-21');
});

test('streaks: no entries', () => {
  assert.deepEqual(streaks([], TODAY, 1), { current: 0, longest: 0 });
});

test('streaks: counts consecutive days ending today', () => {
  assert.deepEqual(streaks(['2026-09-17', '2026-09-18', '2026-09-19'], TODAY, 1), { current: 3, longest: 3 });
});

test('streaks: survives an unlogged today, but not a skipped day', () => {
  assert.equal(streaks(['2026-09-17', '2026-09-18'], TODAY, 1).current, 2);
  assert.equal(streaks(['2026-09-16', '2026-09-17'], TODAY, 1).current, 0);
});

test('streaks: longest run is remembered after a break; duplicates are ignored', () => {
  const days = ['2026-09-01', '2026-09-02', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-19'];
  assert.deepEqual(streaks(days, TODAY, 1), { current: 1, longest: 4 });
});

test('streaks: ignores dates after today', () => {
  assert.deepEqual(streaks(['2026-09-20', '2026-09-21'], TODAY, 1), { current: 0, longest: 0 });
});

test('streaks: weekly steps by seven days', () => {
  const mondays = ['2026-08-31', '2026-09-07', '2026-09-14'];
  assert.deepEqual(streaks(mondays, '2026-09-14', 7), { current: 3, longest: 3 });
  assert.equal(streaks(['2026-08-31', '2026-09-07'], '2026-09-14', 7).current, 2);
  assert.equal(streaks(['2026-08-31'], '2026-09-14', 7).current, 0);
});

test('buildStats: weekly streak counts a week with only daily entries', () => {
  const entries = [
    { cadence: 'daily', period_date: '2026-09-08', mood: 4 }, // week of 09-07
    { cadence: 'daily', period_date: '2026-09-16', mood: 2 }, // week of 09-14
    { cadence: 'weekly', period_date: '2026-08-31', mood: null },
  ];
  const stats = buildStats(entries, TODAY, 4);
  assert.deepEqual(stats.streaks.weekly, { current: 3, longest: 3 });
  assert.deepEqual(stats.streaks.daily, { current: 0, longest: 1 });
  assert.deepEqual(stats.logged, { daily: false, weekly: true });
  assert.deepEqual(stats.totals, { entries: 3, daily: 2, weekly: 1, avgMood: 3 });
});

test('buildStats: per-week buckets cover the window, oldest first', () => {
  const stats = buildStats(
    [
      { cadence: 'daily', period_date: '2026-09-14', mood: 5 },
      { cadence: 'daily', period_date: '2026-09-15', mood: 3 },
      { cadence: 'weekly', period_date: '2026-09-07', mood: null },
      { cadence: 'daily', period_date: '2026-01-01', mood: 1 }, // outside the window
    ],
    TODAY,
    3,
  );
  assert.deepEqual(
    stats.perWeek.map((w) => [w.week, w.daily, w.weekly, w.avgMood]),
    [
      ['2026-08-31', 0, 0, null],
      ['2026-09-07', 0, 1, null],
      ['2026-09-14', 2, 0, 4],
    ],
  );
  assert.deepEqual(stats.range, { from: '2026-08-31', to: '2026-09-20' });
});
