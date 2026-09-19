import { api, qs } from '../api.js';
import { formatShort, formatWeek, todayIso } from '../dates.js';
import { h, setTitle } from '../dom.js';
import { MOODS } from '../prompts.js';
import { replaceUrl } from '../router.js';
import { barChart, dataTable, lineChart } from '../charts.js';
import { emptyState, errorView } from './parts.js';

const RANGES = [12, 26, 52];
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const weekLabel = (w) => `Week of ${formatWeek(w.week)}`;

function tile(label, value, sub) {
  return h('div', { class: 'tile' }, h('div', { class: 'tile-value mono' }, value), h('div', { class: 'tile-label' }, label), sub && h('div', { class: 'muted small' }, sub));
}

function chartCard({ title, subtitle, body }) {
  return h('section', { class: 'card chart-card' }, h('div', { class: 'chart-head' }, h('h2', null, title), h('p', { class: 'muted small' }, subtitle)), body);
}

function render(data, weeks) {
  const { totals, streaks, perWeek, topTags } = data;
  if (totals.entries === 0) {
    return [emptyState({ title: 'No stats yet.', body: 'Write your first entry and this page fills in.', action: h('a', { class: 'btn btn-primary', href: '#/new' }, '+ New Entry') })];
  }

  const tiles = h(
    'div',
    { class: 'tiles' },
    tile('Entries', String(totals.entries), `${totals.daily} daily · ${totals.weekly} weekly`),
    tile('Day streak', String(streaks.daily.current), `best ${streaks.daily.longest}`),
    tile('Week streak', String(streaks.weekly.current), `best ${streaks.weekly.longest}`),
    tile('Avg mood', totals.avgMood == null ? '–' : totals.avgMood.toFixed(1), totals.avgMood == null ? 'no ratings yet' : 'out of 5'),
  );

  const inRange = perWeek.reduce((sum, w) => sum + w.daily + w.weekly, 0);
  const activity = chartCard({
    title: 'Entries per week',
    subtitle: `${plural(inRange, 'entry', 'entries')} in the last ${weeks} weeks`,
    body: [
      barChart({
        data: perWeek.map((w) => ({ ...w, label: formatShort(w.week), value: w.daily + w.weekly })),
        ariaLabel: `Bar chart of entries per week over the last ${weeks} weeks`,
        describe: (w) => ({ value: plural(w.value, 'entry', 'entries'), label: weekLabel(w), lines: w.value ? [`${w.daily} daily · ${w.weekly} weekly`] : [] }),
      }),
      dataTable({ columns: ['Week of', 'Daily', 'Weekly', 'Total'], rows: perWeek.map((w) => [formatShort(w.week), w.daily, w.weekly, w.daily + w.weekly]) }),
    ],
  });

  const rated = perWeek.some((w) => w.avgMood != null);
  const mood = chartCard({
    title: 'Mood and energy',
    subtitle: 'Average rating per week, 1 (drained) to 5 (energised)',
    body: rated
      ? [
          lineChart({
            data: perWeek.map((w) => ({ ...w, label: formatShort(w.week), value: w.avgMood })),
            ariaLabel: `Line chart of average mood per week over the last ${weeks} weeks`,
            describe: (w) => ({ value: w.avgMood == null ? 'no rating' : `${w.avgMood.toFixed(1)} / 5`, label: weekLabel(w), lines: w.avgMood == null ? [] : [MOODS[Math.round(w.avgMood) - 1]] }),
          }),
          dataTable({ columns: ['Week of', 'Average mood'], rows: perWeek.map((w) => [formatShort(w.week), w.avgMood ?? '–']) }),
        ]
      : h('p', { class: 'muted' }, 'No mood ratings in this period. Rate a few entries and the trend shows up here.'),
  });

  const max = Math.max(1, ...topTags.map((t) => t.count));
  const tags = chartCard({
    title: 'Most-used tags',
    subtitle: `Across the last ${weeks} weeks`,
    body: topTags.length
      ? h(
          'ul',
          { class: 'bars' },
          topTags.map((t) => {
            const fill = h('span', { class: 'bar-fill' });
            fill.style.width = `${(t.count / max) * 100}%`;
            return h('li', null, h('a', { class: 'tag', href: `#/history?tag=${encodeURIComponent(t.tag)}` }, `#${t.tag}`), h('span', { class: 'bar-track' }, fill), h('span', { class: 'bar-count mono' }, String(t.count)));
          }),
        )
      : h('p', { class: 'muted' }, 'No tags in this period. Tag entries (#frontend, #bug…) to see what you spend time on.'),
  });

  return [tiles, activity, mood, tags];
}

export async function statsView({ query }) {
  setTitle('Stats');
  let weeks = RANGES.includes(Number(query.get('weeks'))) ? Number(query.get('weeks')) : 12;
  const today = todayIso();
  const fetchStats = () => api.get(`/api/stats?${qs({ today, weeks })}`);

  const body = h('div', { class: 'stats-body' }, ...render(await fetchStats(), weeks));

  async function reload() {
    body.classList.add('is-loading'); // keep the old charts on screen, dimmed, while refetching
    try {
      body.replaceChildren(...render(await fetchStats(), weeks));
    } catch (err) {
      body.replaceChildren(errorView(err, reload));
    } finally {
      body.classList.remove('is-loading');
    }
  }

  const range = h(
    'div',
    { class: 'segmented', role: 'radiogroup', 'aria-label': 'Time range' },
    RANGES.map((n) =>
      h(
        'label',
        { class: 'seg' },
        h('input', {
          type: 'radio',
          name: 'range',
          value: n,
          checked: n === weeks,
          onchange: () => {
            weeks = n;
            replaceUrl(`/stats?weeks=${n}`);
            reload();
          },
        }),
        h('span', null, `${n} weeks`),
      ),
    ),
  );

  return h('div', null, h('div', { class: 'section-head' }, h('h1', null, 'Stats'), range), body);
}
