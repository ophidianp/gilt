// The big gold line chart, used for a stock's price and for the account's value:
// a price axis, time labels, an optional dashed reference line and a hover readout.
import type { Point } from './api';
import { h, s } from './dom';
import { nyFormat, price as fmtPrice } from './fmt';

const W = 1000;
const H = 400;
const PAD = 16;

export interface ChartOptions {
  /** Dashed reference line (yesterday's close, or the starting cash); 0 for none. */
  ref: number;
  refLabel?: string;
  /** Lay the points out across this session (unix seconds) instead of evenly. */
  session: [number, number] | null;
  label: string;
  tick: Intl.DateTimeFormatOptions;
  hover: Intl.DateTimeFormatOptions;
  fmt?: (v: number) => string;
}

export class BigChart {
  readonly el: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly line = s('polyline', { class: 'chart-line' });
  private readonly area = s('polygon', { class: 'chart-area' });
  private readonly plot: HTMLElement;
  private readonly axis = h('div', { class: 'chart-axis', 'aria-hidden': 'true' });
  private readonly times = h('div', { class: 'chart-times', 'aria-hidden': 'true' });
  private readonly refLine = h('div', { class: 'chart-prev' });
  private readonly refLabel = h('span', { class: 'chart-prev-label num' });
  private readonly dot = h('div', { class: 'chart-dot' });
  private readonly hoverLine = h('div', { class: 'chart-hover-line' });
  private readonly hoverDot = h('div', { class: 'chart-hover-dot' });
  private readonly tip = h('div', { class: 'chart-tip num' });
  private pts: Point[] = [];
  private xs: number[] = [];
  private yOf = (_v: number) => 0;
  private opts: ChartOptions | null = null;
  private lastLabel = '';

  constructor() {
    const grid = [0, 1, 2, 3].map((k) => {
      const y = PAD + (k * (H - 2 * PAD)) / 3;
      return s('line', { class: 'chart-grid', x1: 0, x2: W, y1: y, y2: y });
    });
    this.svg = s('svg', { class: 'chart-svg', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img' }, ...grid, this.area, this.line);
    this.plot = h('div', { class: 'chart-plot' }, this.svg, this.refLine, this.refLabel, this.dot, this.hoverLine, this.hoverDot, this.tip);
    this.el = h('div', { class: 'chart' }, h('div', { class: 'chart-row' }, this.plot, this.axis), this.times);
    this.plot.addEventListener('pointermove', (e) => this.hover(e));
    this.plot.addEventListener('pointerleave', () => this.el.classList.remove('hovering'));
    this.el.classList.add('empty');
  }

  set(points: Point[], o: ChartOptions) {
    this.pts = points;
    this.opts = o;
    const fmt = o.fmt ?? fmtPrice;
    this.svg.setAttribute('aria-label', o.label);
    const n = points.length;
    this.el.classList.toggle('empty', n < 2);
    if (n < 2) return;
    // a new range (not a live tick) draws in from the left
    if (o.label !== this.lastLabel) {
      this.lastLabel = o.label;
      this.el.classList.remove('reveal');
      void this.el.offsetWidth;
      this.el.classList.add('reveal');
    }

    const sess = o.session;
    this.xs = points.map((p, i) => (sess ? clamp(((p.t - sess[0]) / (sess[1] - sess[0])) * W, 0, W) : (i * W) / (n - 1)));

    const showRef = o.ref > 0;
    let lo = Math.min(...points.map((p) => p.v));
    let hi = Math.max(...points.map((p) => p.v));
    if (showRef) { lo = Math.min(lo, o.ref); hi = Math.max(hi, o.ref); }
    const pad = (hi - lo) * 0.06 || hi * 0.005 || 1;
    lo -= pad; hi += pad;
    this.yOf = (v) => PAD + (H - 2 * PAD) * (1 - (v - lo) / (hi - lo));

    const pts = points.map((p, i) => `${this.xs[i].toFixed(1)},${this.yOf(p.v).toFixed(1)}`).join(' ');
    this.line.setAttribute('points', pts);
    this.area.setAttribute('points', `${pts} ${this.xs[n - 1].toFixed(1)},${H} ${this.xs[0].toFixed(1)},${H}`);
    const last = points[n - 1];
    place(this.dot, this.xs[n - 1], this.yOf(last.v));
    this.el.classList.toggle('below', last.v < (showRef ? o.ref : points[0].v));

    this.refLine.hidden = this.refLabel.hidden = !showRef;
    if (showRef) {
      const top = pctY(this.yOf(o.ref));
      this.refLine.style.top = top;
      this.refLabel.style.top = top;
      this.refLabel.textContent = `${o.refLabel ?? 'Prev close'} ${fmt(o.ref)}`;
    }

    this.axis.replaceChildren(...[0, 1, 2, 3].map((k) => {
      const y = PAD + (k * (H - 2 * PAD)) / 3;
      const v = lo + (1 - (y - PAD) / (H - 2 * PAD)) * (hi - lo);
      const el = h('span', { class: 'num' }, fmt(v));
      el.style.top = pctY(y);
      return el;
    }));

    const ticks: { x: number; label: string }[] = [];
    if (sess) {
      for (let t = Math.ceil(sess[0] / 3600) * 3600; t < sess[1]; t += 3600) {
        ticks.push({ x: ((t - sess[0]) / (sess[1] - sess[0])) * W, label: nyFormat(t, { hour: 'numeric' }) });
      }
    } else {
      const k = Math.min(5, n);
      for (let j = 0; j < k; j++) {
        const i = Math.round((j * (n - 1)) / (k - 1));
        ticks.push({ x: this.xs[i], label: nyFormat(points[i].t, o.tick) });
      }
    }
    this.times.replaceChildren(...ticks.map(({ x, label }) => {
      const el = h('span', null, label);
      el.style.left = `${(x / W) * 100}%`;
      el.style.transform = x < W * 0.04 ? 'none' : x > W * 0.96 ? 'translateX(-100%)' : 'translateX(-50%)';
      return el;
    }));
    this.el.classList.remove('hovering');
  }

  private hover(e: PointerEvent) {
    const n = this.pts.length;
    if (n < 2 || !this.opts) return;
    const r = this.plot.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * W;
    let a = 0, b = n - 1;
    while (b - a > 1) { const m = (a + b) >> 1; if (this.xs[m] < fx) a = m; else b = m; }
    const i = Math.abs(this.xs[a] - fx) <= Math.abs(this.xs[b] - fx) ? a : b;
    const p = this.pts[i];
    const x = this.xs[i];
    this.hoverLine.style.left = `${(x / W) * 100}%`;
    place(this.hoverDot, x, this.yOf(p.v));
    this.tip.textContent = `${(this.opts.fmt ?? fmtPrice)(p.v)}  ·  ${nyFormat(p.t, this.opts.hover)}`;
    this.tip.style.left = `${(x / W) * 100}%`;
    this.tip.style.transform = x > W * 0.7 ? 'translateX(calc(-100% - 14px))' : 'translateX(14px)';
    this.el.classList.add('hovering');
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pctY = (y: number) => `${(y / H) * 100}%`;
function place(el: HTMLElement, x: number, y: number) {
  el.style.left = `${(x / W) * 100}%`;
  el.style.top = pctY(y);
}
