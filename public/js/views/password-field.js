import { h, svg } from '../dom.js';

const icon = (cls, ...shapes) =>
  svg('svg', { class: cls, viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, shapes);
const eye = () => icon('icon-eye', svg('path', { d: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' }), svg('circle', { cx: 12, cy: 12, r: 3 }));
const eyeOff = () =>
  icon(
    'icon-eye-off',
    svg('path', { d: 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24' }),
    svg('line', { x1: 1, y1: 1, x2: 23, y2: 23 }),
  );

/**
 * A labelled password box with a show/hide eye button. Returns { input, field }: read the value
 * from `input`, put `field` in the form. Used by sign-in, sign-up, reset and change-password.
 */
export function passwordField({ id, label, autocomplete, minLength, hint }) {
  const input = h('input', {
    id,
    name: id,
    type: 'password',
    required: true,
    minLength,
    autocomplete,
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
      'aria-controls': id,
      onmousedown: (e) => e.preventDefault(), // a mouse click keeps the caret in the password box
      onclick: () => {
        const show = input.type === 'password';
        // Changing an input's type makes Chrome reset the caret to the start, and it does so again
        // after this handler returns, so put the caret back now and once more on the next frame.
        const focused = document.activeElement === input;
        const { selectionStart, selectionEnd } = input;
        const restore = () => focused && input.setSelectionRange(selectionStart, selectionEnd);
        input.type = show ? 'text' : 'password';
        restore();
        requestAnimationFrame(restore);
        reveal.setAttribute('aria-pressed', String(show));
      },
    },
    eye(),
    eyeOff(),
  );
  const field = h('div', { class: 'field' }, h('label', { for: id }, label), h('div', { class: 'password-field' }, input, reveal), hint && h('p', { class: 'hint' }, hint));
  return { input, field };
}
