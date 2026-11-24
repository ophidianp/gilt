// The full-screen chart viewer, opened from the expand button on a stock's chart.
// One canvas draws the price pane (14 chart types), a volume pane, indicators, the forecast cone,
// automatic notes, Claude's notes and your own drawings. A compact header shows the open, high,
// low, close and volume of whichever bar is under the pointer, and a side panel explains the outlook.
import { aiError, askClaude, type Analysis } from './ai';
import { fetchBars, INTERVAL_NAME, VIEW_RANGES, type Bar, type Bars, type ViewRange } from './api';
import { h } from './dom';
import { nyFormat, pct, price as fmtPrice, signed, tone } from './fmt';
import { live } from './live';
import { annotate, bollinger, ema, forecast, reachBars, sma, vwap, type Forecast, type Note } from './outlook';
import { animate, settings, type ChartType } from './settings';
import { nameOf, rememberName } from './store';

// ---------- static tables ----------

export const CHART_TYPES: [ChartType, string, string][] = [
  ['candle', 'Candle', '<path d="M4 2v3M4 11v3M12 3v3M12 12v2"/><rect x="2.5" y="5" width="3" height="6" rx=".5"/><rect x="10.5" y="6" width="3" height="6" rx=".5" fill="currentColor"/>'],
  ['bar', 'Bar', '<path d="M5 2v12M3 5h2M5 10h2M11 4v9M9 6h2M11 11h2"/>'],
  ['colored-bar', 'Colored Bar', '<path class="iu" d="M5 2v12M3 5h2M5 10h2"/><path class="id" d="M11 4v9M9 6h2M11 11h2"/>'],
  ['line', 'Line', '<path d="M2 12l4-5 3 3 5-7"/>'],
  ['colored-line', 'Colored Line', '<path class="iu" d="M2 12l4-5"/><path class="id" d="M6 7l3 3"/><path class="iu" d="M9 10l5-7"/>'],
  ['vertex-line', 'Vertex Line', '<path d="M2 12l4-5 3 3 5-7"/><circle cx="6" cy="7" r="1.3" fill="currentColor"/><circle cx="9" cy="10" r="1.3" fill="currentColor"/><circle cx="2" cy="12" r="1.3" fill="currentColor"/><circle cx="14" cy="3" r="1.3" fill="currentColor"/>'],
  ['step', 'Step', '<path d="M2 12h3V8h4v2h3V4h2"/>'],
  ['mountain', 'Mountain', '<path d="M2 14V12l4-5 3 3 5-7v11z" fill="currentColor" fill-opacity=".25" stroke="none"/><path d="M2 12l4-5 3 3 5-7"/>'],
  ['baseline', 'Baseline', '<path d="M1.5 8.5h13" stroke-dasharray="1.5 1.5" opacity=".6"/><path class="iu" d="M2 9l3-5 2.5 4.5"/><path class="id" d="M7.5 8.5L9 12l2-3"/><path class="iu" d="M11 9l3-6"/>'],
  ['hollow-candle', 'Hollow Candle', '<path d="M4 2v3M4 11v3M12 3v3M12 12v2"/><rect x="2.5" y="5" width="3" height="6" rx=".5"/><rect x="10.5" y="6" width="3" height="6" rx=".5"/>'],
  ['volume-candle', 'Volume Candle', '<path d="M4 2v3M4 11v3M12 4v3M12 11v3"/><rect x="1.5" y="5" width="5" height="6" rx=".5"/><rect x="11" y="7" width="2" height="4" rx=".5" fill="currentColor"/>'],
  ['colored-hlc', 'Colored HLC Bar', '<path class="iu" d="M5 2v12M5 9h2"/><path class="id" d="M11 4v9M11 7h2"/>'],
  ['points', 'Data Points', '<circle cx="2.5" cy="12" r="1.4" fill="currentColor"/><circle cx="6" cy="7.5" r="1.4" fill="currentColor"/><circle cx="9.5" cy="10" r="1.4" fill="currentColor"/><circle cx="13.5" cy="4" r="1.4" fill="currentColor"/>'],
  ['histogram', 'Histogram', '<path d="M3 14V9M6.3 14V6M9.6 14V10M13 14V4" stroke-width="2.4"/>'],
];

type Indicator = 'sma20' | 'sma50' | 'sma200' | 'ema21' | 'bb' | 'vwap';
const INDICATORS: [Indicator, string][] = [['sma20', 'SMA 20'], ['sma50', 'SMA 50'], ['sma200', 'SMA 200'], ['ema21', 'EMA 21'], ['bb', 'Bollinger 20, 2'], ['vwap', 'VWAP (intraday)']];
const IND_COLOR: Record<'dark' | 'light', Record<Exclude<Indicator, 'bb'>, string>> = {
  dark: { sma20: '#6CB6FF', sma50: '#C792EA', sma200: '#B8B4A8', ema21: '#4FD1C5', vwap: '#FF9EDB' },
  light: { sma20: '#1F6FD1', sma50: '#8A3FD1', sma200: '#6B675C', ema21: '#0F8F84', vwap: '#C2368F' },
};

type Tool = 'cursor' | 'hline' | 'trend' | 'note' | 'measure' | 'erase';
const TOOLS: [Tool, string, string][] = [
  ['cursor', 'Pointer: drag to pan, scroll to zoom', '<path d="M4 2l8 5-3.5 1L11 13l-1.8.9L7 9.2 4.5 12z" fill="currentColor" stroke="none"/>'],
  ['hline', 'Horizontal line', '<path d="M1.5 8h13"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/>'],
  ['trend', 'Trend line', '<path d="M2.5 13L13.5 3"/><circle cx="2.5" cy="13" r="1.6" fill="currentColor"/><circle cx="13.5" cy="3" r="1.6" fill="currentColor"/>'],
  ['note', 'Note', '<path d="M3 3h10v7H8l-3 3v-3H3z"/>'],
  ['measure', 'Measure: drag between two points', '<path d="M2 13L13 2M4.5 13.5l-3-3M13.5 4.5l-3-3"/>'],
  ['erase', 'Eraser: click a drawing to remove it', '<path d="M6 13h8M3.5 9.5l5-5 4 4-4.5 4.5H5.5z"/>'],
];

const SEC: Record<string, number> = { '1m': 60, '2m': 120, '5m': 300, '15m': 900, '30m': 1800, '60m': 3600, '1d': 86400, '1wk': 604800, '1mo': 2629800, '3mo': 7889400 };
const RANGE_LABEL: Record<ViewRange, string> = { '1D': 'today', '5D': 'past 5 days', '1M': 'past month', '3M': 'past 3 months', '6M': 'past 6 months', YTD: 'year to date', '1Y': 'past year', '5Y': 'past 5 years', MAX: 'all time' };

interface Drawing { id: number; kind: 'hline' | 'trend' | 'note'; t1: number; p1: number; t2?: number; p2?: number; text?: string }
interface Prefs { range: ViewRange; interval: Partial<Record<ViewRange, string>>; ind: Indicator[]; panel: boolean }

const PREFS = 'gilt.viewer.v1';
const DRAWINGS = 'gilt.drawings.v1';
const loadPrefs = (): Prefs => {
  try { return { range: '3M', interval: {}, ind: ['sma20', 'sma50'], panel: true, ...JSON.parse(localStorage.getItem(PREFS) ?? '{}') }; }
  catch { return { range: '3M', interval: {}, ind: ['sma20', 'sma50'], panel: true }; }
};
const allDrawings = (): Record<string, Drawing[]> => { try { return JSON.parse(localStorage.getItem(DRAWINGS) ?? '{}'); } catch { return {}; } };

const aiCache = new Map<string, Analysis>();
const svgIcon = (body: string, cls = 'vw-ico') => {
  const el = h('span', { class: cls, 'aria-hidden': 'true' });
  el.innerHTML = `<svg viewBox="0 0 16 16">${body}</svg>`;
  return el;
};
const volFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

let openNow: (() => void) | null = null;

/** Opens the viewer for `sym`. `from` is the element it grows out of (the chart card). */
export function openViewer(sym: string, from?: HTMLElement) {
  openNow?.();
  const prefs = loadPrefs();
  let range: ViewRange = prefs.range in VIEW_RANGES ? prefs.range : '3M';
  let interval = intervalFor(range);
  let data: Bars | null = null;
  let bars: Bar[] = [];
  let fc: Forecast | null = null;
  let notes: Note[] = [];
  let ai: Analysis | null = null;
  let aiBusy: AbortController | null = null;
  let aiErr = '';
  let tool: Tool = 'cursor';
  let drawings: Drawing[] = allDrawings()[sym] ?? [];
  let loading = 0;
  const S = () => settings.get();

  function intervalFor(r: ViewRange) {
    const p = prefs.interval[r];
    return p && VIEW_RANGES[r].intervals.includes(p) ? p : VIEW_RANGES[r].intervals[0];
  }
  const savePrefs = () => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch { /* ignore */ } };
  const saveDrawings = () => {
    const all = allDrawings();
    if (drawings.length) all[sym] = drawings; else delete all[sym];
    try { localStorage.setItem(DRAWINGS, JSON.stringify(all)); } catch { /* ignore */ }
  };

  // ---------- header ----------
  const nameEl = h('span', { class: 'vw-name' }, nameOf(sym));
  const exEl = h('span', { class: 'vw-ex' });
  const pxEl = h('b', { class: 'vw-px num' }, '—');
  const chEl = h('span', { class: 'vw-ch num' });
  const when = h('span', { class: 'vw-when num' });
  const cells: Record<string, HTMLElement> = {};
  const ohlc = h('dl', { class: 'vw-ohlc' }, ...['Open', 'High', 'Low', 'Close', 'Vol', 'Change', 'Chg %'].map((k) => {
    cells[k] = h('dd', { class: 'num' }, '—');
    return h('div', null, h('dt', null, k), cells[k]);
  }));
  const closeBtn = h('button', { type: 'button', class: 'vw-x', 'aria-label': 'Close full-screen chart (Esc)', title: 'Close (Esc)', onclick: () => close() });
  closeBtn.innerHTML = '<svg viewBox="0 0 16 16"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>';

  // ---------- toolbar ----------
  const rangeSeg = h('div', { class: 'seg small vw-ranges', role: 'radiogroup', 'aria-label': 'Range' },
    ...(Object.keys(VIEW_RANGES) as ViewRange[]).map((r) => h('button', { type: 'button', role: 'radio', 'data-v': r, 'aria-checked': String(r === range), onclick: () => setRange(r) }, r)));
  const ivSel = h('select', { class: 'vw-select', 'aria-label': 'Bar size', title: 'Bar size' }) as HTMLSelectElement;
  ivSel.addEventListener('change', () => { interval = ivSel.value; prefs.interval[range] = interval; savePrefs(); load(); });

  const typeBtn = h('button', { type: 'button', class: 'vw-btn vw-menu-btn', 'aria-haspopup': 'true', title: 'Chart type' });
  const typeMenu = h('div', { class: 'vw-menu', role: 'menu', hidden: true }, ...CHART_TYPES.map(([k, label, ico]) =>
    h('button', { type: 'button', role: 'menuitemradio', 'data-v': k, onclick: () => { settings.set('chartType', k); closeMenus(); paintToolbar(); dirty(); } }, svgIcon(ico), label)));
  const indBtn = h('button', { type: 'button', class: 'vw-btn vw-menu-btn', 'aria-haspopup': 'true', title: 'Indicators' }, svgIcon('<path d="M1.5 11c2-5 4-6 6-3s4 2 7-4"/><path d="M1.5 6c3 1 5 4 13 2" opacity=".5"/>'), 'Indicators');
  const indMenu = h('div', { class: 'vw-menu', role: 'menu', hidden: true }, ...INDICATORS.map(([k, label]) =>
    h('button', { type: 'button', role: 'menuitemcheckbox', 'data-v': k, onclick: () => {
      prefs.ind = prefs.ind.includes(k) ? prefs.ind.filter((x) => x !== k) : [...prefs.ind, k];
      savePrefs(); paintToolbar(); dirty();
    } }, h('span', { class: 'vw-check' }), label)));
  const toolBtns = TOOLS.map(([k, title, ico]) => h('button', { type: 'button', class: 'vw-btn ico', 'data-v': k, title, 'aria-label': title, onclick: () => setTool(k) }, svgIcon(ico)));
  const clearBtn = h('button', { type: 'button', class: 'vw-btn', title: 'Remove all your drawings on this stock', onclick: () => { drawings = []; saveDrawings(); measure = null; paintToolbar(); dirty(); } }, 'Clear');
  const toggle = (key: 'showForecast' | 'showAnnotations' | 'showVolume' | 'logScale', label: string, title: string) =>
    h('button', { type: 'button', class: 'vw-btn tog', 'data-k': key, title, 'aria-pressed': 'false', onclick: () => { settings.set(key, !S()[key]); paintToolbar(); recompute(); } }, label);
  const togs = [toggle('showForecast', 'Forecast', 'Show the forecast cone'), toggle('showAnnotations', 'Notes', 'Show automatic notes'), toggle('showVolume', 'Volume', 'Show the volume pane'), toggle('logScale', 'Log', 'Logarithmic price scale')];
  const panelBtn = h('button', { type: 'button', class: 'vw-btn ico', title: 'Show or hide the outlook panel', 'aria-label': 'Outlook panel', onclick: () => { prefs.panel = !prefs.panel; savePrefs(); paintToolbar(); } },
    svgIcon('<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M10 2.5v11"/>'));

  // ---------- stage and panel ----------
  const canvas = h('canvas', { class: 'vw-canvas', role: 'img' }) as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const msg = h('p', { class: 'vw-msg' }, 'Loading chart…');
  const tip = h('div', { class: 'vw-tip', hidden: true });
  const stage = h('div', { class: 'vw-stage' }, canvas, msg, tip);
  const panel = h('aside', { class: 'vw-panel', 'aria-label': 'Outlook' });

  const el = h('div', { class: 'viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${sym} chart` },
    h('header', { class: 'vw-head' },
      h('div', { class: 'vw-id' }, h('b', { class: 'vw-sym' }, sym), nameEl, exEl),
      h('div', { class: 'vw-quote' }, pxEl, chEl),
      ohlc, when, closeBtn),
    h('div', { class: 'vw-tools' },
      rangeSeg, ivSel,
      h('span', { class: 'vw-sep' }),
      h('div', { class: 'vw-pop' }, typeBtn, typeMenu),
      h('div', { class: 'vw-pop' }, indBtn, indMenu),
      h('span', { class: 'vw-sep' }),
      ...toolBtns, clearBtn,
      h('span', { class: 'vw-sep' }),
      ...togs,
      h('span', { class: 'vw-grow' }),
      panelBtn),
    h('div', { class: 'vw-body' }, stage, panel));
  document.body.append(el);
  document.body.classList.add('viewer-open');
  const lastFocus = document.activeElement as HTMLElement | null;
  closeBtn.focus({ preventScroll: true });

  // grow out of the chart card
  /** The chart card's box as an inset of the viewer, for growing out of it and shrinking back. */
  const cardInset = (card: HTMLElement) => {
    const r = card.getBoundingClientRect(), b = el.getBoundingClientRect();
    return `inset(${Math.max(0, r.top - b.top)}px ${Math.max(0, b.right - r.right)}px ${Math.max(0, b.bottom - r.bottom)}px ${Math.max(0, r.left - b.left)}px round 20px)`;
  };
  if (from && animate()) {
    el.animate([
      { clipPath: cardInset(from), opacity: 0.6 },
      { clipPath: 'inset(0px 0px 0px 0px round 0px)', opacity: 1 },
    ], { duration: 420, easing: 'cubic-bezier(.2,.7,.1,1)' });
  }

  function paintToolbar() {
    const s = S();
    const ct = CHART_TYPES.find((c) => c[0] === s.chartType) ?? CHART_TYPES[0];
    typeBtn.replaceChildren(svgIcon(ct[2]), ct[1], h('span', { class: 'vw-caret' }, '▾'));
    typeMenu.querySelectorAll<HTMLElement>('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === s.chartType)));
    indMenu.querySelectorAll<HTMLElement>('button').forEach((b) => b.setAttribute('aria-checked', String(prefs.ind.includes(b.dataset.v as Indicator))));
    indBtn.classList.toggle('on', prefs.ind.length > 0);
    toolBtns.forEach((b) => b.classList.toggle('on', b.dataset.v === tool));
    clearBtn.hidden = !drawings.length;
    togs.forEach((b) => { const on = !!s[b.dataset.k as keyof typeof s]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    panelBtn.classList.toggle('on', prefs.panel);
    panel.hidden = !prefs.panel;
    ivSel.replaceChildren(...VIEW_RANGES[range].intervals.map((v) => h('option', { value: v, selected: v === interval }, INTERVAL_NAME[v] ?? v)));
    stage.dataset.tool = tool;
  }
  const closeMenus = () => { typeMenu.hidden = true; indMenu.hidden = true; };
  typeBtn.addEventListener('click', (e) => { e.stopPropagation(); const was = typeMenu.hidden; closeMenus(); typeMenu.hidden = !was; });
  indBtn.addEventListener('click', (e) => { e.stopPropagation(); const was = indMenu.hidden; closeMenus(); indMenu.hidden = !was; });
  el.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('.vw-pop')) closeMenus(); });

  function setTool(t: Tool) {
    tool = t;
    measure = null;
    endNoteEdit(false);
    paintToolbar();
    dirty();
  }

  function setRange(r: ViewRange) {
    range = r;
    interval = intervalFor(r);
    prefs.range = r; savePrefs();
    rangeSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === r)));
    paintToolbar();
    load();
  }

  // ---------- data ----------
  async function load() {
    const mine = ++loading;
    msg.hidden = false;
    msg.textContent = 'Loading chart…';
    try {
      const d = await fetchBars(sym, VIEW_RANGES[range].range, interval);
      if (mine !== loading) return;
      data = d;
      bars = d.bars;
      if (d.name && d.name !== sym) { rememberName(sym, d.name); nameEl.textContent = d.name; }
      exEl.textContent = d.exchange;
      msg.hidden = bars.length >= 2;
      msg.textContent = 'No bars for this range.';
      ai = aiCache.get(aiKey()) ?? null;
      aiErr = '';
      resetView();
      reveal = animate() ? 0 : 1;
      recompute();
      paintQuote();
      hoverI = null;
      paintOhlc(bars.length - 1);
    } catch (e) {
      if (mine !== loading) return;
      msg.hidden = false;
      msg.textContent = `Couldn't load ${sym}: ${e instanceof Error ? e.message : e}`;
    }
  }
  const aiKey = () => `${sym}|${range}|${interval}`;

  /** Re-runs the forecast and notes after new data or a settings change. */
  function recompute() {
    const s = S();
    fc = bars.length > 20 && s.showForecast ? forecast(bars, reachBars(bars.length, s.forecastReach)) : null;
    notes = bars.length > 20 ? annotate(bars, !!data?.intraday) : [];
    paintPanel();
    dirty();
  }

  function paintQuote() {
    const q = live.get(sym);
    const p = q?.price ?? data?.price;
    if (p == null) return;
    pxEl.textContent = fmtPrice(p);
    const base = range === '1D' ? q?.prev ?? data?.prev ?? p : bars[0]?.o ?? p;
    chEl.textContent = `${signed(p - base)} (${pct(p - base, base)}) ${RANGE_LABEL[range]}`;
    chEl.className = `vw-ch num ${tone(p - base)}`;
  }

  /** Live prices move the last bar (or start a new one once its interval has passed). */
  const offLive = live.on((_q, fresh) => {
    if (!fresh.has(sym) || !bars.length) return;
    const q = live.get(sym)!;
    const last = bars[bars.length - 1];
    const step = SEC[interval] ?? 86400;
    if (data?.intraday && q.time >= last.t + step) {
      const t = last.t + Math.floor((q.time - last.t) / step) * step;
      bars.push({ t, o: q.price, h: q.price, l: q.price, c: q.price, v: 0 });
      if (view.end >= bars.length - 2.5) { view.end++; target.end++; }
    } else if (q.time >= last.t) {
      last.c = q.price; last.h = Math.max(last.h, q.price); last.l = Math.min(last.l, q.price);
    }
    paintQuote();
    if (S().showForecast) fc = forecast(bars, reachBars(bars.length, S().forecastReach));
    if (hoverI == null) paintOhlc(bars.length - 1);
    dirty();
  });
  const offNeed = live.need(() => [sym]);
  const reloadTimer = window.setInterval(() => { if (data?.intraday && !document.hidden && !aiBusy) load(); }, 60000);
  const offSettings = settings.onChange((_s, k) => {
    if (k === 'theme' || k === 'colors' || k === null) readColors();
    if (k === 'forecastReach' || k === 'showForecast') recompute();
    paintToolbar();
    dirty();
  });

  // ---------- view (which bars are on screen) ----------
  const view = { end: 0, count: 0 };
  const target = { end: 0, count: 0 };
  const yr = { lo: 0, hi: 1, ready: false };
  let reveal = 1;

  function resetView() {
    const n = bars.length;
    const count = n > 420 ? 300 : Math.max(10, n);
    target.count = view.count = count;
    target.end = view.end = n - 1;
    yr.ready = false;
  }
  const rightPad = () => (fc && S().showForecast ? fc.horizon + 3 : 3);

  // ---------- colours ----------
  let C: Record<string, string> = {};
  let theme: 'dark' | 'light' = 'dark';
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['acc', 'acc-ink', 'on-acc', 'up', 'down', 'ink', 'mute', 'faint', 'line', 'line-2', 'bg', 'bg-2', 'bg-3']) C[k] = cs.getPropertyValue(`--${k}`).trim();
    theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  }
  readColors();
  const alpha = (hex: string, a: number) => {
    const m = hex.replace('#', '');
    const n = parseInt(m.length === 3 ? m.replace(/(.)/g, '$1$1') : m, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  // ---------- layout ----------
  const AXIS = 70, TIMES = 24, TOP = 10;
  let W = 0, H = 0, dpr = 1;
  const lay = { pw: 0, pTop: TOP, pH: 0, vTop: 0, vH: 0, bw: 1, L: 0 };
  function layout() {
    lay.pw = W - AXIS;
    const avail = H - TIMES - TOP;
    const vol = S().showVolume && bars.some((b) => b.v > 0);
    lay.vH = vol ? Math.round(avail * 0.2) : 0;
    lay.pH = avail - lay.vH - (vol ? 10 : 0);
    lay.vTop = TOP + lay.pH + 10;
    lay.bw = lay.pw / (view.count + rightPad());
    lay.L = view.end - view.count + 1;
  }
  const xOf = (i: number) => (i - lay.L + 0.5) * lay.bw;
  const iOf = (x: number) => x / lay.bw - 0.5 + lay.L;
  const f = (p: number) => (S().logScale ? Math.log(Math.max(p, 1e-9)) : p);
  const fInv = (v: number) => (S().logScale ? Math.exp(v) : v);
  const yOf = (p: number) => lay.pTop + (1 - (f(p) - f(yr.lo)) / (f(yr.hi) - f(yr.lo) || 1)) * lay.pH;
  const pOf = (y: number) => fInv(f(yr.lo) + (1 - (y - lay.pTop) / lay.pH) * (f(yr.hi) - f(yr.lo)));

  /** Fractional bar index of a time, so drawings and Claude's notes stay put across ranges. */
  function idxOfTime(t: number) {
    const n = bars.length;
    if (!n) return 0;
    const step = n > 1 ? (bars[n - 1].t - bars[0].t) / (n - 1) : SEC[interval] ?? 60;
    if (t <= bars[0].t) return (t - bars[0].t) / step;
    if (t >= bars[n - 1].t) return n - 1 + (t - bars[n - 1].t) / (SEC[interval] ?? step);
    let a = 0, b = n - 1;
    while (b - a > 1) { const m = (a + b) >> 1; if (bars[m].t <= t) a = m; else b = m; }
    return a + (t - bars[a].t) / (bars[b].t - bars[a].t || 1);
  }
  function timeOfIdx(i: number) {
    const n = bars.length;
    if (!n) return 0;
    if (i >= n - 1) return bars[n - 1].t + (i - (n - 1)) * (SEC[interval] ?? 60);
    if (i <= 0) return bars[0].t + i * (n > 1 ? (bars[n - 1].t - bars[0].t) / (n - 1) : 60);
    const a = Math.floor(i);
    return bars[a].t + (i - a) * (bars[a + 1].t - bars[a].t);
  }

  // ---------- indicators (computed once per draw for the whole series; cheap at these sizes) ----------
  function indicatorSeries() {
    const closes = bars.map((b) => b.c);
    const out: { key: Indicator; label: string; vals: (number | null)[]; color: string }[] = [];
    const cols = IND_COLOR[theme];
    for (const k of prefs.ind) {
      if (k === 'sma20') out.push({ key: k, label: 'SMA 20', vals: sma(closes, 20), color: cols.sma20 });
      if (k === 'sma50') out.push({ key: k, label: 'SMA 50', vals: sma(closes, 50), color: cols.sma50 });
      if (k === 'sma200') out.push({ key: k, label: 'SMA 200', vals: sma(closes, 200), color: cols.sma200 });
      if (k === 'ema21') out.push({ key: k, label: 'EMA 21', vals: ema(closes, 21), color: cols.ema21 });
      if (k === 'vwap' && data?.intraday) out.push({ key: k, label: 'VWAP', vals: vwap(bars, (t) => nyFormat(t, { year: 'numeric', month: '2-digit', day: '2-digit' })), color: cols.vwap });
    }
    return out;
  }

  // ---------- drawing ----------
  let raf = 0;
  let hoverI: number | null = null;
  let hoverY: number | null = null;
  let measure: { i1: number; p1: number; i2: number; p2: number } | null = null;
  let draft: Drawing | null = null;
  let hits: { x: number; y: number; w: number; h: number; title: string; detail: string }[] = [];
  function dirty() { if (!raf) raf = requestAnimationFrame(frame); }

  function frame() {
    raf = 0;
    // ease the view toward its target (smooth zoom) and the price scale toward its fit
    let moving = false;
    const ease = animate() ? 0.28 : 1;
    for (const k of ['end', 'count'] as const) {
      const d = target[k] - view[k];
      if (Math.abs(d) > 0.01) { view[k] += d * ease; moving = true; } else view[k] = target[k];
    }
    if (reveal < 1) { reveal = Math.min(1, reveal + 0.06); moving = true; }
    draw();
    const fit = fitY();
    if (fit) {
      if (!yr.ready || !animate()) { yr.lo = fit.lo; yr.hi = fit.hi; yr.ready = true; }
      else {
        const dl = fit.lo - yr.lo, dh = fit.hi - yr.hi;
        const span = yr.hi - yr.lo || 1;
        if (Math.abs(dl) / span > 0.001 || Math.abs(dh) / span > 0.001) { yr.lo += dl * 0.25; yr.hi += dh * 0.25; moving = true; }
        else { yr.lo = fit.lo; yr.hi = fit.hi; }
      }
    }
    if (moving) dirty();
  }

  /** The price range that fits the visible bars (plus the forecast and bands when shown). */
  function fitY() {
    const n = bars.length;
    if (n < 2) return null;
    layout();
    const a = clamp(Math.floor(lay.L), 0, n - 1), b = clamp(Math.ceil(view.end), 0, n - 1);
    const lineish = ['line', 'colored-line', 'vertex-line', 'step', 'mountain', 'baseline', 'points'].includes(S().chartType);
    let lo = Infinity, hi = -Infinity;
    for (let i = a; i <= b; i++) {
      lo = Math.min(lo, lineish ? bars[i].c : bars[i].l);
      hi = Math.max(hi, lineish ? bars[i].c : bars[i].h);
    }
    if (prefs.ind.includes('bb')) {
      const bb = bollinger(bars.map((x) => x.c));
      for (let i = a; i <= b; i++) { if (bb.up[i] != null) hi = Math.max(hi, bb.up[i]!); if (bb.dn[i] != null) lo = Math.min(lo, bb.dn[i]!); }
    }
    if (fc && S().showForecast && b >= n - 2) {
      const last = fc.in90[fc.horizon - 1];
      lo = Math.min(lo, last[0]); hi = Math.max(hi, last[1]);
    }
    if (!isFinite(lo)) return null;
    const pad = (hi - lo) * 0.07 || hi * 0.01 || 1;
    return { lo: Math.max(S().logScale ? hi * 1e-4 : -Infinity, lo - pad), hi: hi + pad };
  }

  function draw() {
    const n = bars.length;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    hits = [];
    if (n < 2 || !yr.ready) { if (n >= 2) dirty(); return; }
    layout();
    const s = S();
    const a = clamp(Math.floor(lay.L) - 1, 0, n - 1), b = clamp(Math.ceil(view.end) + 1, 0, n - 1);
    const visHi = clamp(Math.ceil(view.end), 0, n - 1);

    ctx.font = '11px "JetBrains Mono", Consolas, monospace';
    ctx.textBaseline = 'middle';

    // grid + price axis
    const ticks = niceTicks(yr.lo, yr.hi, Math.max(3, Math.floor(lay.pH / 56)));
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    ctx.fillStyle = C.mute; ctx.textAlign = 'left';
    for (const t of ticks) {
      const y = Math.round(yOf(t)) + 0.5;
      if (y < lay.pTop - 2 || y > lay.pTop + lay.pH + 2) continue;
      line(0, y, lay.pw, y);
      ctx.fillText(fmtPrice(t), lay.pw + 10, y);
    }
    // time axis
    const tks = timeTicks(a, b);
    ctx.textAlign = 'center';
    for (const { i, label } of tks) {
      const x = Math.round(xOf(i)) + 0.5;
      ctx.strokeStyle = C.line;
      line(x, lay.pTop, x, lay.pTop + lay.pH);
      if (lay.vH) line(x, lay.vTop, x, lay.vTop + lay.vH);
      ctx.fillStyle = C.mute;
      ctx.fillText(label, clamp(x, 24, lay.pw - 24), H - TIMES / 2);
    }
    ctx.strokeStyle = C['line-2'];
    line(lay.pw + 0.5, 0, lay.pw + 0.5, H - TIMES);
    line(0, H - TIMES + 0.5, W, H - TIMES + 0.5);

    // clip to the plot (and reveal left to right when new data arrives)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, lay.pw * (reveal < 1 ? easeOut(reveal) : 1) + (reveal < 1 ? 0 : 0), H - TIMES);
    ctx.clip();

    // previous close (1D)
    if (range === '1D' && s.showPrevClose && data) {
      const y = Math.round(yOf(data.prev)) + 0.5;
      ctx.setLineDash([4, 4]); ctx.strokeStyle = C['line-2'];
      line(0, y, lay.pw, y);
      ctx.setLineDash([]);
      ctx.fillStyle = C.mute; ctx.textAlign = 'left';
      ctx.fillText(`Prev close ${fmtPrice(data.prev)}`, 8, y - 9);
    }

    // volume pane
    if (lay.vH) {
      const maxV = volScale(a, b);
      const w = Math.max(1, lay.bw * 0.7);
      for (let i = a; i <= b; i++) {
        const bar = bars[i];
        const up = bar.c >= (i ? bars[i - 1].c : bar.o);
        const hgt = maxV ? Math.min(1, bar.v / maxV) * (lay.vH - 4) : 0;
        ctx.fillStyle = alpha(up ? C.up : C.down, 0.4);
        ctx.fillRect(xOf(i) - w / 2, lay.vTop + lay.vH - hgt, w, hgt);
      }
      ctx.fillStyle = C.faint; ctx.textAlign = 'left';
      ctx.fillText('Volume', 8, lay.vTop + 8);
    }

    // Bollinger band (behind price)
    const closes = bars.map((x) => x.c);
    if (prefs.ind.includes('bb')) {
      const bb = bollinger(closes);
      ctx.beginPath();
      let started = false;
      for (let i = a; i <= b; i++) if (bb.up[i] != null) { const x = xOf(i), y = yOf(bb.up[i]!); started ? ctx.lineTo(x, y) : ctx.moveTo(x, y); started = true; }
      for (let i = b; i >= a; i--) if (bb.dn[i] != null) ctx.lineTo(xOf(i), yOf(bb.dn[i]!));
      ctx.closePath();
      ctx.fillStyle = alpha(C.mute, 0.07); ctx.fill();
      ctx.strokeStyle = alpha(C.mute, 0.45); ctx.lineWidth = 1;
      series(bb.up, a, b); series(bb.dn, a, b);
      ctx.setLineDash([3, 3]); series(bb.mid, a, b); ctx.setLineDash([]);
    }

    drawPrice(a, b);

    // indicator lines
    const inds = indicatorSeries();
    ctx.lineWidth = 1.5;
    for (const ind of inds) { ctx.strokeStyle = ind.color; series(ind.vals, a, b); }

    // forecast cone
    if (fc && s.showForecast) drawForecast(fc);

    // automatic notes, then Claude's
    if (s.showAnnotations) drawNotes(a, visHi);
    if (ai) drawAi();

    // your drawings
    for (const d of draft ? [...drawings, draft] : drawings) drawDrawing(d);
    if (measure) drawMeasure(measure);
    ctx.restore();

    // last price tag on the axis
    const lastBar = bars[n - 1];
    const ly = yOf(lastBar.c);
    if (ly > lay.pTop - 6 && ly < lay.pTop + lay.pH + 6) {
      const up = lastBar.c >= (n > 1 ? bars[n - 2].c : lastBar.o);
      axisTag(ly, fmtPrice(lastBar.c), up ? C.up : C.down, theme === 'dark' ? '#0B0B09' : '#FFFFFF');
    }
    // horizontal-line drawings get a tag too
    for (const d of drawings) if (d.kind === 'hline') axisTag(yOf(d.p1), fmtPrice(d.p1), C.acc, C['on-acc']);

    // legend (values at the hovered bar)
    const li = hoverI ?? n - 1;
    let lx = 8;
    ctx.textAlign = 'left';
    for (const ind of inds) {
      const v = ind.vals[li];
      const text = `${ind.label} ${v != null ? fmtPrice(v) : '—'}`;
      ctx.fillStyle = ind.color;
      ctx.fillText(text, lx, lay.pTop + 8);
      lx += ctx.measureText(text).width + 16;
    }

    // crosshair
    if (hoverI != null && hoverY != null && !dragging) {
      const x = Math.round(xOf(hoverI)) + 0.5;
      ctx.setLineDash([3, 4]); ctx.strokeStyle = alpha(C.ink, 0.45); ctx.lineWidth = 1;
      line(x, 0, x, H - TIMES);
      const y = Math.round(hoverY) + 0.5;
      if (y >= lay.pTop && y <= lay.pTop + lay.pH) line(0, y, lay.pw, y);
      ctx.setLineDash([]);
      if (y >= lay.pTop && y <= lay.pTop + lay.pH) axisTag(y, fmtPrice(pOf(y)), C.ink, C.bg);
      const tl = stamp(hoverI <= n - 1 ? bars[clamp(Math.round(hoverI), 0, n - 1)].t : timeOfIdx(hoverI), true);
      ctx.font = '11px "JetBrains Mono", Consolas, monospace';
      const tw = ctx.measureText(tl).width + 14;
      const tx = clamp(x - tw / 2, 0, lay.pw - tw);
      ctx.fillStyle = C.ink; roundRect(tx, H - TIMES + 3, tw, TIMES - 6, 5); ctx.fill();
      ctx.fillStyle = C.bg; ctx.textAlign = 'center'; ctx.fillText(tl, tx + tw / 2, H - TIMES / 2);
    }
  }

  function drawPrice(a: number, b: number) {
    const type = S().chartType;
    const bw = lay.bw;
    const body = Math.max(1, Math.min(bw * 0.72, bw - 1));
    const prevC = (i: number) => (i ? bars[i - 1].c : bars[i].o);
    const px = (v: number) => Math.round(v) + 0.5;
    ctx.lineWidth = 1;

    const candle = (i: number, w: number, hollowUp: boolean) => {
      const bar = bars[i], x = xOf(i);
      const rising = bar.c >= bar.o;
      const col = (type === 'hollow-candle' ? bar.c >= prevC(i) : rising) ? C.up : C.down;
      ctx.strokeStyle = col; ctx.fillStyle = col;
      line(px(x), yOf(bar.h), px(x), yOf(bar.l));
      const y1 = yOf(Math.max(bar.o, bar.c)), y2 = yOf(Math.min(bar.o, bar.c));
      const hgt = Math.max(1, y2 - y1);
      if (hollowUp && rising) {
        ctx.fillStyle = C.bg; ctx.fillRect(x - w / 2, y1, w, hgt);
        ctx.strokeRect(Math.round(x - w / 2) + 0.5, Math.round(y1) + 0.5, Math.max(1, Math.round(w) - 1), Math.max(1, Math.round(hgt) - 1));
      } else ctx.fillRect(x - w / 2, y1, w, hgt);
    };

    if (type === 'candle' || type === 'hollow-candle') {
      for (let i = a; i <= b; i++) candle(i, body, type === 'hollow-candle');
    } else if (type === 'volume-candle') {
      const maxV = volScale(a, b);
      for (let i = a; i <= b; i++) candle(i, maxV ? Math.max(1, Math.min(1, bars[i].v / maxV) * bw * 0.95) : body, false);
    } else if (type === 'bar' || type === 'colored-bar' || type === 'colored-hlc') {
      const tick = Math.max(1.5, Math.min(bw * 0.35, 6));
      ctx.lineWidth = bw > 6 ? 1.5 : 1;
      for (let i = a; i <= b; i++) {
        const bar = bars[i], x = px(xOf(i));
        ctx.strokeStyle = type === 'bar' ? alpha(C.ink, 0.85) : bar.c >= prevC(i) ? C.up : C.down;
        line(x, yOf(bar.h), x, yOf(bar.l));
        if (type !== 'colored-hlc') line(x - tick, yOf(bar.o), x, yOf(bar.o));
        line(x, yOf(bar.c), x + tick, yOf(bar.c));
      }
    } else if (type === 'histogram') {
      const base = lay.pTop + lay.pH;
      for (let i = a; i <= b; i++) {
        const bar = bars[i];
        ctx.fillStyle = alpha(bar.c >= prevC(i) ? C.up : C.down, 0.75);
        const y = yOf(bar.c);
        ctx.fillRect(xOf(i) - body / 2, y, body, base - y);
      }
    } else if (type === 'points') {
      ctx.fillStyle = C.acc;
      const r = clamp(bw * 0.28, 1.4, 3.2);
      for (let i = a; i <= b; i++) { ctx.beginPath(); ctx.arc(xOf(i), yOf(bars[i].c), r, 0, Math.PI * 2); ctx.fill(); }
    } else if (type === 'colored-line') {
      ctx.lineWidth = 2; ctx.lineJoin = 'round';
      for (let i = Math.max(a, 1); i <= b; i++) {
        ctx.strokeStyle = bars[i].c >= bars[i - 1].c ? C.up : C.down;
        line(xOf(i - 1), yOf(bars[i - 1].c), xOf(i), yOf(bars[i].c));
      }
    } else if (type === 'baseline') {
      const baseP = range === '1D' && data ? data.prev : bars[clamp(Math.floor(lay.L), 0, bars.length - 1)].c;
      const by = yOf(baseP);
      const path = () => { ctx.beginPath(); for (let i = a; i <= b; i++) { const x = xOf(i), y = yOf(bars[i].c); i === a ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } };
      for (const [top, col] of [[true, C.up], [false, C.down]] as [boolean, string][]) {
        ctx.save();
        ctx.beginPath();
        if (top) ctx.rect(0, 0, lay.pw, by); else ctx.rect(0, by, lay.pw, H);
        ctx.clip();
        path(); ctx.lineTo(xOf(b), by); ctx.lineTo(xOf(a), by); ctx.closePath();
        ctx.fillStyle = alpha(col, 0.16); ctx.fill();
        path(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
        ctx.restore();
      }
      ctx.setLineDash([4, 4]); ctx.strokeStyle = C['line-2']; ctx.lineWidth = 1;
      line(0, Math.round(by) + 0.5, lay.pw, Math.round(by) + 0.5);
      ctx.setLineDash([]);
    } else {
      // line, vertex-line, step, mountain
      ctx.beginPath();
      for (let i = a; i <= b; i++) {
        const x = xOf(i), y = yOf(bars[i].c);
        if (i === a) ctx.moveTo(x, y);
        else if (type === 'step') { ctx.lineTo(x, yOf(bars[i - 1].c)); ctx.lineTo(x, y); }
        else ctx.lineTo(x, y);
      }
      if (type === 'mountain') {
        ctx.save();
        ctx.lineTo(xOf(b), lay.pTop + lay.pH); ctx.lineTo(xOf(a), lay.pTop + lay.pH); ctx.closePath();
        const g = ctx.createLinearGradient(0, lay.pTop, 0, lay.pTop + lay.pH);
        g.addColorStop(0, alpha(C.acc, 0.32)); g.addColorStop(1, alpha(C.acc, 0.02));
        ctx.fillStyle = g; ctx.fill();
        ctx.restore();
        ctx.beginPath();
        for (let i = a; i <= b; i++) { const x = xOf(i), y = yOf(bars[i].c); i === a ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      }
      ctx.strokeStyle = C.acc; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      ctx.stroke();
      if (type === 'vertex-line' && bw > 3) {
        ctx.fillStyle = C.acc;
        const r = clamp(bw * 0.22, 1.6, 3);
        for (let i = a; i <= b; i++) { ctx.beginPath(); ctx.arc(xOf(i), yOf(bars[i].c), r, 0, Math.PI * 2); ctx.fill(); }
      }
    }
  }

  function drawForecast(f: Forecast) {
    const n = bars.length;
    const x0 = xOf(n - 1), p0 = bars[n - 1].c, y0 = yOf(p0);
    const band = (sel: (k: number) => [number, number], fill: string) => {
      ctx.beginPath(); ctx.moveTo(x0, y0);
      for (let k = 1; k <= f.horizon; k++) ctx.lineTo(xOf(n - 1 + k), yOf(sel(k - 1)[1]));
      for (let k = f.horizon; k >= 1; k--) ctx.lineTo(xOf(n - 1 + k), yOf(sel(k - 1)[0]));
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    };
    band((k) => f.in90[k], alpha(C.acc, 0.09));
    band((k) => f.in50[k], alpha(C.acc, 0.16));
    ctx.setLineDash([5, 4]); ctx.strokeStyle = C.acc; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x0, y0);
    for (let k = 1; k <= f.horizon; k++) ctx.lineTo(xOf(n - 1 + k), yOf(f.mid[k - 1]));
    ctx.stroke(); ctx.setLineDash([]);
    // "now" divider
    ctx.strokeStyle = alpha(C.acc, 0.35); ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    line(Math.round(x0) + 0.5, lay.pTop, Math.round(x0) + 0.5, lay.pTop + lay.pH);
    ctx.setLineDash([]);
    // end label
    const xe = xOf(n - 1 + f.horizon), ye = yOf(f.mid[f.horizon - 1]);
    const label = `${Math.round(f.pUp * 100)}% higher`;
    ctx.font = '600 11px "Inter", system-ui, sans-serif';
    const w = ctx.measureText(label).width + 14;
    const bx = clamp(xe - w - 4, 4, lay.pw - w - 4);
    ctx.fillStyle = C.acc; roundRect(bx, ye - 10, w, 20, 10); ctx.fill();
    ctx.fillStyle = C['on-acc']; ctx.textAlign = 'center'; ctx.fillText(label, bx + w / 2, ye);
    hits.push({ x: bx, y: ye - 10, w, h: 20, title: `Forecast: ${label} in ${f.horizon} bars`, detail: `Middle ${fmtPrice(f.mid[f.horizon - 1])}. Half the time it should land between ${fmtPrice(f.in50[f.horizon - 1][0])} and ${fmtPrice(f.in50[f.horizon - 1][1])}; nine times in ten between ${fmtPrice(f.in90[f.horizon - 1][0])} and ${fmtPrice(f.in90[f.horizon - 1][1])}.` });
    ctx.font = '11px "JetBrains Mono", Consolas, monospace';
  }

  function drawNotes(a: number, b: number) {
    ctx.font = '500 10.5px "Inter", system-ui, sans-serif';
    for (const nt of notes) {
      const col = nt.kind === 'support' || nt.kind === 'cross-up' || nt.kind === 'gap-up' ? C.up
        : nt.kind === 'resistance' || nt.kind === 'cross-down' || nt.kind === 'gap-down' ? C.down : C.mute;
      if (nt.level) {
        const y = Math.round(yOf(nt.price)) + 0.5;
        if (y < lay.pTop || y > lay.pTop + lay.pH) continue;
        ctx.strokeStyle = alpha(col, 0.55); ctx.setLineDash([6, 5]); ctx.lineWidth = 1;
        line(0, y, lay.pw, y); ctx.setLineDash([]);
        const text = `${nt.kind === 'support' ? 'Support' : 'Resistance'} ${fmtPrice(nt.price)}`;
        const w = ctx.measureText(text).width + 12;
        const x = lay.pw - w - 6;
        ctx.fillStyle = alpha(col, theme === 'dark' ? 0.16 : 0.12); roundRect(x, y - 9, w, 18, 9); ctx.fill();
        ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.fillText(text, x + w / 2, y);
        hits.push({ x, y: y - 9, w, h: 18, title: nt.label, detail: nt.detail });
        continue;
      }
      if (nt.i < a || nt.i > b) continue;
      const x = xOf(nt.i);
      if (nt.kind === 'volume') {
        if (!lay.vH) continue;
        const y = lay.vTop + 12;
        dot(x, y, 3, C.acc);
        hits.push({ x: x - 6, y: y - 6, w: 12, h: 12, title: nt.label, detail: nt.detail });
        continue;
      }
      const above = nt.kind === 'high' || nt.kind === 'cross-down' || nt.kind === 'gap-down';
      const bar = bars[nt.i];
      const y = above ? yOf(bar.h) - 10 : yOf(bar.l) + 10;
      if (nt.kind === 'cross-up' || nt.kind === 'cross-down') {
        ctx.fillStyle = col; ctx.beginPath();
        if (above) { ctx.moveTo(x, y + 4); ctx.lineTo(x - 5, y - 4); ctx.lineTo(x + 5, y - 4); }
        else { ctx.moveTo(x, y - 4); ctx.lineTo(x - 5, y + 4); ctx.lineTo(x + 5, y + 4); }
        ctx.fill();
        hits.push({ x: x - 7, y: y - 7, w: 14, h: 14, title: nt.label, detail: nt.detail });
        continue;
      }
      const text = nt.kind === 'high' || nt.kind === 'low' ? `${nt.kind === 'high' ? 'High' : 'Low'} ${fmtPrice(nt.price)}` : nt.label;
      const w = ctx.measureText(text).width + 10;
      const tx = clamp(x - w / 2, 2, lay.pw - w - 2);
      const ty = above ? y - 8 : y + 8;
      ctx.strokeStyle = alpha(col, 0.6); ctx.lineWidth = 1;
      line(x, above ? yOf(bar.h) - 2 : yOf(bar.l) + 2, x, above ? ty + 8 : ty - 8);
      ctx.fillStyle = C.bg; roundRect(tx, ty - 8, w, 16, 8); ctx.fill();
      ctx.strokeStyle = alpha(col, 0.5); roundRect(tx + 0.5, ty - 7.5, w - 1, 15, 7.5); ctx.stroke();
      ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.fillText(text, tx + w / 2, ty);
      hits.push({ x: tx, y: ty - 8, w, h: 16, title: nt.label, detail: nt.detail });
    }
    ctx.font = '11px "JetBrains Mono", Consolas, monospace';
  }

  function drawAi() {
    if (!ai) return;
    ctx.font = '600 10.5px "Inter", system-ui, sans-serif';
    for (const an of ai.annotations) {
      const i = idxOfTime(an.time);
      const x = xOf(i), y = yOf(an.price);
      if (x < -20 || x > lay.pw + 20 || y < lay.pTop - 10 || y > lay.pTop + lay.pH + 10) continue;
      if (an.kind === 'support' || an.kind === 'resistance') {
        ctx.strokeStyle = alpha(C.acc, 0.6); ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
        line(x, Math.round(y) + 0.5, lay.pw, Math.round(y) + 0.5); ctx.setLineDash([]);
      }
      dot(x, y, 3.5, C.acc);
      const text = `✦ ${an.label}`;
      const w = ctx.measureText(text).width + 14;
      const tx = clamp(x + 8, 2, lay.pw - w - 2), ty = clamp(y - 22, lay.pTop + 2, lay.pTop + lay.pH - 20);
      ctx.fillStyle = alpha(C.acc, theme === 'dark' ? 0.18 : 0.14); roundRect(tx, ty, w, 18, 9); ctx.fill();
      ctx.strokeStyle = alpha(C.acc, 0.7); roundRect(tx + 0.5, ty + 0.5, w - 1, 17, 8.5); ctx.stroke();
      ctx.fillStyle = C['acc-ink']; ctx.textAlign = 'center'; ctx.fillText(text, tx + w / 2, ty + 9);
      hits.push({ x: tx, y: ty, w, h: 18, title: `Claude: ${an.label}`, detail: `${an.kind[0].toUpperCase()}${an.kind.slice(1)} at ${fmtPrice(an.price)}, ${stamp(an.time, data?.intraday ?? false)}.` });
    }
    ctx.font = '11px "JetBrains Mono", Consolas, monospace';
  }

  function drawDrawing(d: Drawing) {
    ctx.strokeStyle = C.acc; ctx.fillStyle = C.acc; ctx.lineWidth = 1.5;
    if (d.kind === 'hline') {
      const y = Math.round(yOf(d.p1)) + 0.5;
      line(0, y, lay.pw, y);
    } else if (d.kind === 'trend' && d.t2 != null && d.p2 != null) {
      const x1 = xOf(idxOfTime(d.t1)), y1 = yOf(d.p1), x2 = xOf(idxOfTime(d.t2)), y2 = yOf(d.p2);
      line(x1, y1, x2, y2);
      dot(x1, y1, 3, C.acc); dot(x2, y2, 3, C.acc);
      const ch = d.p2 - d.p1;
      ctx.font = '10.5px "JetBrains Mono", Consolas, monospace';
      ctx.fillStyle = C['acc-ink']; ctx.textAlign = 'left';
      ctx.fillText(`${signed(ch)} (${pct(ch, d.p1)})`, Math.max(x1, x2) + 8, (x2 > x1 ? y2 : y1));
      ctx.font = '11px "JetBrains Mono", Consolas, monospace';
    } else if (d.kind === 'note') {
      const x = xOf(idxOfTime(d.t1)), y = yOf(d.p1);
      ctx.font = '500 12px "Inter", system-ui, sans-serif';
      const text = d.text ?? '';
      const w = Math.min(260, ctx.measureText(text).width + 18);
      dot(x, y, 3.5, C.acc);
      ctx.fillStyle = C['bg-3']; roundRect(x + 8, y - 26, w, 22, 8); ctx.fill();
      ctx.strokeStyle = C.acc; ctx.lineWidth = 1; roundRect(x + 8.5, y - 25.5, w - 1, 21, 7.5); ctx.stroke();
      ctx.fillStyle = C.ink; ctx.textAlign = 'left'; ctx.fillText(text, x + 17, y - 15, w - 18);
      ctx.font = '11px "JetBrains Mono", Consolas, monospace';
    }
  }

  function drawMeasure(m: { i1: number; p1: number; i2: number; p2: number }) {
    const x1 = xOf(m.i1), y1 = yOf(m.p1), x2 = xOf(m.i2), y2 = yOf(m.p2);
    const up = m.p2 >= m.p1;
    const col = up ? C.up : C.down;
    ctx.fillStyle = alpha(col, 0.12);
    ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    line(x1, y1, x2, y2);
    const ch = m.p2 - m.p1, nb = Math.round(Math.abs(m.i2 - m.i1));
    const text = `${signed(ch)}  ${pct(ch, m.p1)}  ·  ${nb} bar${nb === 1 ? '' : 's'}`;
    ctx.font = '600 11px "Inter", system-ui, sans-serif';
    const w = ctx.measureText(text).width + 16;
    const bx = clamp((x1 + x2) / 2 - w / 2, 2, lay.pw - w - 2), by = clamp(Math.min(y1, y2) - 26, 2, H - 40);
    ctx.fillStyle = col; roundRect(bx, by, w, 20, 10); ctx.fill();
    ctx.fillStyle = theme === 'dark' ? '#0B0B09' : '#FFFFFF'; ctx.textAlign = 'center'; ctx.fillText(text, bx + w / 2, by + 10);
    ctx.font = '11px "JetBrains Mono", Consolas, monospace';
  }

  /** The volume that fills the pane: the visible maximum, but no more than 4× the 90th percentile,
   *  so one bad print (Yahoo has some) doesn't flatten every other bar. Taller bars are capped. */
  function volScale(a: number, b: number) {
    const vs: number[] = [];
    for (let i = a; i <= b; i++) if (bars[i].v > 0) vs.push(bars[i].v);
    if (!vs.length) return 0;
    vs.sort((x, y) => x - y);
    return Math.min(vs[vs.length - 1], 4 * vs[Math.floor(vs.length * 0.9)]);
  }

  // canvas helpers
  function line(x1: number, y1: number, x2: number, y2: number) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function dot(x: number, y: number, r: number, col: string) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  function roundRect(x: number, y: number, w: number, hh: number, r: number) { ctx.beginPath(); ctx.roundRect(x, y, w, hh, r); }
  function series(vals: (number | null)[], a: number, b: number) {
    ctx.beginPath();
    let on = false;
    for (let i = a; i <= b; i++) {
      const v = vals[i];
      if (v == null) { on = false; continue; }
      const x = xOf(i), y = yOf(v);
      on ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      on = true;
    }
    ctx.stroke();
  }
  function axisTag(y: number, text: string, bg: string, fg: string) {
    ctx.font = '500 11px "JetBrains Mono", Consolas, monospace';
    ctx.fillStyle = bg; roundRect(lay.pw + 3, y - 10, AXIS - 6, 20, 6); ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.fillText(text, lay.pw + 9, y);
    ctx.font = '11px "JetBrains Mono", Consolas, monospace';
  }

  const intradayFmt: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  const dayFmt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  function stamp(t: number, full: boolean) {
    const intra = data?.intraday ?? false;
    if (intra) return nyFormat(t, full ? intradayFmt : { hour: 'numeric', minute: '2-digit' });
    return nyFormat(t, interval === '1mo' || interval === '3mo' ? { month: 'short', year: 'numeric' } : dayFmt);
  }

  /** Time labels where the calendar unit changes, spaced at least ~80px apart. */
  function timeTicks(a: number, b: number) {
    const n = bars.length;
    if (n < 2) return [];
    const span = bars[clamp(b, 0, n - 1)].t - bars[clamp(a, 0, n - 1)].t;
    const intra = data?.intraday ?? false;
    const key = (t: number) =>
      intra ? (span < 1.3 * 86400 ? nyFormat(t, { hour: 'numeric' }) : nyFormat(t, { month: 'numeric', day: 'numeric' }))
        : span < 400 * 86400 ? nyFormat(t, { year: 'numeric', month: 'numeric' })
          : nyFormat(t, { year: 'numeric' });
    const label = (t: number) =>
      intra ? (span < 1.3 * 86400 ? nyFormat(t, { hour: 'numeric', minute: '2-digit' }) : nyFormat(t, { weekday: 'short', day: 'numeric' }))
        : span < 400 * 86400 ? (nyFormat(t, { month: 'numeric' }) === '1' ? nyFormat(t, { year: 'numeric' }) : nyFormat(t, { month: 'short' }))
          : nyFormat(t, { year: 'numeric' });
    const out: { i: number; label: string }[] = [];
    let prev = key(bars[Math.max(0, a - 1)].t);
    let lastX = -Infinity;
    for (let i = Math.max(a, 1); i <= b; i++) {
      const k = key(bars[i].t);
      if (k !== prev) {
        const x = xOf(i);
        if (x - lastX >= 80 && x > 10 && x < lay.pw - 10) { out.push({ i, label: label(bars[i].t) }); lastX = x; }
        prev = k;
      }
    }
    return out;
  }

  // ---------- header readout ----------
  function paintOhlc(i: number) {
    const n = bars.length;
    if (!n) return;
    const bar = bars[clamp(Math.round(i), 0, n - 1)];
    const idx = clamp(Math.round(i), 0, n - 1);
    const pc = idx ? bars[idx - 1].c : range === '1D' && data ? data.prev : bar.o;
    const ch = bar.c - pc;
    cells.Open.textContent = fmtPrice(bar.o);
    cells.High.textContent = fmtPrice(bar.h);
    cells.Low.textContent = fmtPrice(bar.l);
    cells.Close.textContent = fmtPrice(bar.c);
    cells.Vol.textContent = bar.v ? volFmt.format(bar.v) : '—';
    cells.Change.textContent = signed(ch);
    cells['Chg %'].textContent = pct(ch, pc);
    for (const k of ['Close', 'Change', 'Chg %']) cells[k].className = `num ${tone(ch)}`;
    when.textContent = stamp(bar.t, true);
  }

  // ---------- panel ----------
  const horizonText = (k: number) => {
    const sec = (SEC[interval] ?? 86400) * k;
    if (data?.intraday) return sec < 5400 ? `about ${Math.round(sec / 60)} minutes` : sec < 6.5 * 3600 * 1.5 ? `about ${(sec / 3600).toFixed(1).replace(/\.0$/, '')} hours` : `about ${Math.round(sec / (6.5 * 3600))} trading days`;
    if (interval === '1d') return k <= 10 ? `about ${k} trading days` : `about ${Math.round(k / 5)} weeks`;
    if (interval === '1wk') return k <= 8 ? `about ${k} weeks` : `about ${Math.round(k / 4.3)} months`;
    return k <= 18 ? `about ${k} months` : `about ${(k / 12).toFixed(1).replace(/\.0$/, '')} years`;
  };

  function paintPanel() {
    const s = S();
    const parts: (Node | string)[] = [];
    // outlook
    if (fc) {
      const k = fc.horizon - 1, p0 = bars[bars.length - 1].c;
      const up = Math.round(fc.pUp * 100);
      parts.push(h('section', { class: 'vw-sec' },
        h('p', { class: 'eyebrow' }, 'Forecast · ', horizonText(fc.horizon)),
        h('div', { class: 'vw-odds' }, h('b', { class: `num ${up >= 50 ? 'up' : 'down'}` }, `${up}%`), h('span', null, 'chance it ends higher than now')),
        h('div', { class: 'vw-meter', role: 'img', 'aria-label': `${up}% chance higher` }, h('span', { style: `width:${up}%` })),
        h('dl', { class: 'vw-rows' },
          row('Middle path', `${fmtPrice(fc.mid[k])}`, pct(fc.mid[k] - p0, p0)),
          row('Likely (50%)', `${fmtPrice(fc.in50[k][0])} – ${fmtPrice(fc.in50[k][1])}`),
          row('Wide (90%)', `${fmtPrice(fc.in90[k][0])} – ${fmtPrice(fc.in90[k][1])}`),
          row('Trend', fc.trend === 'flat' ? 'Flat' : fc.trend === 'up' ? 'Rising' : 'Falling'),
          row('Typical move', `${(fc.vol * 100).toFixed(2)}% a bar`)),
        fc.track ? h('p', { class: 'vw-track' },
          `Tested on this chart's own past: the direction was right ${Math.round(fc.track.direction * 100)}% of ${fc.track.tries} tries, and the price landed inside the wide range ${Math.round(fc.track.inside90 * 100)}% of the time.`) : '',
        h('p', { class: 'vw-fine' }, 'A statistical projection from this chart\'s recent trend and volatility. It knows nothing about news and is not advice.')));
    } else if (!s.showForecast) {
      parts.push(h('section', { class: 'vw-sec' }, h('p', { class: 'eyebrow' }, 'Forecast'), h('p', { class: 'mute sm' }, 'The forecast is hidden. Turn it on with Forecast in the toolbar.')));
    } else {
      parts.push(h('section', { class: 'vw-sec' }, h('p', { class: 'eyebrow' }, 'Forecast'), h('p', { class: 'mute sm' }, 'Not enough bars for a forecast. Try a longer range.')));
    }

    // Claude
    const claude = h('section', { class: 'vw-sec vw-ai' }, h('p', { class: 'eyebrow' }, '✦ Claude\'s read'));
    if (!s.apiKey) {
      claude.append(h('p', { class: 'mute sm' }, 'Get a second opinion on this chart from Claude, with notes pinned on it. Needs your own Anthropic API key.'),
        h('button', { type: 'button', class: 'pill sm', onclick: () => { close(); location.hash = '#/settings/ai'; } }, 'Add a key in Settings'));
    } else if (aiBusy) {
      claude.append(h('div', { class: 'vw-thinking' }, h('span'), h('span'), h('span')),
        h('p', { class: 'mute sm' }, `Reading ${Math.min(bars.length, 160)} bars of ${sym}…`),
        h('button', { type: 'button', class: 'link-btn', onclick: () => aiBusy?.abort() }, 'Cancel'));
    } else if (ai) {
      const badge = ai.outlook === 'bullish' ? 'up' : ai.outlook === 'bearish' ? 'down' : '';
      claude.append(
        h('div', { class: 'vw-ai-top' }, h('span', { class: `vw-badge ${badge}` }, ai.outlook[0].toUpperCase() + ai.outlook.slice(1)), h('span', { class: 'mute sm' }, `${ai.confidence} confidence · ${ai.horizon}`)),
        h('p', { class: 'vw-ai-sum' }, ai.summary),
        h('dl', { class: 'vw-rows' }, row('Range', `${fmtPrice(ai.target_low)} – ${fmtPrice(ai.target_high)}`)),
        h('ul', { class: 'vw-list' }, ...ai.points.map((p) => h('li', null, p))),
        ai.risks.length ? h('p', { class: 'eyebrow sub' }, 'What would change it') : '',
        ai.risks.length ? h('ul', { class: 'vw-list risk' }, ...ai.risks.map((p) => h('li', null, p))) : '',
        h('div', { class: 'vw-ai-btns' },
          h('button', { type: 'button', class: 'link-btn', onclick: () => ask() }, 'Ask again'),
          h('button', { type: 'button', class: 'link-btn', onclick: () => { ai = null; aiCache.delete(aiKey()); paintPanel(); dirty(); } }, 'Clear')),
        h('p', { class: 'vw-fine' }, 'Written by Claude from the bars on screen only. It can be wrong; this is not advice.'));
    } else {
      claude.append(h('p', { class: 'mute sm' }, `Claude reads the ${RANGE_LABEL[range]} of ${sym} and pins its notes on the chart.`),
        aiErr ? h('p', { class: 'vw-err sm' }, aiErr) : '',
        h('button', { type: 'button', class: 'pill sm acc', onclick: () => ask() }, '✦ Ask Claude'));
    }
    parts.push(claude);

    // notes
    if (notes.length) {
      const list = h('ul', { class: 'vw-notes' }, ...notes.slice().sort((x, y) => y.i - x.i).map((nt) => {
        const col = /support|up/.test(nt.kind) ? 'up' : /resistance|down/.test(nt.kind) ? 'down' : '';
        return h('li', null, h('button', { type: 'button', title: nt.detail, onclick: () => focusBar(nt.i) },
          h('span', { class: `vw-dot ${col}` }), h('span', { class: 'vw-n-l' }, nt.label), h('span', { class: 'vw-n-p num' }, fmtPrice(nt.price)), h('span', { class: 'vw-n-t num' }, stamp(bars[nt.i].t, false))));
      }));
      parts.push(h('section', { class: 'vw-sec' }, h('div', { class: 'vw-sec-top' }, h('p', { class: 'eyebrow' }, 'Notes on this chart'), s.showAnnotations ? '' : h('span', { class: 'mute sm' }, 'hidden on chart')), list));
    }
    panel.replaceChildren(...parts);
  }
  function row(k: string, v: string, sub = '') { return h('div', null, h('dt', null, k), h('dd', { class: 'num' }, v, sub ? h('small', null, ` ${sub}`) : '')); }

  function focusBar(i: number) {
    target.count = Math.min(target.count, Math.max(30, bars.length / 2));
    target.end = clamp(i + target.count * 0.35, Math.min(bars.length - 1, target.count * 0.5), bars.length - 1);
    hoverI = i;
    hoverY = yOf(bars[i].c);
    paintOhlc(i);
    dirty();
  }

  async function ask() {
    if (!bars.length || aiBusy) return;
    aiBusy = new AbortController();
    aiErr = '';
    paintPanel();
    try {
      const res = await askClaude({
        sym, name: data?.name ?? sym, rangeLabel: RANGE_LABEL[range], interval: INTERVAL_NAME[interval] ?? interval,
        bars, forecast: fc, notes, stamp: (t) => stamp(t, true),
      }, aiBusy.signal);
      ai = res;
      aiCache.set(aiKey(), res);
    } catch (e) {
      if (!aiBusy?.signal.aborted) aiErr = aiError(e);
    } finally {
      aiBusy = null;
      paintPanel();
      dirty();
    }
  }

  // ---------- pointer ----------
  let dragging = false;
  let dragStart: { x: number; end: number; moved: boolean } | null = null;
  const local = (e: PointerEvent | MouseEvent | WheelEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const inPlot = (x: number, y: number) => x >= 0 && x <= lay.pw && y >= 0 && y <= H - TIMES;
  const snapP = (i: number, y: number) => {
    if (!S().magnet) return pOf(y);
    const bar = bars[clamp(Math.round(i), 0, bars.length - 1)];
    const cand = [bar.o, bar.h, bar.l, bar.c];
    const best = cand.reduce((p, c) => (Math.abs(yOf(c) - y) < Math.abs(yOf(p) - y) ? c : p));
    return Math.abs(yOf(best) - y) < 12 ? best : pOf(y);
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (!bars.length) return;
    const { x, y } = local(e);
    if (!inPlot(x, y)) return;
    canvas.setPointerCapture(e.pointerId);
    const i = iOf(x);
    if (tool === 'cursor') { dragging = true; dragStart = { x, end: target.end, moved: false }; stage.classList.add('grabbing'); return; }
    if (tool === 'hline') { drawings.push({ id: Date.now(), kind: 'hline', t1: timeOfIdx(i), p1: snapP(i, y) }); saveDrawings(); setTool('cursor'); return; }
    if (tool === 'trend') { const p = snapP(i, y); draft = { id: Date.now(), kind: 'trend', t1: timeOfIdx(i), p1: p, t2: timeOfIdx(i), p2: p }; dirty(); return; }
    if (tool === 'measure') { const p = snapP(i, y); measure = { i1: Math.round(i), p1: p, i2: Math.round(i), p2: p }; dirty(); return; }
    if (tool === 'note') { startNoteEdit(i, snapP(i, y), x, y); return; }
    if (tool === 'erase') {
      const hit = hitDrawing(x, y);
      if (hit) { drawings = drawings.filter((d) => d !== hit); saveDrawings(); paintToolbar(); dirty(); }
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!bars.length) return;
    const { x, y } = local(e);
    layout();
    const i = iOf(x);
    if (dragging && dragStart) {
      const dx = x - dragStart.x;
      if (Math.abs(dx) > 3) dragStart.moved = true;
      target.end = view.end = clampEnd(dragStart.end - dx / lay.bw, view.count);
      dirty();
      return;
    }
    if (draft && draft.kind === 'trend') { draft.t2 = timeOfIdx(i); draft.p2 = snapP(i, y); }
    if (measure && e.buttons) { measure.i2 = Math.round(i); measure.p2 = snapP(i, y); }
    if (inPlot(x, y)) {
      hoverI = clamp(Math.round(i), 0, Math.max(bars.length - 1, Math.round(i)));
      if (hoverI > bars.length - 1) hoverI = bars.length - 1 + Math.min(Math.round(i) - (bars.length - 1), rightPad());
      const snapI = clamp(Math.round(i), 0, bars.length - 1);
      hoverY = S().magnet && tool === 'cursor' && Math.round(i) <= bars.length - 1 ? yOf(bars[snapI].c) : y;
      paintOhlc(snapI);
      const hit = hits.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
      if (hit) {
        tip.hidden = false;
        tip.replaceChildren(h('b', null, hit.title), h('span', null, hit.detail));
        tip.style.left = `${Math.min(x + 14, W - 270)}px`;
        tip.style.top = `${Math.min(y + 14, H - 90)}px`;
      } else tip.hidden = true;
    } else { hoverI = null; hoverY = null; tip.hidden = true; paintOhlc(bars.length - 1); }
    dirty();
  });
  const endDrag = (e: PointerEvent) => {
    if (dragging) { dragging = false; dragStart = null; stage.classList.remove('grabbing'); }
    if (draft) {
      const { x } = local(e);
      const x1 = xOf(idxOfTime(draft.t1));
      if (Math.abs(x - x1) > 6) { drawings.push(draft); saveDrawings(); }
      draft = null;
      setTool('cursor');
    }
    dirty();
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { if (!dragging) { hoverI = null; hoverY = null; tip.hidden = true; paintOhlc(bars.length - 1); dirty(); } });
  canvas.addEventListener('dblclick', () => { if (tool === 'cursor') { resetView(); dirty(); } });
  canvas.addEventListener('wheel', (e) => {
    if (!bars.length) return;
    e.preventDefault();
    const { x } = local(e);
    layout();
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      target.end = clampEnd(target.end + (e.deltaX / lay.bw) * 0.6, target.count);
    } else zoomAt(x, e.deltaY > 0 ? 1.15 : 1 / 1.15);
    dirty();
  }, { passive: false });

  function clampEnd(end: number, count: number) {
    const n = bars.length;
    return clamp(end, Math.min(n - 1, count * 0.25), n - 1);
  }
  function zoomAt(x: number, factor: number) {
    const n = bars.length;
    const pad = rightPad();
    const bwT = lay.pw / (target.count + pad);
    const LT = target.end - target.count + 1;
    const anchor = x / bwT - 0.5 + LT;
    const count = clamp(target.count * factor, 12, Math.max(12, n * 1.05));
    const bw2 = lay.pw / (count + pad);
    const L2 = anchor - x / bw2 + 0.5;
    target.count = count;
    target.end = clampEnd(L2 + count - 1, count);
  }

  function hitDrawing(x: number, y: number): Drawing | null {
    const near = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
      const dx = x2 - x1, dy = y2 - y1, len = dx * dx + dy * dy || 1;
      const t = clamp(((px - x1) * dx + (py - y1) * dy) / len, 0, 1);
      return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    };
    for (const d of [...drawings].reverse()) {
      if (d.kind === 'hline' && Math.abs(yOf(d.p1) - y) < 7) return d;
      if (d.kind === 'trend' && d.t2 != null && d.p2 != null && near(x, y, xOf(idxOfTime(d.t1)), yOf(d.p1), xOf(idxOfTime(d.t2)), yOf(d.p2)) < 7) return d;
      if (d.kind === 'note') { const nx = xOf(idxOfTime(d.t1)), ny = yOf(d.p1); if (x >= nx - 6 && x <= nx + 270 && y >= ny - 28 && y <= ny + 6) return d; }
    }
    return null;
  }

  // inline note editor
  let noteInput: HTMLInputElement | null = null;
  function startNoteEdit(i: number, p: number, x: number, y: number) {
    endNoteEdit(false);
    const input = h('input', { class: 'vw-note-in', type: 'text', maxlength: '80', placeholder: 'Type a note, then Enter' }) as HTMLInputElement;
    input.style.left = `${Math.min(x + 8, W - 240)}px`;
    input.style.top = `${Math.max(0, y - 28)}px`;
    stage.append(input);
    noteInput = input;
    input.focus();
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = input.value.trim();
        if (text) { drawings.push({ id: Date.now(), kind: 'note', t1: timeOfIdx(i), p1: p, text }); saveDrawings(); }
        endNoteEdit(true);
      } else if (e.key === 'Escape') endNoteEdit(true);
    });
    input.addEventListener('blur', () => window.setTimeout(() => endNoteEdit(false), 100));
  }
  function endNoteEdit(back: boolean) {
    if (!noteInput) return;
    noteInput.remove();
    noteInput = null;
    if (back) setTool('cursor');
    dirty();
  }

  // ---------- keyboard ----------
  function onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (!typeMenu.hidden || !indMenu.hidden) { closeMenus(); return; }
      if (tool !== 'cursor' || measure) { setTool('cursor'); return; }
      close();
      return;
    }
    if (!bars.length) return;
    layout();
    if (e.key === '+' || e.key === '=') { zoomAt(lay.pw * 0.8, 1 / 1.25); dirty(); }
    else if (e.key === '-' || e.key === '_') { zoomAt(lay.pw * 0.8, 1.25); dirty(); }
    else if (e.key === 'ArrowLeft') { target.end = clampEnd(target.end - Math.max(1, target.count * 0.1), target.count); dirty(); }
    else if (e.key === 'ArrowRight') { target.end = clampEnd(target.end + Math.max(1, target.count * 0.1), target.count); dirty(); }
    else if (e.key === '0' || e.key === 'Home') { resetView(); dirty(); }
    else return;
    e.preventDefault();
  }
  document.addEventListener('keydown', onKey, true);

  // ---------- size ----------
  const ro = new ResizeObserver(() => {
    const r = stage.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    W = Math.max(100, r.width); H = Math.max(100, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    dirty();
  });
  ro.observe(stage);

  // ---------- close ----------
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    aiBusy?.abort();
    offLive(); offNeed(); offSettings();
    window.clearInterval(reloadTimer);
    document.removeEventListener('keydown', onKey, true);
    ro.disconnect();
    cancelAnimationFrame(raf);
    openNow = null;
    const done = () => { el.remove(); document.body.classList.remove('viewer-open'); lastFocus?.focus?.({ preventScroll: true }); };
    if (animate() && from?.isConnected) {
      el.animate([
        { clipPath: 'inset(0px 0px 0px 0px round 0px)', opacity: 1 },
        { clipPath: cardInset(from), opacity: 0.4 },
      ], { duration: 320, easing: 'cubic-bezier(.4,0,.2,1)' }).finished.then(done, done);
    } else done();
  }
  openNow = close;

  paintToolbar();
  paintQuote();
  load();
  live.refresh();
  return close;
}

function easeOut(t: number) { return 1 - (1 - t) ** 3; }

/** Round price levels for the axis: steps of 1, 2, 2.5 or 5 × a power of ten. */
function niceTicks(lo: number, hi: number, count: number) {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
