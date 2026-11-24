// The paper trading account: pretend cash, positions, and market / limit / stop orders that fill
// against live prices. Everything is kept in this computer's local storage; nothing is real money.
import type { Quote } from './api';
import { alwaysOpen, marketOpen, nyDay, shares, usd } from './fmt';
import { settings } from './settings';

export type Side = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop';
export type OrderStatus = 'open' | 'filled' | 'cancelled' | 'rejected';

export interface Order {
  id: number;
  sym: string;
  side: Side;
  type: OrderType;
  qty: number;
  /** Limit or stop price; null for market orders. */
  trigger: number | null;
  /** The price when it was placed, used to hold back buying power for waiting market orders. */
  est: number;
  status: OrderStatus;
  placed: number; // ms
  done: number | null; // ms
  fill: number | null; // fill price
  /** Profit or loss on a filled sell. */
  pnl: number | null;
  note: string | null;
  /** Simulated commission charged when it filled (Settings → Trading). */
  fee?: number;
}

/** cost = total paid for the shares still held */
export interface Position { qty: number; cost: number; opened: number }
export interface EqPoint { t: number; v: number } // t in unix seconds, like chart points

export interface Account {
  v: 2;
  start: number;
  cash: number;
  positions: Record<string, Position>;
  orders: Order[]; // oldest first
  realized: number;
  equity: EqPoint[];
  begun: number;
  seq: number;
}

export interface OrderInput { sym: string; side: Side; type: OrderType; qty: number; trigger: number | null }

const KEY = 'gilt.account.v2';
const OLD_KEY = 'gilt.practice.v1';
const EPS = 1e-6;
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
/** A quote older than this during market hours means the stock isn't trading (a holiday, a halt). */
const STALE_S = 20 * 60;

type Listener = () => void;
const listeners = new Set<Listener>();
let acc: Account | null = load();

function load(): Account | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const a = JSON.parse(raw) as Account;
      if (a && a.v === 2) return a;
    }
  } catch { /* fall through */ }
  return migrate();
}

/** Brings over a portfolio from gilt 0.1's Practice tab. */
function migrate(): Account | null {
  try {
    const raw = localStorage.getItem(OLD_KEY);
    if (!raw) return null;
    const old = JSON.parse(raw);
    const begun = old.begun ?? Date.now();
    const a: Account = { v: 2, start: old.start, cash: old.cash, positions: {}, orders: [], realized: 0, equity: [], begun, seq: 1 };
    for (const [sym, p] of Object.entries<any>(old.positions ?? {})) a.positions[sym] = { qty: p.qty, cost: p.cost, opened: begun };
    for (const t of [...(old.trades ?? [])].reverse()) {
      a.orders.push({ id: a.seq++, sym: t.sym, side: t.side, type: 'market', qty: t.qty, trigger: null, est: t.price,
        status: 'filled', placed: t.t, done: t.t, fill: t.price, pnl: null, note: null });
    }
    localStorage.setItem(KEY, JSON.stringify(a));
    localStorage.removeItem(OLD_KEY);
    return a;
  } catch {
    return null;
  }
}

function save() {
  if (acc) localStorage.setItem(KEY, JSON.stringify(acc));
}
function commit() {
  save();
  listeners.forEach((l) => l());
}

/** Can this symbol trade right now? Crypto and currencies always; stocks during a live session. */
export function tradable(sym: string, q: Quote | undefined): boolean {
  if (alwaysOpen(sym)) return true;
  if (!marketOpen()) return false;
  return !q || Date.now() / 1000 - q.time < STALE_S;
}

/** The simulated costs from Settings: slippage moves the fill against you, commission is per order. */
const costs = () => ({ slip: settings.get().slippage, fee: settings.get().commission });

function reserved(a: Account, side: Side, sym?: string) {
  const { slip, fee } = costs();
  return a.orders
    .filter((o) => o.status === 'open' && o.side === side && (!sym || o.sym === sym))
    .reduce((t, o) => t + (side === 'buy' ? o.qty * (o.trigger ?? o.est) * (1 + slip) + fee : o.qty), 0);
}

function fill(a: Account, o: Order, quoted: number) {
  const now = Date.now();
  const { slip, fee } = costs();
  const px = o.side === 'buy' ? quoted * (1 + slip) : quoted * (1 - slip);
  if (o.side === 'buy') {
    const cost = o.qty * px + fee;
    // the order's own reservation is released at the moment it fills
    if (cost > a.cash + 0.005) {
      o.status = 'rejected';
      o.note = `Not enough cash when it filled: it needed ${usd(cost)}.`;
      o.done = now;
      return;
    }
    const p = a.positions[o.sym] ?? { qty: 0, cost: 0, opened: now };
    a.positions[o.sym] = { qty: r4(p.qty + o.qty), cost: p.cost + cost, opened: p.opened };
    a.cash = Math.max(0, a.cash - cost);
  } else {
    const p = a.positions[o.sym];
    if (!p || o.qty > p.qty + EPS) {
      o.status = 'rejected';
      o.note = "You didn't hold enough shares when it filled.";
      o.done = now;
      return;
    }
    const basis = p.cost * (o.qty / p.qty);
    const proceeds = o.qty * px - fee;
    o.pnl = proceeds - basis;
    a.realized += o.pnl;
    a.cash += proceeds;
    const left = r4(p.qty - o.qty);
    if (left <= EPS) delete a.positions[o.sym];
    else a.positions[o.sym] = { ...p, qty: left, cost: p.cost - basis };
  }
  o.status = 'filled';
  o.fill = px;
  o.fee = fee;
  o.done = now;
}

function triggered(o: Order, px: number) {
  if (o.type === 'market') return true;
  const t = o.trigger ?? 0;
  if (o.type === 'limit') return o.side === 'buy' ? px <= t : px >= t;
  return o.side === 'buy' ? px >= t : px <= t; // stop
}

export function value(a: Account, quotes: Map<string, Quote>) {
  let v = a.cash, priced = true;
  for (const [sym, p] of Object.entries(a.positions)) {
    const q = quotes.get(sym);
    if (!q) priced = false;
    v += q ? p.qty * q.price : p.cost;
  }
  return { value: v, priced };
}

/** Change since yesterday's close (or since you bought it, for anything bought today). */
export function dayChange(a: Account, quotes: Map<string, Quote>) {
  const today = nyDay(Date.now());
  let ch = 0, base = 0;
  for (const [sym, p] of Object.entries(a.positions)) {
    const q = quotes.get(sym);
    if (!q) continue;
    const from = nyDay(p.opened) === today ? p.cost / p.qty : q.prev;
    ch += p.qty * (q.price - from);
    base += p.qty * from;
  }
  return { change: ch, base: base + a.cash };
}

/** Keeps one account-value point a minute; older history thins out to one an hour. */
function snapshot(a: Account, quotes: Map<string, Quote>) {
  const { value: v, priced } = value(a, quotes);
  if (!priced) return;
  const t = Math.floor(Date.now() / 1000);
  const last = a.equity[a.equity.length - 1];
  if (last && t - last.t < 60) last.v = v;
  else a.equity.push({ t, v });
  if (a.equity.length > 3000) {
    const cut = t - 2 * 86400;
    let lastHour = -1;
    a.equity = a.equity.filter((p) => {
      if (p.t >= cut) return true;
      const hr = Math.floor(p.t / 3600);
      if (hr === lastHour) return false;
      lastHour = hr;
      return true;
    });
  }
}

export const account = {
  get: () => acc,

  /** Opens a new paper account with any amount of pretend cash (replacing the old one). */
  begin(amount: number) {
    const now = Date.now();
    acc = { v: 2, start: amount, cash: amount, positions: {}, orders: [], realized: 0, equity: [{ t: Math.floor(now / 1000), v: amount }], begun: now, seq: 1 };
    commit();
  },

  /** Closes the account; the next visit to Portfolio asks for a new starting amount. */
  reset() {
    acc = null;
    localStorage.removeItem(KEY);
    listeners.forEach((l) => l());
  },

  /** Loads an account from a backup; returns false if it doesn't look like one. */
  restore(a: unknown): boolean {
    const x = a as Account;
    if (!x || x.v !== 2 || typeof x.cash !== 'number' || typeof x.start !== 'number' || !Array.isArray(x.orders) || typeof x.positions !== 'object') return false;
    acc = x;
    commit();
    return true;
  },

  held: (sym: string) => acc?.positions[sym]?.qty ?? 0,
  /** Cash not already promised to waiting buy orders. */
  buyingPower: () => (acc ? Math.max(0, acc.cash - reserved(acc, 'buy')) : 0),
  /** Shares you can still sell (minus those in waiting sell orders). */
  sellable: (sym: string) => (acc ? Math.max(0, r4((acc.positions[sym]?.qty ?? 0) - reserved(acc, 'sell', sym))) : 0),
  openOrders: () => acc?.orders.filter((o) => o.status === 'open') ?? [],

  /** Every symbol the account needs live prices for. */
  symbols(): string[] {
    if (!acc) return [];
    return [...new Set([...Object.keys(acc.positions), ...acc.orders.filter((o) => o.status === 'open').map((o) => o.sym)])];
  },

  /** Returns why an order can't be placed, or null if it can. */
  check(o: OrderInput, q: Quote | undefined): string | null {
    if (!acc) return 'Open a paper account first.';
    const qty = r4(o.qty);
    if (!(qty > 0)) return 'Enter how many shares.';
    if (!settings.get().fractional && Math.abs(qty - Math.round(qty)) > EPS) return 'Whole shares only. Fractional shares are turned off in Settings.';
    if (o.type !== 'market' && !(o.trigger && o.trigger > 0)) return `Enter a ${o.type} price.`;
    if (!q) return 'Waiting for a price…';
    if (o.side === 'buy') {
      const per = o.type === 'limit' ? o.trigger! : o.type === 'stop' ? Math.max(o.trigger!, q.price) : q.price;
      const { slip, fee } = costs();
      const est = qty * per * (1 + slip) + fee;
      const bp = this.buyingPower();
      if (est > bp + 0.005) return `That's about ${usd(est)}, more than your ${usd(bp)} buying power.`;
    } else {
      const can = this.sellable(o.sym);
      if (can <= EPS) return acc.positions[o.sym]
        ? `All your ${o.sym} is already in waiting sell orders. Cancel one to sell more.`
        : `You don't have any ${o.sym} to sell.`;
      if (qty > can + EPS) return `You can sell up to ${shares(can)} shares.`;
    }
    return null;
  },

  /** Places the order and fills it straight away if it can. */
  place(o: OrderInput, q: Quote | undefined): { error: string | null; order: Order | null } {
    const error = this.check(o, q);
    if (error || !acc || !q) return { error, order: null };
    const order: Order = {
      id: acc.seq++, sym: o.sym, side: o.side, type: o.type, qty: r4(o.qty), trigger: o.type === 'market' ? null : o.trigger,
      est: q.price, status: 'open', placed: Date.now(), done: null, fill: null, pnl: null, note: null,
    };
    acc.orders.push(order);
    if (tradable(o.sym, q) && triggered(order, q.price)) fill(acc, order, q.price);
    commit();
    return { error: null, order };
  },

  cancel(id: number) {
    const o = acc?.orders.find((x) => x.id === id);
    if (!o || o.status !== 'open') return;
    o.status = 'cancelled';
    o.done = Date.now();
    commit();
  },

  /** Called with every price update: fills whatever is due and records the account's value. */
  tick(quotes: Map<string, Quote>) {
    if (!acc) return;
    let changed = false;
    for (const o of acc.orders) {
      if (o.status !== 'open') continue;
      const q = quotes.get(o.sym);
      if (!q || !tradable(o.sym, q) || !triggered(o, q.price)) continue;
      fill(acc, o, q.price);
      changed = true;
    }
    snapshot(acc, quotes);
    if (changed) commit();
    else save();
  },

  onChange(l: Listener) {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
};
