import { api } from '../api.js';
import { h, setTitle } from '../dom.js';
import { CADENCES } from '../prompts.js';
import { state } from '../state.js';

export function settingsView({ onSignOut }) {
  setTitle('Settings');
  const status = h('span', { class: 'muted small mono', role: 'status' });

  const options = Object.entries(CADENCES).map(([value, { name }]) =>
    h(
      'label',
      { class: 'seg' },
      h('input', {
        type: 'radio',
        name: 'default_cadence',
        value,
        checked: state.user.default_cadence === value,
        onchange: async () => {
          status.textContent = 'saving…';
          try {
            const { user } = await api.patch('/api/me', { default_cadence: value });
            state.user = user;
            status.textContent = 'saved';
          } catch (err) {
            status.textContent = err.message;
          }
        },
      }),
      h('span', null, name),
    ),
  );

  return h(
    'div',
    null,
    h('div', { class: 'page-head' }, h('h1', null, 'Settings')),
    h(
      'section',
      { class: 'card settings' },
      h('h2', null, 'Default log type'),
      h('p', { class: 'muted' }, 'New entries start as this type. You can still switch on any individual entry.'),
      h('div', { class: 'row' }, h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Default log type' }, options), status),
    ),
    h(
      'section',
      { class: 'card settings' },
      h('h2', null, 'Account'),
      h('p', { class: 'muted' }, 'Signed in as ', h('span', { class: 'mono' }, state.user.email)),
      h('button', { class: 'btn', type: 'button', onclick: onSignOut }, 'Sign out'),
    ),
  );
}
