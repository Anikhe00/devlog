// Calendar math on plain YYYY-MM-DD strings. Everything is done in UTC so the
// result never depends on the server's timezone or DST; the *client* decides
// what "today" is and sends it along.

const DAY_MS = 86_400_000;

const parse = (iso) => Date.parse(`${iso}T00:00:00Z`);
const format = (ms) => new Date(ms).toISOString().slice(0, 10);

export function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = parse(value);
  return !Number.isNaN(ms) && format(ms) === value;
}

export const addDays = (iso, n) => format(parse(iso) + n * DAY_MS);

export const diffDays = (from, to) => Math.round((parse(to) - parse(from)) / DAY_MS);

/** Monday of the week containing `iso` (weeks run Mon–Sun). */
export function weekStart(iso) {
  const sinceMonday = (new Date(parse(iso)).getUTCDay() + 6) % 7;
  return addDays(iso, -sinceMonday);
}

export const todayUtc = () => new Date().toISOString().slice(0, 10);
