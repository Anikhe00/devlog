import { h } from '../dom.js';
import { PROMPTS } from '../prompts.js';

const REPO = 'https://github.com/Anikhe00/devlog';

// Only things the app really does.
const FEATURES = [
  ['Guided, never blank', 'Five short prompts with coaching hints and example answers, so you always know what to write.'],
  ['Daily or weekly', 'Log at whatever rhythm suits you. Choose per entry, or set a default.'],
  ['Streaks that make sense', 'Day and week streaks. An unlogged "today" doesn\'t reset yours; skipping a whole period does.'],
  ['Markdown built in', 'Bold, code, lists and task lists, with a Preview tab before you save.'],
  ['Find anything', 'Search every entry, filter by tag and date range, and bookmark a filtered view.'],
  ['See the pattern', 'Entries per week, mood over time and your most-used tags.'],
];

/**
 * Each screenshot exists in a dark and a light version and CSS shows the one for the current theme
 * (the theme is a data-theme attribute the user can toggle, so <picture> can't pick it). Everything is
 * lazy except the hero image for the theme you're already in; a hidden lazy image is never fetched.
 */
const shot = (name, w, hgt, alt, { hero = false } = {}) => {
  const light = document.documentElement.dataset.theme === 'light';
  const make = (suffix, cls, current) =>
    h('img', { class: cls, src: `/img/${name}${suffix}.jpg`, width: w, height: hgt, alt, decoding: 'async', loading: hero && current ? 'eager' : 'lazy', fetchpriority: hero && current ? 'high' : null });
  return [make('', 'lp-dark', !light), make('-light', 'lp-light', light)];
};

/** In-page links: the app routes on the URL hash, so these scroll instead of changing it. */
const scrollTo = (id) => (e) => {
  e.preventDefault();
  const target = document.getElementById(id);
  if (!target) return;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
  target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
};

/** The page signed-out visitors see at "/": what DevLog is, and a way in. */
export function landingView({ allowSignup, themeButton }) {
  document.title = 'DevLog: a guided work journal for developers';

  const primary = (cls = 'btn-lg') =>
    allowSignup ? h('a', { class: `btn btn-primary ${cls}`, href: '#/register' }, 'Create your account') : h('a', { class: `btn btn-primary ${cls}`, href: '#/login' }, 'Sign in');

  const nav = h(
    'header',
    { class: 'lp-nav' },
    h(
      'div',
      { class: 'lp-inner lp-nav-inner' },
      h('a', { class: 'brand', href: '#/' }, 'devlog', h('span', { class: 'cursor', 'aria-hidden': 'true' }, '_')),
      h(
        'div',
        { class: 'lp-nav-actions' },
        themeButton,
        h('a', { class: 'btn btn-ghost btn-sm', href: '#/login' }, 'Sign in'),
        allowSignup && h('a', { class: 'btn btn-primary btn-sm', href: '#/register' }, 'Create account'),
      ),
    ),
  );

  const hero = h(
    'section',
    { class: 'lp-hero lp-inner' },
    h('p', { class: 'lp-eyebrow mono' }, '$ devlog new', h('span', { class: 'cursor', 'aria-hidden': 'true' }, '_')),
    h('h1', null, 'A work journal that asks the questions for you.'),
    h('p', { class: 'lp-lead' }, 'Five short prompts, daily or weekly. Capture what you worked on, learned and shipped without ever wondering what to write.'),
    h('div', { class: 'lp-cta' }, primary(), allowSignup && h('a', { class: 'btn btn-lg', href: '#/login' }, 'Sign in')),
    h('p', { class: 'lp-note mono' }, 'Free and open source · Dark by default · Works on your phone'),
    h('figure', { class: 'lp-shot lp-hero-shot' }, shot('new-entry', 1400, 1094, 'The DevLog new-entry form: numbered prompts with coaching hints and example placeholders', { hero: true })),
  );

  const prompts = h(
    'section',
    { class: 'lp-section lp-inner', 'aria-labelledby': 'lp-prompts-h' },
    h('h2', { id: 'lp-prompts-h' }, "Five questions. That's the whole entry."),
    h('p', { class: 'lp-section-lead' }, 'Skip any that don\'t apply. Add tags and a 1–5 mood rating if you like.'),
    h(
      'div',
      { class: 'lp-term' },
      h('div', { class: 'lp-term-bar mono', 'aria-hidden': 'true' }, '$ devlog new --daily'),
      h(
        'ol',
        { class: 'lp-prompts' },
        PROMPTS.map((p, i) => h('li', null, h('span', { class: 'idx mono' }, String(i + 1).padStart(2, '0')), h('div', null, h('p', { class: 'lp-q' }, p.question.daily), h('p', { class: 'lp-hint' }, p.hint.daily)))),
      ),
    ),
  );

  const features = h(
    'section',
    { class: 'lp-section lp-inner', 'aria-labelledby': 'lp-features-h' },
    h('h2', { id: 'lp-features-h' }, 'Built to be opened every day'),
    h('div', { class: 'lp-grid' }, FEATURES.map(([title, body]) => h('div', { class: 'card lp-feature' }, h('h3', null, title), h('p', { class: 'muted' }, body)))),
  );

  const gallery = h(
    'section',
    { class: 'lp-section lp-inner', 'aria-labelledby': 'lp-gallery-h' },
    h('h2', { id: 'lp-gallery-h' }, 'Look back at what you did'),
    h('p', { class: 'lp-section-lead' }, 'Your dashboard picks up where you left off, and the stats show how your weeks add up.'),
    h(
      'div',
      { class: 'lp-gallery' },
      h('figure', { class: 'lp-shot' }, shot('dashboard', 1100, 845, 'The DevLog dashboard: day and week streaks, notes carried over from the last entry, and recent entries'), h('figcaption', { class: 'muted small' }, 'Dashboard')),
      h('figure', { class: 'lp-shot' }, shot('stats', 1100, 946, 'The stats page: entries per week, mood over time and most-used tags'), h('figcaption', { class: 'muted small' }, 'Stats')),
    ),
  );

  const phone = h(
    'section',
    { class: 'lp-section lp-inner lp-split', 'aria-labelledby': 'lp-phone-h' },
    h(
      'div',
      null,
      h('h2', { id: 'lp-phone-h' }, 'A quick check-in, on any screen'),
      h('p', { class: 'lp-section-lead' }, 'On a phone the navigation moves to a tab bar within thumb reach, with a New button in the middle. Dark by default, and a light theme when you want it.'),
    ),
    h('figure', { class: 'lp-shot lp-phone' }, shot('mobile', 480, 1038, 'DevLog on a phone, with a bottom tab bar and a raised New button')),
  );

  const final = h(
    'section',
    { class: 'lp-inner lp-final-wrap' },
    h(
      'div',
      { class: 'lp-final' },
      h('h2', null, "Start today's entry"),
      h('p', { class: 'muted' }, 'It takes about two minutes.'),
      h('div', { class: 'lp-cta' }, primary(), allowSignup && h('a', { class: 'btn btn-lg', href: '#/login' }, 'Sign in')),
    ),
  );

  const link = ([label, href, opts = {}]) =>
    h('li', null, h('a', { href, onclick: opts.onclick, target: opts.external ? '_blank' : null, rel: opts.external ? 'noopener noreferrer' : null }, label));
  const column = (title, items) =>
    h('nav', { class: 'lp-footer-col', 'aria-label': title }, h('h2', { class: 'lp-footer-h mono' }, title), h('ul', null, items.filter(Boolean).map(link)));

  const footer = h(
    'footer',
    { class: 'lp-footer' },
    h(
      'div',
      { class: 'lp-inner' },
      h(
        'div',
        { class: 'lp-footer-top' },
        h(
          'div',
          { class: 'lp-footer-brand' },
          h('a', { class: 'brand', href: '#/' }, 'devlog', h('span', { class: 'cursor', 'aria-hidden': 'true' }, '_')),
          h('p', { class: 'muted' }, 'A guided work journal for developers. Five short prompts, daily or weekly, and no blank page.'),
        ),
        column('Product', [
          ['The five prompts', '#/', { onclick: scrollTo('lp-prompts-h') }],
          ['Features', '#/', { onclick: scrollTo('lp-features-h') }],
          ['Screenshots', '#/', { onclick: scrollTo('lp-gallery-h') }],
        ]),
        column('Get started', [['Sign in', '#/login'], allowSignup && ['Create account', '#/register']]),
        column('Project', [
          ['Source on GitHub', REPO, { external: true }],
          ['Report an issue', `${REPO}/issues`, { external: true }],
          ['MIT licence', `${REPO}/blob/main/LICENSE`, { external: true }],
        ]),
      ),
      h(
        'div',
        { class: 'lp-footer-bottom' },
        h('p', null, `© ${new Date().getFullYear()} DevLog. Open source under the MIT licence.`),
        h('p', { class: 'mono' }, 'Built with Node, Express and libSQL'),
        h('a', { href: '#/', onclick: (e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); } }, 'Back to top ↑'),
      ),
    ),
  );

  return h('div', { class: 'lp' }, nav, h('main', { id: 'main', tabindex: -1 }, hero, prompts, features, gallery, phone, final), footer);
}
