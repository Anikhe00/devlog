import { api } from '../api.js';
import { h, setTitle } from '../dom.js';
import { passwordField } from './password-field.js';

const brand = () => [
  h('div', { class: 'brand brand-lg' }, 'devlog', h('span', { class: 'cursor', 'aria-hidden': 'true' }, '_')),
  h('p', { class: 'auth-tagline' }, 'A guided work journal for developers. Five short prompts, no blank page.'),
];
const screen = (...children) => h('main', { id: 'main', class: 'auth' }, h('div', { class: 'auth-card' }, brand(), children));

/** Runs an async submit handler with the button disabled and any error shown in `error`. */
function guarded(form, submit, error, action) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    submit.disabled = true;
    try {
      await action();
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      submit.disabled = false;
    }
  });
}

export function authView(mode, { allowSignup, resetEnabled, notice, onAuthed }) {
  const isRegister = mode === 'register';
  setTitle(isRegister ? 'Create account' : 'Sign in');

  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const email = h('input', { id: 'email', name: 'email', type: 'email', required: true, autocomplete: 'email', autofocus: true, spellcheck: false });
  const password = passwordField({
    id: 'password',
    label: 'Password',
    autocomplete: isRegister ? 'new-password' : 'current-password',
    minLength: isRegister ? 8 : undefined,
    hint: isRegister ? 'At least 8 characters.' : undefined,
  });
  // Only offered when the server can actually send the email.
  if (!isRegister && resetEnabled) password.field.append(h('a', { class: 'forgot-link', href: '#/forgot' }, 'Forgot password?'));
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, isRegister ? 'Create account' : 'Sign in');

  const form = h(
    'form',
    { class: 'auth-form' },
    h('div', { class: 'field' }, h('label', { for: 'email' }, 'Email'), email),
    password.field,
    error,
    submit,
    isRegister && h('p', { class: 'hint' }, 'Entries are stored on this server, and whoever runs it can technically read them.'),
  );
  guarded(form, submit, error, async () => {
    const { user } = await api.post(`/api/auth/${mode}`, { email: email.value, password: password.input.value });
    onAuthed(user);
  });

  return screen(
    h('h1', { class: 'auth-title' }, isRegister ? 'Create your account' : 'Sign in'),
    notice && h('p', { class: 'notice', role: 'status' }, notice),
    form,
    allowSignup
      ? h(
          'p',
          { class: 'auth-switch muted' },
          isRegister ? 'Already have an account? ' : 'New here? ',
          h('a', { href: isRegister ? '#/login' : '#/register' }, isRegister ? 'Sign in' : 'Create an account'),
        )
      : null,
  );
}

/** Step 1: ask for a link. The answer is the same whether or not the address has an account. */
export function forgotView() {
  setTitle('Reset password');
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const email = h('input', { id: 'email', name: 'email', type: 'email', required: true, autocomplete: 'email', autofocus: true, spellcheck: false });
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Send reset link');
  const card = h('div', { class: 'auth-stack' });

  const form = h(
    'form',
    { class: 'auth-form' },
    h('p', { class: 'muted' }, "Enter your account's email address and we'll send you a link to choose a new password."),
    h('div', { class: 'field' }, h('label', { for: 'email' }, 'Email'), email),
    error,
    submit,
  );
  guarded(form, submit, error, async () => {
    await api.post('/api/auth/forgot', { email: email.value });
    card.replaceChildren(
      h('p', { class: 'notice', role: 'status' }, 'Check your email. ', h('strong', null, email.value.trim()), ' will get a reset link if it belongs to an account.'),
      h('p', { class: 'muted small' }, 'The link works once and expires in 30 minutes. Nothing there? Check your spam folder, or try again in a few minutes.'),
    );
  });
  card.append(form);

  return screen(h('h1', { class: 'auth-title' }, 'Reset your password'), card, h('p', { class: 'auth-switch muted' }, h('a', { href: '#/login' }, '← Back to sign in')));
}

/** Step 2: the emailed link lands here with the token in the URL fragment (which browsers never send to servers). */
export function resetView({ token, onDone }) {
  setTitle('Choose a new password');
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const password = passwordField({ id: 'new-password', label: 'New password', autocomplete: 'new-password', minLength: 8, hint: 'At least 8 characters.' });
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Update password');

  const expired = (message) =>
    h('div', { class: 'auth-stack' }, h('p', { class: 'form-error', role: 'alert' }, message), h('p', null, h('a', { class: 'btn btn-block', href: '#/forgot' }, 'Request a new link')));

  const form = h('form', { class: 'auth-form' }, password.field, error, submit, h('p', { class: 'hint' }, "You'll be signed out everywhere and asked to sign in again."));
  guarded(form, submit, error, async () => {
    try {
      await api.post('/api/auth/reset', { token, password: password.input.value });
    } catch (err) {
      // A dead link can't be fixed by retyping the password: send them to ask for a fresh one.
      if (/invalid or has expired/.test(err.message)) {
        form.replaceWith(expired(err.message));
        return;
      }
      throw err;
    }
    onDone();
  });

  return screen(
    h('h1', { class: 'auth-title' }, 'Choose a new password'),
    token ? form : expired('This reset link is incomplete. Request a new one.'),
    h('p', { class: 'auth-switch muted' }, h('a', { href: '#/login' }, '← Back to sign in')),
  );
}
