// Local-timezone calendar helpers on YYYY-MM-DD strings. The server never guesses
// the user's timezone; "today" always comes from here.

const pad = (n) => String(n).padStart(2, '0');

export const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromIso = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const todayIso = () => toIso(new Date());

export function addDays(iso, n) {
  const d = fromIso(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
}

/** Monday of the week containing `iso`. */
export const weekStart = (iso) => addDays(iso, -((fromIso(iso).getDay() + 6) % 7));

const fmt = (options) => {
  const f = new Intl.DateTimeFormat(undefined, options);
  return (iso) => f.format(fromIso(iso));
};
export const formatDay = fmt({ weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
export const formatShort = fmt({ month: 'short', day: 'numeric' });
export const formatMonth = fmt({ month: 'long', year: 'numeric' });
export const formatLong = fmt({ weekday: 'long', month: 'long', day: 'numeric' });

/** "Sep 14 – 20, 2026", "Aug 31 – Sep 6, 2026", or with both years when the week spans New Year. */
export function formatWeek(mondayIso) {
  const start = fromIso(mondayIso);
  const end = fromIso(addDays(mondayIso, 6));
  const month = (d) => d.toLocaleDateString(undefined, { month: 'short' });
  if (start.getFullYear() !== end.getFullYear()) {
    return `${formatShort(mondayIso)}, ${start.getFullYear()} – ${formatShort(toIso(end))}, ${end.getFullYear()}`;
  }
  const endText = start.getMonth() === end.getMonth() ? end.getDate() : `${month(end)} ${end.getDate()}`;
  return `${month(start)} ${start.getDate()} – ${endText}, ${start.getFullYear()}`;
}

export const entryTitle = (entry) =>
  entry.cadence === 'weekly' ? `Week of ${formatWeek(entry.period_date)}` : formatDay(entry.period_date);
