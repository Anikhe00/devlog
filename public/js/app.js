import { ApiError, api, setUnauthorizedHandler } from './api.js';
import { h, storage, svg } from './dom.js';
import { navigate, parseHash } from './router.js';
import { state } from './state.js';
import { authView } from './views/auth.js';
import { dashboardView } from './views/dashboard.js';
import { editEntryView, newEntryView } from './views/editor.js';
import { entryView } from './views/entry.js';
import { historyView } from './views/history.js';
import { errorView, loading } from './views/parts.js';
import { settingsView } from './views/settings.js';
import { statsView } from './views/stats.js';

const root = document.getElementById('app');
let navigation = 0;

const routes = [
  [/^\/$/, dashboardView, '/'],
  [/^\/new$/, newEntryView, '/new'],
  [/^\/history$/, historyView, '/history'],
  [/^\/stats$/, statsView, '/stats'],
  [/^\/settings$/, () => settingsView({ onSignOut: signOut }), '/settings'],
  [/^\/entry\/(\d+)$/, entryView, '/history'],
  [/^\/entry\/(\d+)\/edit$/, editEntryView, '/history'],
];

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  storage.set('devlog:theme', next);
  themeButton.setAttribute('aria-label', `Switch to ${next === 'light' ? 'dark' : 'light'} theme`);
}
const themeButton = h('button', { class: 'icon-btn', type: 'button', onclick: toggleTheme, title: 'Toggle theme', 'aria-label': 'Switch to light theme' }, '◐');

// Desktop: nav links live in the top bar. Phones: they move to a bottom tab bar (see tabbar()).
function nav(active) {
  const link = (href, label) => h('a', { href: `#${href}`, 'aria-current': active === href ? 'page' : null }, label);
  return h(
    'header',
    { class: 'topbar' },
    h(
      'div',
      { class: 'topbar-inner' },
      h('a', { class: 'brand', href: '#/' }, 'devlog', h('span', { class: 'cursor', 'aria-hidden': 'true' }, '_')),
      h('nav', { 'aria-label': 'Main' }, link('/', 'Dashboard'), link('/history', 'History'), link('/stats', 'Stats')),
      h('div', { class: 'topbar-actions' }, active !== '/' && h('a', { class: 'btn btn-primary btn-sm', href: '#/new' }, '+ New Entry'), themeButton, h('a', { class: 'icon-btn', href: '#/settings', title: 'Settings', 'aria-label': 'Settings', 'aria-current': active === '/settings' ? 'page' : null }, '⚙')),
    ),
  );
}

const icon = (...shapes) =>
  svg('svg', { viewBox: '0 0 24 24', width: 24, height: 24, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, shapes);
const path = (d) => svg('path', { d });
const circle = (cx, cy, r) => svg('circle', { cx, cy, r });

/** Phone-only bottom tab bar (hidden by CSS on wider screens): four destinations plus a raised New button. */
function tabbar(active) {
  const tab = (href, label, glyph, extra = {}) =>
    h('a', { class: extra.class ?? 'tab-item', href: `#${href}`, 'aria-current': active === href ? 'page' : null }, extra.wrap ? h('span', { class: 'tab-plus' }, glyph) : glyph, h('span', { class: 'tab-label' }, label));
  return h(
    'nav',
    { class: 'tabbar', 'aria-label': 'Main' },
    tab('/', 'Home', icon(path('M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'))),
    tab('/history', 'History', icon(path('M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'))),
    tab('/new', 'New', icon(path('M12 5v14M5 12h14')), { class: 'tab-item tab-new', wrap: true }),
    tab('/stats', 'Stats', icon(path('M5 20V11M12 20V4M19 20v-6'))),
    tab('/settings', 'Settings', icon(path('M20 7h-9M14 17H5'), circle(17, 17, 3), circle(7, 7, 3))),
  );
}

async function signOut() {
  try {
    await api.post('/api/auth/logout');
  } catch {}
  state.user = null;
  navigate('/login');
}

async function render() {
  const current = ++navigation;
  const { path, query } = parseHash();

  if (!state.user) {
    if (path !== '/login' && path !== '/register') return navigate('/login', { replace: true });
    const mode = path === '/register' && state.allowSignup ? 'register' : 'login';
    root.replaceChildren(authView(mode, { allowSignup: state.allowSignup, onAuthed: (user) => { state.user = user; navigate('/'); } }));
    document.getElementById('email')?.focus();
    return;
  }
  if (path === '/login' || path === '/register') return navigate('/', { replace: true });

  const route = routes.find(([re]) => re.test(path));
  const main = h('main', { id: 'main', class: 'container', tabindex: -1 }, loading());
  const writing = /^\/(new|entry\/\d+\/edit)$/.test(path);
  // Not our h() helper: the DOM's replaceChildren turns a null argument into the text "null", so leave it out.
  root.replaceChildren(...[nav(route?.[2] ?? ''), main, writing ? null : tabbar(route?.[2] ?? '')].filter(Boolean));

  try {
    if (!route) throw new ApiError(404, 'Not found');
    const params = route[0].exec(path).slice(1);
    const view = await route[1]({ params, query, path });
    if (current !== navigation) return; // the user has already moved on
    main.replaceChildren(view);
  } catch (err) {
    if (current !== navigation) return;
    main.replaceChildren(errorView(err, render));
  }
  window.scrollTo(0, 0);
}

setUnauthorizedHandler(() => {
  if (!state.user) return;
  state.user = null;
  render();
});

async function boot() {
  try {
    const me = await api.get('/api/auth/me');
    state.user = me.user;
    state.allowSignup = me.allowSignup;
  } catch (err) {
    root.replaceChildren(errorView(err, () => location.reload()));
    return;
  }
  themeButton.setAttribute('aria-label', `Switch to ${document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'} theme`);
  window.addEventListener('hashchange', render);
  render();
}

boot();
