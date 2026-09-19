import { api, qs } from '../api.js';
import { addDays, formatWeek, todayIso, weekStart } from '../dates.js';
import { debounce, h, setTitle, storage } from '../dom.js';
import { CADENCES, MARKDOWN_HINT, MOODS, PROMPTS, TAG_PLACEHOLDER } from '../prompts.js';
import { navigate } from '../router.js';
import { state } from '../state.js';
import { entryBody } from './parts.js';
import { entryHeader } from './entry.js';

const MAX_TAGS = 12;
const normalizeTag = (raw) =>
  raw
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_\-./+]/g, '')
    .slice(0, 30);

const autosize = (textarea) => {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight + 2}px`;
};

/** Chips + a text box. Space, comma or Enter commits a tag; Backspace removes the last. */
function tagField({ tags, suggestions, onChange }) {
  const chips = h('span', { class: 'chips' });
  const input = h('input', {
    id: 'tags',
    type: 'text',
    placeholder: tags.length ? '' : TAG_PLACEHOLDER,
    autocomplete: 'off',
    spellcheck: false,
    'aria-describedby': 'tags-hint',
  });
  const suggest = h('div', { class: 'suggest' });

  function add(raw) {
    for (const t of raw.map(normalizeTag).filter(Boolean)) {
      if (tags.length < MAX_TAGS && !tags.includes(t)) tags.push(t);
    }
    render();
    onChange();
  }
  function remove(tag) {
    tags.splice(tags.indexOf(tag), 1);
    render();
    onChange();
    input.focus();
  }
  function render() {
    chips.replaceChildren(
      ...tags.map((tag) =>
        h('span', { class: 'tag chip' }, `#${tag}`, h('button', { type: 'button', 'aria-label': `Remove tag ${tag}`, onclick: () => remove(tag) }, '×')),
      ),
    );
    input.placeholder = tags.length ? '' : TAG_PLACEHOLDER;
    const options = suggestions.filter((t) => !tags.includes(t)).slice(0, 8);
    suggest.replaceChildren(
      ...(options.length && tags.length < MAX_TAGS
        ? [h('span', { class: 'muted small' }, 'Recent:'), ...options.map((t) => h('button', { class: 'tag tag-btn', type: 'button', onclick: () => add([t]) }, `#${t}`))]
        : []),
    );
  }

  input.addEventListener('input', () => {
    const parts = input.value.split(/[\s,]+/);
    const rest = parts.pop(); // still being typed
    if (parts.length) {
      add(parts);
      input.value = rest;
    }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      add([input.value]);
      input.value = '';
    } else if (e.key === 'Backspace' && !input.value && tags.length) {
      remove(tags.at(-1));
    }
  });
  input.addEventListener('blur', () => {
    if (input.value) {
      add([input.value]);
      input.value = '';
    }
  });

  render();
  return {
    el: h('div', null, h('div', { class: 'tag-field', onclick: () => input.focus() }, chips, input), suggest),
    flush() {
      if (input.value) add([input.value]);
      input.value = '';
    },
  };
}

const draftKey = () => `devlog:draft:${state.user.id}`;

function editor({ entry, cadence: startCadence, explicitCadence = false, tagSuggestions }) {
  const isNew = !entry;
  const model = {
    cadence: entry?.cadence ?? startCadence,
    date: entry?.period_date ?? todayIso(),
    fields: Object.fromEntries(PROMPTS.map((p) => [p.key, entry?.[p.key] ?? ''])),
    tags: [...(entry?.tags ?? [])],
    mood: entry?.mood ?? null,
  };

  // Restore an unsaved draft of a new entry (e.g. after an accidental navigation).
  let restored = false;
  if (isNew) {
    try {
      const draft = JSON.parse(storage.get(draftKey()) ?? 'null');
      if (draft?.fields) {
        Object.assign(model.fields, draft.fields);
        model.tags = Array.isArray(draft.tags) ? draft.tags.slice(0, MAX_TAGS) : [];
        model.mood = draft.mood ?? null;
        model.date = draft.date ?? model.date;
        if (!explicitCadence) model.cadence = draft.cadence ?? model.cadence;
        restored = PROMPTS.some((p) => model.fields[p.key].trim()) || model.tags.length > 0 || model.mood != null;
      }
    } catch {}
  }

  const answered = () => PROMPTS.filter((p) => model.fields[p.key].trim()).length;

  // ---- top row: cadence + date ----------------------------------------------
  const cadenceRadios = Object.entries(CADENCES).map(([value, { name }]) =>
    h(
      'label',
      { class: 'seg' },
      h('input', { type: 'radio', name: 'cadence', value, checked: model.cadence === value, onchange: () => setCadence(value) }),
      h('span', null, name),
    ),
  );
  const dateLabel = h('label', { for: 'date' });
  const dateInput = h('input', { id: 'date', type: 'date', required: true, max: todayIso(), value: model.date, onchange: () => setDate() });
  const periodNote = h('p', { class: 'hint mono' });
  const notice = h('div', { class: 'notices' });

  // ---- prompts ----------------------------------------------------------------
  const promptEls = PROMPTS.map((p, i) => {
    const textarea = h('textarea', {
      id: `f-${p.key}`,
      rows: 3,
      value: model.fields[p.key],
      'aria-describedby': `h-${p.key}`,
      spellcheck: true,
      oninput: () => {
        model.fields[p.key] = textarea.value;
        autosize(textarea);
        changed();
      },
    });
    const question = h('span', { class: 'q' });
    const hint = h('p', { class: 'hint', id: `h-${p.key}` });
    return {
      p,
      textarea,
      question,
      hint,
      el: h('div', { class: 'prompt' }, h('label', { for: textarea.id }, h('span', { class: 'idx mono' }, String(i + 1).padStart(2, '0')), question), hint, textarea),
    };
  });

  const tags = tagField({ tags: model.tags, suggestions: tagSuggestions, onChange: () => changed() });

  const moodLabel = h('span', { class: 'muted small mono' });
  const moodButtons = MOODS.map((name, i) =>
    h('button', {
      class: 'mood-btn',
      type: 'button',
      title: name,
      'aria-label': `${i + 1}, ${name}`,
      onclick: () => {
        model.mood = model.mood === i + 1 ? null : i + 1;
        renderMood();
        changed();
      },
    }, String(i + 1)),
  );
  function renderMood() {
    moodButtons.forEach((b, i) => {
      b.setAttribute('aria-pressed', String(model.mood === i + 1));
      b.classList.toggle('on', model.mood != null && i + 1 <= model.mood);
    });
    moodLabel.textContent = model.mood ? MOODS[model.mood - 1] : 'not rated';
  }

  // ---- write / preview --------------------------------------------------------
  const writePane = h(
    'div',
    { class: 'write-pane' },
    promptEls.map((x) => x.el),
    h(
      'fieldset',
      { class: 'optional' },
      h('legend', null, h('span', { class: 'idx mono' }, '06'), 'Optional'),
      h('div', { class: 'prompt' }, h('label', { for: 'tags' }, h('span', { class: 'q' }, 'Tags')), h('p', { class: 'hint', id: 'tags-hint' }, 'Press space or Enter after each one.'), tags.el),
      h(
        'div',
        { class: 'prompt' },
        h('span', { class: 'label-like', id: 'mood-label' }, h('span', { class: 'q' }, 'How was your mood or energy?')),
        h('p', { class: 'hint' }, '1 is drained, 5 is energised. Click again to clear.'),
        h('div', { class: 'mood-row', role: 'group', 'aria-labelledby': 'mood-label' }, moodButtons, moodLabel),
      ),
    ),
  );
  const previewPane = h('div', { class: 'preview-pane', hidden: true });
  const tabWrite = h('button', { class: 'tab', type: 'button', role: 'tab', 'aria-selected': 'true', onclick: () => showPreview(false) }, 'Write');
  const tabPreview = h('button', { class: 'tab', type: 'button', role: 'tab', 'aria-selected': 'false', onclick: () => showPreview(true) }, 'Preview');

  function currentEntry() {
    return { cadence: model.cadence, period_date: model.cadence === 'weekly' ? weekStart(model.date) : model.date, ...model.fields, tags: model.tags, mood: model.mood };
  }
  function showPreview(on) {
    tags.flush();
    writePane.hidden = on;
    previewPane.hidden = !on;
    tabWrite.setAttribute('aria-selected', String(!on));
    tabPreview.setAttribute('aria-selected', String(on));
    if (on) {
      const e = currentEntry();
      previewPane.replaceChildren(
        answered() ? h('div', { class: 'entry' }, entryHeader(e), entryBody(e)) : h('p', { class: 'muted' }, 'Nothing to preview yet. Answer a prompt or two first.'),
      );
    }
  }

  // ---- footer -----------------------------------------------------------------
  const progress = h('span', { class: 'progress muted small mono', 'aria-live': 'polite' });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const saveBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, isNew ? 'Save entry' : 'Save changes');

  // ---- behaviour --------------------------------------------------------------
  function applyCadence() {
    const c = model.cadence;
    dateLabel.textContent = c === 'weekly' ? 'Week containing' : 'Date';
    periodNote.textContent = c === 'weekly' ? `Mon–Sun · ${formatWeek(weekStart(model.date))}` : '';
    periodNote.hidden = c !== 'weekly';
    for (const x of promptEls) {
      x.question.textContent = x.p.question[c];
      x.hint.textContent = x.p.hint[c];
      x.textarea.placeholder = x.p.placeholder[c];
    }
  }
  function setCadence(value) {
    model.cadence = value;
    applyCadence();
    checkExisting();
    changed();
  }
  function setDate() {
    model.date = dateInput.value || todayIso();
    applyCadence();
    checkExisting();
    changed();
  }

  let checkId = 0;
  async function checkExisting() {
    if (!isNew) return;
    const id = ++checkId;
    const day = model.cadence === 'weekly' ? weekStart(model.date) : model.date;
    try {
      const { entries } = await api.get(`/api/entries?${qs({ cadence: model.cadence, from: day, to: day, limit: 1 })}`);
      if (id !== checkId) return;
      setNotice('existing', entries[0] && [`You already have a ${model.cadence} log for ${model.cadence === 'weekly' ? 'that week' : 'that day'}. `, h('a', { href: `#/entry/${entries[0].id}/edit` }, 'Edit it instead'), ', or keep going to add another.']);
    } catch {}
  }
  function setNotice(key, content) {
    notice.querySelector(`[data-key="${key}"]`)?.remove();
    if (content) notice.append(h('p', { class: 'notice', dataset: { key } }, content));
  }

  const saveDraft = debounce(() => {
    if (!isNew) return;
    const hasContent = answered() || model.tags.length || model.mood != null;
    if (hasContent) storage.set(draftKey(), JSON.stringify(model));
    else storage.remove(draftKey());
  }, 400);
  function changed() {
    progress.textContent = `${answered()}/${PROMPTS.length} prompts answered`;
    error.hidden = true;
    saveDraft();
  }

  const form = h(
    'form',
    {
      class: 'editor',
      novalidate: true,
      onkeydown: (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          form.requestSubmit();
        }
      },
      onsubmit: async (e) => {
        e.preventDefault();
        tags.flush();
        if (!answered()) {
          error.textContent = 'Answer at least one of the prompts before saving. One line is enough.';
          error.hidden = false;
          promptEls[0].textarea.focus();
          return;
        }
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
        const body = { cadence: model.cadence, period_date: model.date, ...model.fields, tags: model.tags, mood: model.mood };
        try {
          const { entry: saved } = isNew ? await api.post('/api/entries', body) : await api.put(`/api/entries/${entry.id}`, body);
          saveDraft.cancel();
          storage.remove(draftKey());
          navigate(`/entry/${saved.id}`);
        } catch (err) {
          error.textContent = err.message;
          error.hidden = false;
          saveBtn.disabled = false;
          saveBtn.textContent = isNew ? 'Save entry' : 'Save changes';
        }
      },
    },
    h(
      'div',
      { class: 'editor-top' },
      h('div', { class: 'field' }, h('span', { class: 'label-like' }, 'Log type'), h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Log type' }, cadenceRadios)),
      h('div', { class: 'field' }, dateLabel, dateInput, periodNote),
    ),
    notice,
    h('div', { class: 'tabs', role: 'tablist' }, tabWrite, tabPreview, h('span', { class: 'tabs-hint muted small' }, MARKDOWN_HINT)),
    writePane,
    previewPane,
    error,
    h(
      'div',
      { class: 'form-footer' },
      progress,
      h('span', { class: 'spacer' }),
      h('span', { class: 'muted small mono kbd-hint' }, '⌘/Ctrl + Enter to save'),
      h('a', { class: 'btn btn-ghost', href: isNew ? '#/' : `#/entry/${entry.id}` }, 'Cancel'),
      saveBtn,
    ),
  );

  applyCadence();
  renderMood();
  changed();
  if (restored) {
    setNotice(
      'draft',
      [
        'Restored your unsaved draft. ',
        h('button', { class: 'link', type: 'button', onclick: () => { storage.remove(draftKey()); location.reload(); } }, 'Discard it'),
      ],
    );
  }
  checkExisting();
  requestAnimationFrame(() => {
    promptEls.forEach((x) => autosize(x.textarea));
    if (isNew && !restored) promptEls[0].textarea.focus();
  });
  return form;
}

const pageHead = (title, subtitle) => h('div', { class: 'page-head' }, h('h1', null, title), subtitle && h('p', { class: 'muted' }, subtitle));

export async function newEntryView({ query }) {
  setTitle('New entry');
  const asked = query.get('cadence');
  const explicitCadence = asked === 'daily' || asked === 'weekly';
  const { tags } = await api.get('/api/tags');
  return h(
    'div',
    null,
    pageHead('New entry', "Five short prompts. Skip any that don't apply."),
    editor({ cadence: explicitCadence ? asked : state.user.default_cadence, explicitCadence, tagSuggestions: tags.map((t) => t.tag) }),
  );
}

export async function editEntryView({ params: [id] }) {
  setTitle('Edit entry');
  const [{ entry }, { tags }] = await Promise.all([api.get(`/api/entries/${id}`), api.get('/api/tags')]);
  return h('div', null, pageHead('Edit entry'), editor({ entry, cadence: entry.cadence, tagSuggestions: tags.map((t) => t.tag) }));
}
