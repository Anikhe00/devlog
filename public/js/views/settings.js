import { api } from '../api.js';
import { h, setTitle } from '../dom.js';
import { CADENCES } from '../prompts.js';
import { state } from '../state.js';
import { passwordField } from './password-field.js';

function changePasswordCard() {
  const current = passwordField({ id: 'current-password', label: 'Current password', autocomplete: 'current-password' });
  const next = passwordField({ id: 'new-password', label: 'New password', autocomplete: 'new-password', minLength: 8, hint: 'At least 8 characters. Your other devices will be signed out.' });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const done = h('p', { class: 'notice', role: 'status', hidden: true }, 'Password changed. Your other devices have been signed out.');
  const submit = h('button', { class: 'btn', type: 'submit' }, 'Change password');

  const form = h(
    'form',
    {
      class: 'settings-form',
      onsubmit: async (e) => {
        e.preventDefault();
        error.hidden = true;
        done.hidden = true;
        submit.disabled = true;
        try {
          await api.post('/api/auth/password', { current: current.input.value, next: next.input.value });
          current.input.value = next.input.value = '';
          done.hidden = false;
        } catch (err) {
          error.textContent = err.message;
          error.hidden = false;
        } finally {
          submit.disabled = false;
        }
      },
    },
    current.field,
    next.field,
    error,
    done,
    submit,
  );
  return h('section', { class: 'card settings' }, h('h2', null, 'Change password'), form);
}

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
    changePasswordCard(),
    h(
      'section',
      { class: 'card settings' },
      h('h2', null, 'Account'),
      h('p', { class: 'muted' }, 'Signed in as ', h('span', { class: 'mono' }, state.user.email)),
      h('button', { class: 'btn', type: 'button', onclick: onSignOut }, 'Sign out'),
    ),
  );
}
