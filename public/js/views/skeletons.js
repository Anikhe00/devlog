import { h } from '../dom.js';

// Loading placeholders. Each mirrors the layout of the page it stands in for (using the same
// container classes), so the content replaces it without the page jumping.

/** One grey block. `w` is any CSS width; `height` is in px. */
const bar = (w, height = 14, cls = '') => {
  const el = h('div', { class: `sk ${cls}`.trim() });
  el.style.width = w;
  el.style.height = `${height}px`;
  return el;
};
const pill = (w, height = 20) => bar(w, height, 'sk-pill');

/** Wraps a placeholder: announced once to screen readers, invisible to them otherwise, and slow to appear so quick loads never flash. */
export function skeleton(children, innerClass = '') {
  return h(
    'div',
    { class: 'skeleton', role: 'status', 'aria-busy': 'true' },
    h('span', { class: 'sr-only' }, 'Loading…'),
    h('div', { class: innerClass, 'aria-hidden': 'true' }, children),
  );
}

const entryCard = () =>
  h(
    'div',
    { class: 'entry-card' },
    h('div', { class: 'entry-card-head' }, bar('9.5rem', 18), h('span', { class: 'sk-spacer' }), pill('3.6rem', 20), pill('3.2rem', 8)),
    h('div', { class: 'sk-stack sk-lines' }, bar('100%', 15), bar('68%', 15)),
    h('div', { class: 'sk-row' }, pill('4.5rem', 22), pill('3.5rem', 22)),
  );
const entryCards = (n) => Array.from({ length: n }, entryCard);

/** Cards for the History list's first load (it renders in place, after the page shell is up). */
export const entryListSkeleton = (n = 6) => skeleton([bar('7rem', 12), ...entryCards(n)], 'entry-list');

const streakCard = () =>
  h('div', { class: 'card streak' }, bar('3.2rem', 52), h('div', { class: 'sk-stack sk-grow' }, bar('7rem', 16), bar('11rem', 13), bar('5rem', 13)));

const tile = () => h('div', { class: 'tile sk-stack' }, bar('3.5rem', 30), bar('6rem', 14), bar('8rem', 12));
const chartCard = () =>
  h('section', { class: 'card chart-card' }, h('div', { class: 'chart-head' }, bar('10rem', 20), bar('12rem', 14)), bar('100%', 210, 'sk-chart'), bar('7rem', 14));
const tagsCard = () =>
  h(
    'section',
    { class: 'card chart-card' },
    h('div', { class: 'chart-head' }, bar('9rem', 20), bar('11rem', 14)),
    h('div', { class: 'sk-stack' }, ['62%', '54%', '34%', '26%', '20%', '18%'].map((w) => h('div', { class: 'sk-row sk-tagrow' }, pill('5.5rem', 22), bar(w, 10)))),
  );

const prompt = () => h('div', { class: 'prompt' }, bar('17rem', 18), bar('13rem', 12), bar('100%', 104, 'sk-field'));

export const skeletons = {
  dashboard: () =>
    skeleton([
      h('section', { class: 'hero' }, h('div', { class: 'sk-stack sk-lines' }, bar('9rem', 13), bar('15rem', 32)), bar('9.5rem', 46, 'sk-hero-btn')),
      h('div', { class: 'streaks' }, streakCard(), streakCard()),
      h('section', { class: 'card callout' }, bar('45%', 12), bar('60%', 14), bar('72%', 16), bar('52%', 16), bar('34%', 14)),
      h('section', null, h('div', { class: 'section-head' }, bar('9rem', 20), bar('4.5rem', 14)), h('div', { class: 'entry-list' }, entryCards(5))),
    ]),

  history: () =>
    skeleton([
      h('div', { class: 'section-head' }, bar('7rem', 28)),
      h('div', { class: 'filters' }, h('div', { class: 'searchbar' }, bar('100%', 42, 'sk-grow'), bar('5.5rem', 42))),
      h('div', { class: 'entry-list' }, [bar('7rem', 12), ...entryCards(7)]),
    ]),

  stats: () =>
    skeleton([
      h('div', { class: 'section-head' }, bar('6rem', 28), bar('15rem', 42)),
      h('div', { class: 'stats-body' }, h('div', { class: 'tiles' }, [tile(), tile(), tile(), tile()]), chartCard(), chartCard(), tagsCard()),
    ]),

  entry: () =>
    skeleton([
      h('div', { class: 'crumbs' }, bar('5.5rem', 14), bar('8rem', 30)),
      h('header', { class: 'entry-head' }, h('div', { class: 'entry-meta' }, pill('3.6rem', 20), pill('3.4rem', 8)), bar('17rem', 30), h('div', { class: 'sk-row' }, pill('4.5rem', 22), pill('3.5rem', 22))),
      h(
        'div',
        { class: 'entry-body' },
        [3, 2, 3].map((lines) =>
          h('section', { class: 'entry-section' }, bar('6rem', 12), ...['92%', '78%', '85%'].slice(0, lines).map((w) => bar(w, 15))),
        ),
      ),
    ]),

  editor: () =>
    skeleton([
      h('div', { class: 'page-head' }, bar('10rem', 28), bar('16rem', 16)),
      h('div', { class: 'editor' }, h('div', { class: 'editor-top' }, bar('14rem', 42), bar('12rem', 42)), bar('9rem', 34), h('div', { class: 'write-pane' }, [1, 2, 3, 4, 5].map(prompt), h('div', { class: 'prompt' }, bar('5rem', 18), bar('100%', 44, 'sk-field'), bar('14rem', 40)))),
    ]),

};
