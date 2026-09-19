import { api } from '../api.js';
import { h, setTitle } from '../dom.js';

export function authView(mode, { allowSignup, onAuthed }) {
  const isRegister = mode === 'register';
  setTitle(isRegister ? 'Create account' : 'Sign in');

  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const email = h('input', { id: 'email', name: 'email', type: 'email', required: true, autocomplete: 'email', autofocus: true, spellcheck: false });
  const password = h('input', {
    id: 'password',
    name: 'password',
    type: 'password',
    required: true,
    minLength: isRegister ? 8 : undefined,
    autocomplete: isRegister ? 'new-password' : 'current-password',
  });
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, isRegister ? 'Create account' : 'Sign in');

  const form = h(
    'form',
    {
      class: 'auth-form',
      onsubmit: async (e) => {
        e.preventDefault();
        error.hidden = true;
        submit.disabled = true;
        try {
          const { user } = await api.post(`/api/auth/${mode}`, { email: email.value, password: password.value });
          onAuthed(user);
        } catch (err) {
          error.textContent = err.message;
          error.hidden = false;
          submit.disabled = false;
        }
      },
    },
    h('div', { class: 'field' }, h('label', { for: 'email' }, 'Email'), email),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'password' }, 'Password'),
      password,
      isRegister && h('p', { class: 'hint' }, 'At least 8 characters.'),
    ),
    error,
    submit,
  );

  return h(
    'main',
    { id: 'main', class: 'auth' },
    h(
      'div',
      { class: 'auth-card' },
      h('div', { class: 'brand brand-lg' }, 'devlog', h('span', { class: 'cursor', 'aria-hidden': 'true' }, '_')),
      h('p', { class: 'auth-tagline' }, 'A guided work journal for developers. Five short prompts, no blank page.'),
      h('h1', { class: 'auth-title' }, isRegister ? 'Create your account' : 'Sign in'),
      form,
      allowSignup
        ? h(
            'p',
            { class: 'auth-switch muted' },
            isRegister ? 'Already have an account? ' : 'New here? ',
            h('a', { href: isRegister ? '#/login' : '#/register' }, isRegister ? 'Sign in' : 'Create an account'),
          )
        : null,
    ),
  );
}
