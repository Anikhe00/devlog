import { api } from '../api.js';
import { h, setTitle, svg } from '../dom.js';

const icon = (cls, ...shapes) =>
  svg('svg', { class: cls, viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, shapes);
const eye = () => icon('icon-eye', svg('path', { d: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' }), svg('circle', { cx: 12, cy: 12, r: 3 }));
const eyeOff = () =>
  icon(
    'icon-eye-off',
    svg('path', { d: 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24' }),
    svg('line', { x1: 1, y1: 1, x2: 23, y2: 23 }),
  );

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
    // Once revealed it's a plain text box, so stop the phone "fixing" what you type.
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: false,
  });
  const reveal = h(
    'button',
    {
      class: 'icon-btn reveal',
      type: 'button', // never submits the form
      title: 'Show password',
      'aria-label': 'Show password',
      'aria-pressed': 'false',
      'aria-controls': 'password',
      onmousedown: (e) => e.preventDefault(), // a mouse click keeps the caret in the password box
      onclick: () => {
        const show = password.type === 'password';
        // Changing an input's type makes Chrome reset the caret to the start, and it does so again
        // after this handler returns, so put the caret back now and once more on the next frame.
        const focused = document.activeElement === password;
        const { selectionStart, selectionEnd } = password;
        const restore = () => focused && password.setSelectionRange(selectionStart, selectionEnd);
        password.type = show ? 'text' : 'password';
        restore();
        requestAnimationFrame(restore);
        reveal.setAttribute('aria-pressed', String(show));
      },
    },
    eye(),
    eyeOff(),
  );
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
      h('div', { class: 'password-field' }, password, reveal),
      isRegister && h('p', { class: 'hint' }, 'At least 8 characters.'),
    ),
    error,
    submit,
    isRegister && h('p', { class: 'hint' }, 'Entries are stored on this server, and whoever runs it can technically read them.'),
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
