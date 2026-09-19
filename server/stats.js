import { addDays, diffDays, weekStart } from './dates.js';

/**
 * Current and longest run of consecutive periods.
 *
 * `periods` are period-start dates (a day for daily streaks, a Monday for weekly
 * ones) and `current` is the period containing "now". A streak stays alive if
 * the current period hasn't been logged *yet* but the previous one was — you
 * only lose it by skipping a whole period.
 */
export function streaks(periods, current, stepDays) {
  const seen = new Set(periods.filter((p) => p <= current));
  if (seen.size === 0) return { current: 0, longest: 0 };

  const sorted = [...seen].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = diffDays(sorted[i - 1], sorted[i]) === stepDays ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  let cursor = seen.has(current) ? current : addDays(current, -stepDays);
  let now = 0;
  while (seen.has(cursor)) {
    now++;
    cursor = addDays(cursor, -stepDays);
  }
  return { current: now, longest };
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * @param entries rows of { cadence, period_date, mood }
 * @param today   the client's local date (YYYY-MM-DD)
 * @param weeks   how many weeks (ending with the current one) to chart
 */
export function buildStats(entries, today, weeks) {
  const thisWeek = weekStart(today);
  const firstWeek = addDays(thisWeek, -7 * (weeks - 1));

  const dailyDates = entries.filter((e) => e.cadence === 'daily').map((e) => e.period_date);
  // A week counts as "logged" if it has any entry — daily or weekly.
  const loggedWeeks = entries.map((e) => weekStart(e.period_date));

  const perWeek = new Map();
  for (let i = 0; i < weeks; i++) {
    const week = addDays(firstWeek, 7 * i);
    perWeek.set(week, { week, daily: 0, weekly: 0, moodSum: 0, moodCount: 0 });
  }
  for (const e of entries) {
    const bucket = perWeek.get(weekStart(e.period_date));
    if (!bucket) continue;
    bucket[e.cadence]++;
    if (e.mood) {
      bucket.moodSum += e.mood;
      bucket.moodCount++;
    }
  }

  const rated = entries.filter((e) => e.mood);
  return {
    totals: {
      entries: entries.length,
      daily: dailyDates.length,
      weekly: entries.length - dailyDates.length,
      avgMood: rated.length ? round2(rated.reduce((s, e) => s + e.mood, 0) / rated.length) : null,
    },
    streaks: {
      daily: streaks(dailyDates, today, 1),
      weekly: streaks(loggedWeeks, thisWeek, 7),
    },
    logged: {
      daily: dailyDates.includes(today),
      weekly: loggedWeeks.includes(thisWeek),
    },
    range: { from: firstWeek, to: addDays(thisWeek, 6) },
    perWeek: [...perWeek.values()].map(({ moodSum, moodCount, ...b }) => ({
      ...b,
      avgMood: moodCount ? round2(moodSum / moodCount) : null,
    })),
  };
}
