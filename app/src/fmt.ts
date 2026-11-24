// Number, time and market-hours helpers. Prices are USD; market hours are NYSE's.
import { settings } from './settings';

export const MINUS = '−';

const fixed = (d: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const n2 = fixed(2);
const n4 = fixed(4);
const pick = (a: number) => (a > 0 && a < 1 ? n4 : n2);

/** 182.40 · 0.5321 */
export function price(v: number): string {
  const a = Math.abs(v);
  return (v < 0 ? MINUS : '') + pick(a).format(a);
}

/** +3.82 · −0.10 */
export function signed(v: number): string {
  const a = Math.abs(v);
  return (v >= 0 ? '+' : MINUS) + pick(a).format(a);
}

/** +2.14% */
export function pct(change: number, base: number): string {
  if (!base) return '—';
  const p = (change / base) * 100;
  return (p >= 0 ? '+' : MINUS) + Math.abs(p).toFixed(2) + '%';
}

/** $10,000.00 · −$12.50 · +$12.50 with sign=true */
export function usd(v: number, sign = false): string {
  const s = v < 0 ? MINUS : sign ? '+' : '';
  return s + '$' + n2.format(Math.abs(v));
}

/** 3 · 0.25 · 1.3333 */
export function shares(v: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(v);
}

export function clock(d = new Date()): string {
  return d.toLocaleTimeString('en-US', { hour12: false });
}

const NY = 'America/New_York';
const nyParts = new Intl.DateTimeFormat('en-US', { timeZone: NY, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Regular NYSE session, Mon–Fri 9:30–16:00 New York time (holidays not counted). */
export function marketOpen(now = new Date()): boolean {
  const parts = Object.fromEntries(nyParts.formatToParts(now).map((p) => [p.type, p.value]));
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return false;
  const min = Number(parts.hour) * 60 + Number(parts.minute);
  return min >= 570 && min < 960;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
/** Format a unix time (seconds) in New York time (or this computer's time zone, if chosen in Settings). */
export function nyFormat(t: number, opts: Intl.DateTimeFormatOptions): string {
  const tz = settings.get().timeZone === 'local' ? undefined : NY;
  const key = (tz ?? 'local') + JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) fmtCache.set(key, (f = new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts })));
  return f.format(new Date(t * 1000));
}

/** Crypto (BTC-USD) and currencies (EURUSD=X) trade around the clock. */
export function alwaysOpen(sym: string): boolean {
  return /-USD$|=X$/.test(sym);
}

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: NY, year: 'numeric', month: '2-digit', day: '2-digit' });
/** The New York calendar day of a time in ms, as 2026-11-24. */
export function nyDay(ms: number): string {
  return dayFmt.format(new Date(ms));
}

/** Nov 24, 10:42 AM (local time) */
export function when(ms: number): string {
  return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** $1.2M · $12.4K · $850 */
export function compact(v: number): string {
  return '$' + new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

/** 'up' | 'down' | '' for colouring a change */
export const tone = (v: number) => (v > 1e-9 ? 'up' : v < -1e-9 ? 'down' : '');
