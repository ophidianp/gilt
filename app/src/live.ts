// One price feed for the whole app. Screens say which symbols they need; one loop fetches them all:
// every 3 s while the market is open, every 30 s when it's closed, every 20 s while minimized.
import { fetchQuotes, type Quote } from './api';
import { marketOpen } from './fmt';
import { settings } from './settings';
import { status } from './status';

const CACHE = 'gilt.quotes.v1';
const quotes = new Map<string, Quote>();
try {
  for (const q of JSON.parse(localStorage.getItem(CACHE) ?? '[]')) quotes.set(q.sym, { ...q, closes: [] });
} catch { /* no cache yet */ }

type Provider = () => string[];
type Listener = (quotes: Map<string, Quote>, fresh: Set<string>) => void;
const providers = new Set<Provider>();
const listeners = new Set<Listener>();
let timer = 0;
let running = false;
let again = false;

function delay() {
  const s = settings.get();
  if (document.hidden) return s.refreshHidden || 0;
  return marketOpen() ? s.refreshOpen : s.refreshClosed;
}
const wanted = () => [...new Set([...providers].flatMap((p) => p()))];

function saveCache(syms: string[]) {
  const keep = syms.map((s) => quotes.get(s)).filter((q): q is Quote => !!q).map(({ sym, price, prev, time }) => ({ sym, price, prev, time }));
  try { localStorage.setItem(CACHE, JSON.stringify(keep)); } catch { /* full or blocked: not important */ }
}

async function run() {
  if (running) { again = true; return; }
  running = true;
  window.clearTimeout(timer);
  const syms = wanted();
  try {
    let newest = 0;
    const fresh = new Set<string>();
    if (syms.length) {
      const got = await fetchQuotes(syms);
      got.forEach((q, s) => { quotes.set(s, q); fresh.add(s); newest = Math.max(newest, q.time); });
      saveCache(syms);
    }
    listeners.forEach((l) => l(quotes, fresh));
    status.ok(newest);
  } catch (e) {
    status.fail(e);
  } finally {
    running = false;
    if (again) { again = false; run(); }
    else { const d = delay(); if (d > 0) timer = window.setTimeout(run, d); }
  }
}

export const live = {
  quotes,
  get: (sym: string) => quotes.get(sym),
  /** Registers symbols to keep fresh; returns a function that stops asking. */
  need(p: Provider) {
    providers.add(p);
    return () => { providers.delete(p); };
  },
  on(l: Listener) {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
  /** Fetch now (e.g. right after a screen asks for new symbols). */
  refresh: run,
  start() {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
    settings.onChange((_s, k) => { if (k?.startsWith('refresh')) run(); });
    run();
  },
};
