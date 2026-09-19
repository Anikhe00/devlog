import { api } from '../api.js';
import { entryTitle } from '../dates.js';
import { h, setTitle } from '../dom.js';
import { navigate } from '../router.js';
import { MOODS } from '../prompts.js';
import { cadenceBadge, entryBody, moodDots, tagList } from './parts.js';

/** Title, type, mood and tags. Shared by the detail page and the editor preview. */
export function entryHeader(entry) {
  return h(
    'header',
    { class: 'entry-head' },
    h('div', { class: 'entry-meta' }, cadenceBadge(entry.cadence), entry.mood && moodDots(entry.mood), entry.mood && h('span', { class: 'muted small mono' }, MOODS[entry.mood - 1])),
    h('h1', null, entryTitle(entry)),
    tagList(entry.tags),
  );
}

export async function entryView({ params: [id] }) {
  const { entry } = await api.get(`/api/entries/${id}`);
  setTitle(entryTitle(entry));

  const confirmDelete = h('button', { class: 'btn btn-danger btn-sm', type: 'button', hidden: true }, 'Yes, delete');
  const cancel = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', hidden: true }, 'Cancel');
  const del = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Delete');
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });

  const toggle = (asking) => {
    del.hidden = asking;
    confirmDelete.hidden = cancel.hidden = !asking;
    if (asking) confirmDelete.focus();
    else del.focus();
  };
  del.onclick = () => toggle(true);
  cancel.onclick = () => toggle(false);
  confirmDelete.onclick = async () => {
    confirmDelete.disabled = true;
    try {
      await api.del(`/api/entries/${entry.id}`);
      navigate('/history');
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      confirmDelete.disabled = false;
    }
  };

  const edited = entry.updated_at.slice(0, 16) !== entry.created_at.slice(0, 16);
  return h(
    'article',
    { class: 'entry' },
    h(
      'div',
      { class: 'crumbs' },
      h('a', { href: '#/history' }, '← History'),
      h('div', { class: 'actions' }, h('a', { class: 'btn btn-sm', href: `#/entry/${entry.id}/edit` }, 'Edit'), del, cancel, confirmDelete),
    ),
    error,
    entryHeader(entry),
    entryBody(entry),
    h('p', { class: 'muted small mono entry-foot' }, `written ${new Date(entry.created_at).toLocaleString()}${edited ? ` · edited ${new Date(entry.updated_at).toLocaleString()}` : ''}`),
  );
}
