// The chart viewer's analysis, all worked out on this computer from the bars on screen:
// moving averages and bands, a forecast cone (where the price could be a few bars from now,
// and how sure that is), and automatic notes such as support, resistance and volume spikes.
// It is statistics on past prices, not a promise: the cone shows a spread of outcomes on purpose.
import type { Bar } from './api';

// ---------- indicators ----------

export function sma(vals: number[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  vals.forEach((v, i) => {
    sum += v;
    if (i >= n) sum -= vals[i - n];
    out.push(i >= n - 1 ? sum / n : null);
  });
  return out;
}

export function ema(vals: number[], n: number): (number | null)[] {
  const k = 2 / (n + 1);
  let e: number | null = null;
  return vals.map((v, i) => {
    e = e == null ? v : v * k + e * (1 - k);
    return i >= n - 1 ? e : null;
  });
}

export function bollinger(vals: number[], n = 20, w = 2) {
  const mid = sma(vals, n);
  const up: (number | null)[] = [], dn: (number | null)[] = [];
  vals.forEach((_, i) => {
    const m = mid[i];
    if (m == null) { up.push(null); dn.push(null); return; }
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += (vals[j] - m) ** 2;
    const sd = Math.sqrt(s / n);
    up.push(m + w * sd); dn.push(m - w * sd);
  });
  return { mid, up, dn };
}

/** Volume-weighted average price, restarting each day (for intraday bars). */
export function vwap(bars: Bar[], dayOf: (t: number) => string): (number | null)[] {
  let day = '', pv = 0, vol = 0;
  return bars.map((b) => {
    const d = dayOf(b.t);
    if (d !== day) { day = d; pv = 0; vol = 0; }
    const typical = (b.h + b.l + b.c) / 3;
    pv += typical * b.v; vol += b.v;
    return vol > 0 ? pv / vol : null;
  });
}

/** Average true range: how far the price usually moves in one bar. */
export function atr(bars: Bar[], n = 14): number {
  if (bars.length < 2) return 0;
  const from = Math.max(1, bars.length - n);
  let s = 0, k = 0;
  for (let i = from; i < bars.length; i++) {
    const b = bars[i], pc = bars[i - 1].c;
    s += Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
    k++;
  }
  return k ? s / k : 0;
}

export function rsi(vals: number[], n = 14): number | null {
  if (vals.length <= n) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = vals[i] - vals[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  gain /= n; loss /= n;
  for (let i = n + 1; i < vals.length; i++) {
    const d = vals[i] - vals[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}

// ---------- forecast ----------

export interface Forecast {
  horizon: number; // bars ahead
  /** One entry per bar ahead (k = 1..horizon). */
  mid: number[];
  in50: [number, number][];
  in90: [number, number][];
  /** Chance the price is higher than now at the end of the horizon. */
  pUp: number;
  /** Expected change over the horizon, as a fraction. */
  drift: number;
  /** Typical move per bar, as a fraction. */
  vol: number;
  trend: 'up' | 'down' | 'flat';
  /** How it did when run on this same chart's past (walk-forward), if there was enough history. */
  track: { tries: number; direction: number; inside90: number; inside50: number } | null;
}

const Z50 = 0.6745, Z90 = 1.6449;

/** Standard normal CDF (Abramowitz–Stegun). */
function phi(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/**
 * Drift and volatility per bar from closes up to index `end` (inclusive).
 * Drift blends the recent trend (a straight line through the log price) with momentum,
 * then is shrunk heavily toward zero, because most of a trend does not carry on.
 * Volatility is an exponentially weighted average of recent moves, so calm or wild spells count most.
 */
function model(closes: number[], end: number) {
  const n = Math.min(end + 1, 120);
  const start = end + 1 - n;
  const ys = [];
  for (let i = start; i <= end; i++) ys.push(Math.log(closes[i]));
  const rets: number[] = [];
  for (let i = 1; i < ys.length; i++) rets.push(ys[i] - ys[i - 1]);
  if (rets.length < 8) return null;

  // straight-line trend through log prices
  const m = ys.length, mx = (m - 1) / 2, my = ys.reduce((a, b) => a + b, 0) / m;
  let sxy = 0, sxx = 0;
  ys.forEach((y, i) => { sxy += (i - mx) * (y - my); sxx += (i - mx) ** 2; });
  const slope = sxx ? sxy / sxx : 0;
  // fit quality: a clean trend counts for more than a noisy one
  let ssr = 0, sst = 0;
  ys.forEach((y, i) => { ssr += (y - (my + slope * (i - mx))) ** 2; sst += (y - my) ** 2; });
  const r2 = sst ? Math.max(0, 1 - ssr / sst) : 0;

  // momentum: average of the last ~20 moves, weighted to the newest
  let mom = 0, wsum = 0;
  rets.slice(-20).forEach((r, i) => { const w = i + 1; mom += r * w; wsum += w; });
  mom = wsum ? mom / wsum : 0;

  // EWMA volatility (RiskMetrics λ = 0.94)
  let v = rets.slice(0, 10).reduce((a, r) => a + r * r, 0) / Math.min(10, rets.length);
  for (const r of rets) v = 0.94 * v + 0.06 * r * r;
  const vol = Math.sqrt(v) || 1e-4;

  // pull back toward the 50-bar average when far from it (a little mean reversion)
  const look = Math.min(50, m);
  const avg = ys.slice(-look).reduce((a, b) => a + b, 0) / look;
  const stretch = (avg - ys[m - 1]) / (vol * Math.sqrt(look));

  const shrink = 0.25 + 0.25 * r2; // keep only a quarter to a half of the trend
  let mu = shrink * (0.6 * slope + 0.4 * mom) + 0.02 * vol * Math.max(-2, Math.min(2, stretch));
  mu = Math.max(-0.5 * vol, Math.min(0.5 * vol, mu)); // never claim a drift bigger than half a bar's noise
  return { mu, vol };
}

export function reachBars(n: number, reach: 'short' | 'medium' | 'long') {
  const f = reach === 'short' ? 0.08 : reach === 'long' ? 0.3 : 0.16;
  return Math.max(5, Math.min(150, Math.round(n * f)));
}

export function forecast(bars: Bar[], horizon: number): Forecast | null {
  const closes = bars.map((b) => b.c);
  const end = closes.length - 1;
  const fit = model(closes, end);
  if (!fit) return null;
  const { mu, vol } = fit;
  const p0 = closes[end];
  const mid: number[] = [], in50: [number, number][] = [], in90: [number, number][] = [];
  for (let k = 1; k <= horizon; k++) {
    const c = Math.log(p0) + mu * k, s = vol * Math.sqrt(k);
    mid.push(Math.exp(c));
    in50.push([Math.exp(c - Z50 * s), Math.exp(c + Z50 * s)]);
    in90.push([Math.exp(c - Z90 * s), Math.exp(c + Z90 * s)]);
  }
  const zEnd = (mu * horizon) / (vol * Math.sqrt(horizon));
  const drift = Math.exp(mu * horizon) - 1;
  return {
    horizon, mid, in50, in90,
    pUp: phi(zEnd),
    drift, vol,
    trend: Math.abs(zEnd) < 0.15 ? 'flat' : zEnd > 0 ? 'up' : 'down',
    track: backtest(closes, horizon),
  };
}

/** Runs the same forecast from up to 40 earlier points on this chart and checks what actually happened. */
function backtest(closes: number[], horizon: number) {
  const first = 40, last = closes.length - 1 - horizon;
  if (last - first < 10) return null;
  const tries = Math.min(40, last - first);
  let dir = 0, dirN = 0, in90 = 0, in50 = 0;
  for (let j = 0; j < tries; j++) {
    const i = Math.round(first + (j * (last - first)) / (tries - 1));
    const fit = model(closes, i);
    if (!fit) continue;
    const actual = Math.log(closes[i + horizon] / closes[i]);
    const c = fit.mu * horizon, s = fit.vol * Math.sqrt(horizon);
    if (Math.abs(c) > 1e-9 && Math.abs(actual) > 1e-9) { dirN++; if (Math.sign(c) === Math.sign(actual)) dir++; }
    if (Math.abs(actual - c) <= Z90 * s) in90++;
    if (Math.abs(actual - c) <= Z50 * s) in50++;
  }
  return { tries, direction: dirN ? dir / dirN : 0.5, inside90: in90 / tries, inside50: in50 / tries };
}

// ---------- annotations ----------

export type NoteKind = 'support' | 'resistance' | 'high' | 'low' | 'cross-up' | 'cross-down' | 'volume' | 'gap-up' | 'gap-down';
export interface Note {
  kind: NoteKind;
  /** Bar index the note belongs to (levels: the latest touch). */
  i: number;
  price: number;
  label: string;
  detail: string;
  /** Horizontal levels are drawn across the chart. */
  level?: boolean;
}

export function annotate(bars: Bar[], intraday: boolean): Note[] {
  const n = bars.length;
  if (n < 10) return [];
  const notes: Note[] = [];
  const last = bars[n - 1].c;
  const a = atr(bars) || last * 0.01;

  // highest and lowest points of the period
  let hi = 0, lo = 0;
  bars.forEach((b, i) => { if (b.h > bars[hi].h) hi = i; if (b.l < bars[lo].l) lo = i; });
  notes.push({ kind: 'high', i: hi, price: bars[hi].h, label: 'Period high', detail: `The highest price on this chart.` });
  notes.push({ kind: 'low', i: lo, price: bars[lo].l, label: 'Period low', detail: `The lowest price on this chart.` });

  // support and resistance: prices where swings turned more than once
  const k = Math.max(2, Math.min(6, Math.floor(n / 40)));
  const pivots: { i: number; p: number; top: boolean }[] = [];
  for (let i = k; i < n - k; i++) {
    let top = true, bot = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (bars[j].h > bars[i].h) top = false;
      if (bars[j].l < bars[i].l) bot = false;
    }
    if (top) pivots.push({ i, p: bars[i].h, top: true });
    if (bot) pivots.push({ i, p: bars[i].l, top: false });
  }
  const tol = a * 0.9;
  const zones: { p: number; touches: number; lastI: number }[] = [];
  for (const pv of pivots.sort((x, y) => x.p - y.p)) {
    const z = zones.find((z) => Math.abs(z.p - pv.p) <= tol);
    if (z) { z.p = (z.p * z.touches + pv.p) / (z.touches + 1); z.touches++; z.lastI = Math.max(z.lastI, pv.i); }
    else zones.push({ p: pv.p, touches: 1, lastI: pv.i });
  }
  const strong = zones.filter((z) => z.touches >= 2).sort((x, y) => y.touches - x.touches || y.lastI - x.lastI);
  const above = strong.filter((z) => z.p > last + a * 0.2).sort((x, y) => x.p - y.p).slice(0, 2);
  const below = strong.filter((z) => z.p < last - a * 0.2).sort((x, y) => y.p - x.p).slice(0, 2);
  for (const z of above) notes.push({ kind: 'resistance', i: z.lastI, price: z.p, level: true, label: 'Resistance', detail: `Turned down here ${z.touches} times. Rallies often stall near it.` });
  for (const z of below) notes.push({ kind: 'support', i: z.lastI, price: z.p, level: true, label: 'Support', detail: `Turned up here ${z.touches} times. Dips often slow near it.` });

  // 20/50 moving average crossovers, the latest few
  const closes = bars.map((b) => b.c);
  const fast = sma(closes, 20), slow = sma(closes, 50);
  const crosses: Note[] = [];
  for (let i = 51; i < n; i++) {
    const f0 = fast[i - 1], s0 = slow[i - 1], f1 = fast[i], s1 = slow[i];
    if (f0 == null || s0 == null || f1 == null || s1 == null) continue;
    if (f0 <= s0 && f1 > s1) crosses.push({ kind: 'cross-up', i, price: bars[i].c, label: 'Bullish cross', detail: 'The 20-bar average crossed above the 50-bar average: the short-term trend turned up.' });
    if (f0 >= s0 && f1 < s1) crosses.push({ kind: 'cross-down', i, price: bars[i].c, label: 'Bearish cross', detail: 'The 20-bar average crossed below the 50-bar average: the short-term trend turned down.' });
  }
  notes.push(...crosses.slice(-3));

  // unusually heavy trading: at least 2.5× the 20-bar average volume
  const vols = bars.map((b) => b.v);
  if (vols.some((v) => v > 0)) {
    const avg = sma(vols, 20);
    const spikes: Note[] = [];
    for (let i = 20; i < n; i++) {
      const m = avg[i - 1];
      if (m && bars[i].v > 2.5 * m) spikes.push({ kind: 'volume', i, price: bars[i].h, label: `${(bars[i].v / m).toFixed(1)}× volume`, detail: `About ${(bars[i].v / m).toFixed(1)} times the usual trading volume.` });
    }
    notes.push(...spikes.sort((x, y) => bars[y.i].v - bars[x.i].v).slice(0, 4));
  }

  // gaps between one bar's close and the next bar's open (daily bars and longer)
  if (!intraday) {
    const gaps: (Note & { size: number })[] = [];
    for (let i = 1; i < n; i++) {
      const g = (bars[i].o - bars[i - 1].c) / bars[i - 1].c;
      if (Math.abs(g) >= Math.max(0.02, (a / last) * 1.5)) {
        gaps.push({ size: Math.abs(g), kind: g > 0 ? 'gap-up' : 'gap-down', i, price: g > 0 ? bars[i].l : bars[i].h, label: `Gap ${g > 0 ? 'up' : 'down'} ${(Math.abs(g) * 100).toFixed(1)}%`, detail: `Opened ${(Math.abs(g) * 100).toFixed(1)}% ${g > 0 ? 'above' : 'below'} the previous close, often after news.` });
      }
    }
    notes.push(...gaps.sort((x, y) => y.size - x.size).slice(0, 4));
  }
  return notes;
}
