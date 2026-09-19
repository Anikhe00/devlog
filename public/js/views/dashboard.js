import { api, qs } from '../api.js';
import { formatDay, formatLong, todayIso } from '../dates.js';
import { h, setTitle } from '../dom.js';
import { renderMarkdown } from '../md.js';
import { state } from '../state.js';
import { emptyState, entryCard } from './parts.js';

function streakCard({ streak, logged, unit, period, primary }) {
  const { current, longest } = streak;
  let status;
  if (current > 0 && logged) status = `Logged ${period}. Nice.`;
  else if (current > 0) status = `Log ${period} to keep it going.`;
  else status = logged ? `Logged ${period}.` : `Log an entry ${period} to start a streak.`;

  return h(
    'section',
    { class: primary ? 'card streak is-primary' : 'card streak', 'aria-label': `${unit} streak` },
    h('div', { class: 'streak-num mono' }, String(current)),
    h('div', { class: 'streak-body' }, h('h2', { class: 'streak-label' }, `${unit} streak`), h('p', { class: 'muted small' }, status), h('p', { class: 'muted small mono' }, `best: ${longest}`)),
  );
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 5 ? 'Burning the midnight oil.' : hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : 'Good evening.';
}

export async function dashboardView() {
  setTitle('Dashboard');
  const today = todayIso();
  const [stats, recent] = await Promise.all([api.get(`/api/stats?${qs({ today, weeks: 1 })}`), api.get('/api/entries?limit=5')]);

  const preferred = state.user.default_cadence;
  const other = preferred === 'daily' ? 'weekly' : 'daily';
  const cards = {
    daily: streakCard({ streak: stats.streaks.daily, logged: stats.logged.daily, unit: 'Day', period: 'today', primary: preferred === 'daily' }),
    weekly: streakCard({ streak: stats.streaks.weekly, logged: stats.logged.weekly, unit: 'Week', period: 'this week', primary: preferred === 'weekly' }),
  };

  const hero = h(
    'section',
    { class: 'hero' },
    h('div', null, h('p', { class: 'eyebrow mono' }, formatLong(today)), h('h1', null, greeting())),
    h('a', { class: 'btn btn-primary btn-lg', href: `#/new?cadence=${preferred}` }, '+ New Entry'),
  );

  if (stats.totals.entries === 0) {
    return h(
      'div',
      null,
      hero,
      emptyState({
        title: 'Your log is empty.',
        body: 'Your first entry takes about two minutes: five short prompts, no blank page. Streaks and stats will show up here once you have a few.',
        action: h('a', { class: 'btn btn-primary', href: `#/new?cadence=${preferred}` }, 'Write your first entry'),
      }),
    );
  }

  const withNext = recent.entries.find((e) => e.next_steps.trim());
  return h(
    'div',
    null,
    hero,
    h('div', { class: 'streaks' }, cards[preferred], cards[other]),
    withNext &&
      h(
        'section',
        { class: 'card callout' },
        h('h2', { class: 'section-label' }, 'Picking up where you left off'),
        h('p', { class: 'muted small' }, `Your notes for next time, from ${withNext.cadence === 'weekly' ? 'the week of ' : ''}${formatDay(withNext.period_date)}:`),
        renderMarkdown(withNext.next_steps),
        h('a', { class: 'small', href: `#/entry/${withNext.id}` }, 'Open entry →'),
      ),
    h(
      'section',
      null,
      h('div', { class: 'section-head' }, h('h2', null, 'Recent entries'), h('a', { class: 'small', href: '#/history' }, 'View all →')),
      h('div', { class: 'entry-list' }, recent.entries.map(entryCard)),
    ),
  );
}
