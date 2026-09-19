import { h, svg } from './dom.js';

// Hand-rolled SVG charts. Colours come from CSS classes (see app.css) so both themes work.
const W = 720;
const H = 220;
const M = { top: 12, right: 8, bottom: 26, left: 30 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;
const MAX_BAR = 24;
const GAP = 2;

/** Round axis: integer ticks from 0 up to a "nice" top. */
function niceScale(max, minTop = 2) {
  const want = Math.max(max, minTop);
  const step = [1, 2, 5, 10, 20, 50, 100, 200, 500].find((s) => want / s <= 5);
  const top = Math.ceil(want / step) * step;
  const ticks = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);
  return { top, ticks };
}

const topRounded = (x, top, w, base, radius) => {
  const r = Math.min(radius, base - top, w / 2);
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`;
};

function xLabels(data, xCenter) {
  const every = Math.ceil(data.length / 8);
  return data.map((d, i) =>
    (data.length - 1 - i) % every === 0
      ? svg('text', { class: 'tick', x: xCenter(i), y: H - 8, 'text-anchor': 'middle' }, d.label)
      : null,
  );
}

function gridlines(ticks, y, tickText = String) {
  return ticks.map((t) => [
    svg('line', { class: t === ticks[0] ? 'axis' : 'grid', x1: M.left, x2: W - M.right, y1: y(t), y2: y(t) }),
    svg('text', { class: 'tick', x: M.left - 8, y: y(t) + 3.5, 'text-anchor': 'end' }, tickText(t)),
  ]);
}

/**
 * One tooltip for the whole chart. Hover snaps to the nearest slot; the chart is
 * also keyboard-focusable (left/right/home/end), so nothing depends on a mouse.
 */
function interactive({ wrap, root, data, xCenter, anchorY, onActive, onClear, describe }) {
  const tip = h('div', { class: 'chart-tip', hidden: true });
  wrap.append(tip);
  const slot = PLOT_W / data.length;
  let active = -1;

  function show(i) {
    if (i === active) return;
    active = i;
    onActive(i);
    const { value, label, lines = [] } = describe(data[i]);
    tip.replaceChildren(h('div', null, h('strong', null, value), ' ', h('span', { class: 'muted' }, label)), ...lines.map((l) => h('div', { class: 'muted small' }, l)));
    tip.hidden = false;
    const scale = root.getBoundingClientRect().width / W;
    const half = tip.offsetWidth / 2;
    tip.style.left = `${Math.min(Math.max(xCenter(i) * scale, half), wrap.clientWidth - half)}px`;
    tip.style.top = `${Math.max(0, anchorY(i) * scale - tip.offsetHeight - 10)}px`;
  }
  function clear() {
    if (active === -1) return;
    active = -1;
    onClear();
    tip.hidden = true;
  }

  root.addEventListener('pointermove', (e) => {
    const box = root.getBoundingClientRect();
    const x = (e.clientX - box.left) * (W / box.width) - M.left;
    if (x < 0 || x > PLOT_W) return clear();
    show(Math.min(data.length - 1, Math.floor(x / slot)));
  });
  root.addEventListener('pointerleave', () => document.activeElement !== root && clear());
  root.addEventListener('focus', () => show(active === -1 ? data.length - 1 : active));
  root.addEventListener('blur', clear);
  root.addEventListener('keydown', (e) => {
    const next = { ArrowLeft: active - 1, ArrowRight: active + 1, Home: 0, End: data.length - 1 }[e.key];
    if (next == null) return;
    e.preventDefault();
    show(Math.min(data.length - 1, Math.max(0, next)));
  });
}

/** On narrow screens the chart scrolls sideways; start at the most recent week. */
function scrolledToLatest(wrap) {
  requestAnimationFrame(() => {
    wrap.scrollLeft = wrap.scrollWidth;
  });
  return wrap;
}

/**
 * @param data [{ label, value, ...whatever describe() needs }]
 * @param describe (d) => ({ value, label, lines })
 */
export function barChart({ data, ariaLabel, describe }) {
  const { top, ticks } = niceScale(Math.max(0, ...data.map((d) => d.value)));
  const slot = PLOT_W / data.length;
  const barW = Math.min(MAX_BAR, slot - GAP);
  const y = (v) => M.top + PLOT_H * (1 - v / top);
  const xCenter = (i) => M.left + slot * (i + 0.5);
  const base = y(0);

  const wash = svg('rect', { class: 'wash', y: M.top, width: slot, height: PLOT_H, hidden: true });
  const bars = data.map((d, i) =>
    d.value > 0 ? svg('path', { class: 'bar', d: topRounded(xCenter(i) - barW / 2, y(d.value), barW, base, 4) }) : null,
  );

  const root = svg(
    'svg',
    { class: 'chart-svg', viewBox: `0 0 ${W} ${H}`, role: 'group', tabindex: 0, 'aria-label': `${ariaLabel}. Use the arrow keys to move between weeks.` },
    gridlines(ticks, y),
    wash,
    bars,
    xLabels(data, xCenter),
  );
  const inner = h('div', { class: 'chart-inner' }, root);
  interactive({
    wrap: inner,
    root,
    data,
    xCenter,
    anchorY: (i) => y(data[i].value),
    describe,
    onActive: (i) => {
      wash.setAttribute('x', M.left + slot * i);
      wash.removeAttribute('hidden');
      bars.forEach((b, j) => b?.classList.toggle('is-active', j === i));
    },
    onClear: () => {
      wash.setAttribute('hidden', '');
      bars.forEach((b) => b?.classList.remove('is-active'));
    },
  });
  return scrolledToLatest(h('div', { class: 'chart' }, inner));
}

/** Line over `yMin..yMax`; null values leave a gap rather than being drawn as zero. */
export function lineChart({ data, ariaLabel, describe, yMin = 1, yMax = 5 }) {
  const slot = PLOT_W / data.length;
  const xCenter = (i) => M.left + slot * (i + 0.5);
  const y = (v) => M.top + PLOT_H * (1 - (v - yMin) / (yMax - yMin));
  const ticks = Array.from({ length: yMax - yMin + 1 }, (_, i) => yMin + i);

  const segments = [];
  let current = [];
  data.forEach((d, i) => {
    if (d.value == null) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push([xCenter(i), y(d.value)]);
  });
  if (current.length) segments.push(current);

  const cross = svg('line', { class: 'cross', y1: M.top, y2: M.top + PLOT_H, hidden: true });
  const dots = data.map((d, i) => (d.value == null ? null : svg('circle', { class: 'point', cx: xCenter(i), cy: y(d.value), r: 4 })));
  const root = svg(
    'svg',
    { class: 'chart-svg', viewBox: `0 0 ${W} ${H}`, role: 'group', tabindex: 0, 'aria-label': `${ariaLabel}. Use the arrow keys to move between weeks.` },
    gridlines(ticks, y),
    cross,
    segments.filter((s) => s.length > 1).map((s) => svg('path', { class: 'line', d: `M${s.map((p) => p.join(',')).join('L')}` })),
    dots,
    xLabels(data, xCenter),
  );
  const inner = h('div', { class: 'chart-inner' }, root);
  interactive({
    wrap: inner,
    root,
    data,
    xCenter,
    anchorY: (i) => (data[i].value == null ? M.top + PLOT_H : y(data[i].value)),
    describe,
    onActive: (i) => {
      cross.setAttribute('x1', xCenter(i));
      cross.setAttribute('x2', xCenter(i));
      cross.removeAttribute('hidden');
      dots.forEach((d, j) => d?.classList.toggle('is-active', j === i));
    },
    onClear: () => {
      cross.setAttribute('hidden', '');
      dots.forEach((d) => d?.classList.remove('is-active'));
    },
  });
  return scrolledToLatest(h('div', { class: 'chart' }, inner));
}

/** Every value a tooltip shows is also here, without needing a pointer. */
export function dataTable({ columns, rows, summary = 'View as table' }) {
  return h(
    'details',
    { class: 'data-table' },
    h('summary', null, summary),
    h(
      'div',
      { class: 'table-scroll' },
      h('table', null, h('thead', null, h('tr', null, columns.map((c) => h('th', { scope: 'col' }, c)))), h('tbody', null, rows.map((r) => h('tr', null, r.map((cell) => h('td', null, cell)))))),
    ),
  );
}
