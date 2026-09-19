import { h } from './dom.js';

const { marked, DOMPurify } = window;
marked.setOptions({ gfm: true, breaks: true });

// Open links in a new tab, safely.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Markdown -> sanitised DOM. Entries are parsed with marked, then scrubbed with
 * DOMPurify; inline styles and images are dropped (the CSP would block them anyway).
 */
export function renderMarkdown(text) {
  const box = h('div', { class: 'md' });
  box.innerHTML = DOMPurify.sanitize(marked.parse(text), {
    FORBID_ATTR: ['style'],
    FORBID_TAGS: ['img', 'style', 'form'],
  });
  return box;
}

/** A one-line plain-text version of some markdown, for list excerpts. */
export function plainText(md) {
  return md
    .replace(/```\w*\n?/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s*)?/, '')
        .replace(/^\s*(?:#{1,6}|>)\s*/, '')
        .replace(/(\*\*|__|~~|\*|`)/g, '')
        .trim(),
    )
    .filter(Boolean)
    .join(' · ');
}
