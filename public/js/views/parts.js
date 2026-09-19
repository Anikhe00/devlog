import { h } from '../dom.js';
import { entryTitle } from '../dates.js';
import { renderMarkdown, plainText } from '../md.js';
import { MOODS, PROMPTS } from '../prompts.js';

export const tagLink = (tag) => h('a', { class: 'tag', href: `#/history?tag=${encodeURIComponent(tag)}` }, `#${tag}`);

export function tagList(tags) {
  if (!tags?.length) return null;
  return h('ul', { class: 'tags', 'aria-label': 'Tags' }, tags.map((t) => h('li', null, tagLink(t))));
}

export function moodDots(mood) {
  if (!mood) return null;
  return h(
    'span',
    { class: 'mood', role: 'img', 'aria-label': `Mood ${mood} of 5, ${MOODS[mood - 1]}`, title: `Mood ${mood}/5 · ${MOODS[mood - 1]}` },
    [1, 2, 3, 4, 5].map((n) => h('span', { class: n <= mood ? 'dot on' : 'dot', 'aria-hidden': 'true' })),
  );
}

export const cadenceBadge = (cadence) => h('span', { class: `badge badge-${cadence}` }, cadence);

function excerpt(entry) {
  for (const prompt of PROMPTS) {
    const text = plainText(entry[prompt.key] ?? '');
    if (text) return prompt.key === 'worked_on' ? text : `${prompt.short}: ${text}`;
  }
  return '';
}

/** A compact list item for an entry; the title link covers the whole card. */
export function entryCard(entry) {
  return h(
    'article',
    { class: 'entry-card' },
    h(
      'header',
      { class: 'entry-card-head' },
      h('h3', { class: 'entry-card-title' }, h('a', { class: 'stretched', href: `#/entry/${entry.id}` }, entryTitle(entry))),
      cadenceBadge(entry.cadence),
      moodDots(entry.mood),
    ),
    h('p', { class: 'excerpt' }, excerpt(entry)),
    tagList(entry.tags),
  );
}

/** The five answered prompts, rendered as markdown. Empty prompts are skipped. */
export function entryBody(entry) {
  const sections = PROMPTS.map((prompt, i) =>
    entry[prompt.key]?.trim()
      ? h(
          'section',
          { class: 'entry-section' },
          h('h2', { class: 'section-label' }, h('span', { class: 'idx' }, String(i + 1).padStart(2, '0')), prompt.short),
          renderMarkdown(entry[prompt.key]),
        )
      : null,
  );
  return h('div', { class: 'entry-body' }, sections);
}

export const loading = () => h('p', { class: 'loading mono', role: 'status' }, 'loading…');

export function emptyState({ title, body, action }) {
  return h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, title), body && h('p', { class: 'muted' }, body), action);
}

export function errorView(err, retry) {
  const notFound = err.status === 404;
  return h(
    'div',
    { class: 'empty', role: 'alert' },
    h('p', { class: 'empty-title' }, notFound ? 'Not found' : 'Something went wrong'),
    h('p', { class: 'muted' }, notFound ? "That page or entry doesn't exist (or isn't yours)." : err.message),
    notFound
      ? h('a', { class: 'btn', href: '#/' }, 'Back to dashboard')
      : h('button', { class: 'btn', type: 'button', onclick: retry }, 'Try again'),
  );
}
