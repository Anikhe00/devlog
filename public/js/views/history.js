import { api, qs } from '../api.js';
import { formatMonth, formatShort } from '../dates.js';
import { debounce, h, setTitle } from '../dom.js';
import { replaceUrl } from '../router.js';
import { emptyState, entryCard, errorView } from './parts.js';

const PAGE_SIZE = 20;

export async function historyView({ query }) {
  setTitle('History');
  const { tags: knownTags } = await api.get('/api/tags');

  // The URL is the source of truth for filters, so a filtered view can be bookmarked or shared.
  const filters = {
    q: query.get('q') ?? '',
    tag: query.getAll('tag'),
    from: query.get('from') ?? '',
    to: query.get('to') ?? '',
    cadence: query.get('cadence') ?? '',
  };
  const isFiltered = () => Object.values(filters).some((v) => (Array.isArray(v) ? v.length : v));

  let offset = 0;
  let lastMonth = null;
  let requestId = 0;

  const list = h('div', { class: 'entry-list' });
  const more = h('button', { class: 'btn', type: 'button', hidden: true, onclick: () => load(false) }, 'Load more');
  const notice = h('div');
  const activeChips = h('ul', { class: 'tags filter-chips' });
  const summary = h('div', { class: 'filter-summary' });
  const clear = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: resetFilters }, 'Clear filters');

  const search = h('input', {
    type: 'search',
    id: 'q',
    placeholder: 'Search entries…',
    value: filters.q,
    autocomplete: 'off',
    spellcheck: false,
    oninput: debounce(() => update({ q: search.value.trim() }), 250),
  });
  const from = h('input', { type: 'date', id: 'from', value: filters.from, onchange: () => update({ from: from.value }) });
  const to = h('input', { type: 'date', id: 'to', value: filters.to, onchange: () => update({ to: to.value }) });
  const cadence = h(
    'select',
    { id: 'cadence', onchange: () => update({ cadence: cadence.value }) },
    h('option', { value: '' }, 'All logs'),
    h('option', { value: 'daily' }, 'Daily only'),
    h('option', { value: 'weekly' }, 'Weekly only'),
  );
  cadence.value = filters.cadence;
  const tagSelect = h(
    'select',
    {
      id: 'tag',
      disabled: knownTags.length === 0,
      onchange: () => {
        if (tagSelect.value && !filters.tag.includes(tagSelect.value)) update({ tag: [...filters.tag, tagSelect.value] });
        tagSelect.value = '';
      },
    },
    h('option', { value: '' }, knownTags.length ? 'Add tag filter…' : 'No tags yet'),
    knownTags.map((t) => h('option', { value: t.tag }, `#${t.tag} (${t.count})`)),
  );

  // Everything except the search box lives in a collapsible panel; what's active shows as chips.
  const panel = h(
    'div',
    { class: 'filter-panel', id: 'filter-panel', hidden: true },
    h('div', { class: 'field' }, h('label', { for: 'from' }, 'From'), from),
    h('div', { class: 'field' }, h('label', { for: 'to' }, 'To'), to),
    h('div', { class: 'field' }, h('label', { for: 'cadence' }, 'Type'), cadence),
    h('div', { class: 'field' }, h('label', { for: 'tag' }, 'Tag'), tagSelect),
  );
  const toggleBadge = h('span', { class: 'badge-count mono' });
  const toggle = h(
    'button',
    { class: 'btn', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'filter-panel', onclick: () => setPanel(panel.hidden) },
    'Filters',
    toggleBadge,
  );
  function setPanel(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  }

  const activeCount = () => filters.tag.length + [filters.from, filters.to, filters.cadence].filter(Boolean).length;

  const chip = (text, what, onRemove) =>
    h('li', null, h('button', { class: 'tag tag-removable', type: 'button', 'aria-label': `Remove filter: ${what}`, onclick: onRemove }, `${text} ×`));

  function renderChips() {
    activeChips.replaceChildren(
      ...[
        ...filters.tag.map((tag) => chip(`#${tag}`, `tag ${tag}`, () => update({ tag: filters.tag.filter((t) => t !== tag) }))),
        filters.from && chip(`from ${formatShort(filters.from)}`, 'from date', () => update({ from: '' })),
        filters.to && chip(`to ${formatShort(filters.to)}`, 'to date', () => update({ to: '' })),
        filters.cadence && chip(`${filters.cadence} only`, 'log type', () => update({ cadence: '' })),
      ].filter(Boolean),
    );
  }

  function syncControls() {
    search.value = filters.q;
    from.value = filters.from;
    to.value = filters.to;
    cadence.value = filters.cadence;
    renderChips();
    const n = activeCount();
    toggleBadge.textContent = String(n);
    toggleBadge.hidden = n === 0;
    clear.hidden = !isFiltered();
    summary.hidden = !isFiltered(); // no filters, no row: keeps the list snug under the search bar
  }

  function update(patch) {
    Object.assign(filters, patch);
    replaceUrl(`/history${isFiltered() ? `?${qs(filters)}` : ''}`);
    syncControls();
    load(true);
  }

  function resetFilters() {
    update({ q: '', tag: [], from: '', to: '', cadence: '' });
  }

  async function load(reset) {
    const id = ++requestId;
    if (reset) {
      offset = 0;
      lastMonth = null;
      list.classList.add('is-loading');
    }
    more.disabled = true;
    try {
      const res = await api.get(`/api/entries?${qs({ ...filters, limit: PAGE_SIZE, offset })}`);
      if (id !== requestId) return;
      notice.replaceChildren();
      if (reset) list.replaceChildren();

      for (const entry of res.entries) {
        const month = formatMonth(entry.period_date);
        if (month !== lastMonth) {
          list.append(h('h2', { class: 'month' }, month));
          lastMonth = month;
        }
        list.append(entryCard(entry));
      }
      offset += res.entries.length;
      more.hidden = offset >= res.total;

      if (res.total === 0) {
        notice.append(
          isFiltered()
            ? emptyState({ title: 'No entries match those filters.', action: h('button', { class: 'btn', type: 'button', onclick: resetFilters }, 'Clear filters') })
            : emptyState({ title: 'No entries yet.', body: 'Your history will build up here.', action: h('a', { class: 'btn btn-primary', href: '#/new' }, '+ New Entry') }),
        );
      }
    } catch (err) {
      if (id !== requestId) return;
      notice.replaceChildren(errorView(err, () => load(reset)));
    } finally {
      if (id === requestId) {
        list.classList.remove('is-loading');
        more.disabled = false;
      }
    }
  }

  summary.append(activeChips, clear);
  syncControls();
  load(true);

  return h(
    'div',
    null,
    h('div', { class: 'section-head' }, h('h1', null, 'History')),
    h(
      'form',
      { class: 'filters', role: 'search', onsubmit: (e) => e.preventDefault() },
      h('div', { class: 'searchbar' }, h('label', { for: 'q', class: 'sr-only' }, 'Search'), search, toggle),
      panel,
    ),
    summary,
    list,
    notice,
    h('div', { class: 'more' }, more),
  );
}
