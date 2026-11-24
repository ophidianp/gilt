// One stock: live price, chart, your position, the order ticket and this stock's orders.
import { account, type Order } from './account';
import { fetchChart, RANGES, type Chart, type RangeKey } from './api';
import { BigChart } from './chart';
import { countTo, flash, h, type View } from './dom';
import { pct, shares, signed, tone, usd, when } from './fmt';
import { live } from './live';
import { settings } from './settings';
import { nameOf, rememberName, watchlist } from './store';
import { ticket } from './ticket';
import { openViewer } from './viewer';

const TICK: Record<RangeKey, Intl.DateTimeFormatOptions> = {
  '1D': { hour: 'numeric' },
  '1W': { weekday: 'short' },
  '1M': { month: 'short', day: 'numeric' },
  '3M': { month: 'short', day: 'numeric' },
  '1Y': { month: 'short' },
  '5Y': { year: 'numeric' },
};
const HOVER_INTRADAY: Intl.DateTimeFormatOptions = { weekday: 'short', hour: 'numeric', minute: '2-digit' };
const HOVER_DAYS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };

export function stockView(root: HTMLElement, sym: string): View {
  let range: RangeKey = settings.get().defaultRange in RANGES ? settings.get().defaultRange : '1D';
  let data: Chart | null = null;
  let loading = 0;
  let lastPx = NaN;

  const ex = h('span', null, '');
  const name = h('h1', { class: 'stock-name' }, nameOf(sym));
  const px = h('div', { class: 'stock-px num' }, '—');
  const chg = h('p', { class: 'stock-chg num' }, '');
  const watchBtn = h('button', { type: 'button', class: 'pill sm', onclick: () => (watchlist.has(sym) ? watchlist.remove(sym) : watchlist.add(sym)) });
  const chart = new BigChart();
  const chartMsg = h('p', { class: 'chart-msg' }, 'Loading chart…');
  const ranges = h('div', { class: 'seg small', role: 'radiogroup', 'aria-label': 'Chart range' },
    ...(Object.keys(RANGES) as RangeKey[]).map((k) => h('button', { type: 'button', role: 'radio', 'data-v': k, 'aria-checked': String(k === range), onclick: () => setRange(k) }, k)));
  const fullBtn = h('button', { type: 'button', class: 'expand-btn', title: 'Full-screen chart with candles, forecast and notes (F)', 'aria-label': 'Open the full-screen chart' });
  fullBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg>';
  const chartCard = h('div', { class: 'card chart-card' }, h('div', { class: 'chart-top' }, ranges, fullBtn), chart.el, chartMsg);
  fullBtn.addEventListener('click', () => openViewer(sym, chartCard));
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey || t.closest('input, textarea, select') || document.body.classList.contains('viewer-open')) return;
    e.preventDefault();
    openViewer(sym, chartCard);
  };
  document.addEventListener('keydown', onKey);
  const pos = h('section', { class: 'card pos-card' });
  const orders = h('section', { class: 'card stock-orders' });
  const t = ticket(sym);

  root.append(h('div', { class: 'page stock' },
    h('div', { class: 'stock-main' },
      h('a', { class: 'back', href: '#/markets' }, '← Markets'),
      h('div', { class: 'stock-head' },
        h('div', null, h('p', { class: 'eyebrow' }, sym, ' · ', ex), name),
        watchBtn),
      h('div', { class: 'px-row' }, px, chg),
      chartCard,
      pos, orders),
    h('aside', { class: 'stock-side' }, t.el)));

  function paintWatch() {
    const on = watchlist.has(sym);
    watchBtn.textContent = on ? '★ Watching' : '☆ Watch';
    watchBtn.classList.toggle('on', on);
  }

  function paintPrice() {
    const q = live.get(sym);
    const p = q?.price ?? data?.price;
    if (p == null) return;
    if (!Number.isNaN(lastPx) && p !== lastPx) flash(px, p > lastPx);
    lastPx = p;
    countTo(px, p, usd);
    let base: number, label: string;
    if (range === '1D') { base = q?.prev ?? data?.prev ?? p; label = 'today'; }
    else { base = data?.points[0]?.v ?? p; label = RANGES[range].label; }
    chg.textContent = `${signed(p - base)} (${pct(p - base, base)}) ${label}`;
    chg.className = `stock-chg num ${tone(p - base)}`;
  }

  function paintChart() {
    if (!data) return;
    const pts = [...data.points];
    const q = live.get(sym);
    if (q && pts.length && range === '1D') {
      const lastT = pts[pts.length - 1].t;
      if (q.time > lastT) pts.push({ t: q.time, v: q.price });
      else pts[pts.length - 1] = { t: lastT, v: q.price };
    }
    chart.set(pts, {
      ref: range === '1D' && settings.get().showPrevClose ? data.prev : 0,
      session: data.session,
      label: `${sym} price, ${RANGES[range].label}`,
      tick: TICK[range],
      hover: range === '1D' || range === '1W' ? HOVER_INTRADAY : HOVER_DAYS,
    });
    chartMsg.hidden = pts.length >= 2;
    chartMsg.textContent = 'No chart data for this range.';
  }

  async function load() {
    const mine = ++loading;
    try {
      const c = await fetchChart(sym, range);
      if (mine !== loading) return;
      data = c;
      if (c.name && c.name !== sym) { rememberName(sym, c.name); name.textContent = c.name; }
      ex.textContent = c.exchange;
      paintChart();
      paintPrice();
    } catch (e) {
      if (mine !== loading) return;
      chartMsg.hidden = false;
      chartMsg.textContent = `Couldn't load ${sym}: ${e instanceof Error ? e.message : e}`;
    }
  }

  function setRange(k: RangeKey) {
    range = k;
    ranges.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === k)));
    data = null;
    chartMsg.hidden = false;
    chartMsg.textContent = 'Loading chart…';
    load();
  }

  function paintPosition() {
    const a = account.get();
    const p = a?.positions[sym];
    const q = live.get(sym);
    if (!a || !p) {
      pos.hidden = !a;
      pos.replaceChildren(h('p', { class: 'eyebrow' }, 'Your position'), h('p', { class: 'mute' }, `You don't own any ${sym} yet.`));
      return;
    }
    pos.hidden = false;
    const mv = q ? p.qty * q.price : p.cost;
    const ret = mv - p.cost;
    pos.replaceChildren(
      h('div', { class: 'card-top' }, h('p', { class: 'eyebrow' }, 'Your position'), h('button', { type: 'button', class: 'link-btn', onclick: () => t.sellAll() }, 'Sell all')),
      h('dl', { class: 'specgrid' },
        spec('Shares', shares(p.qty)),
        spec('Average cost', usd(p.cost / p.qty)),
        spec('Market value', usd(mv)),
        spec('Total return', usd(ret, true), tone(ret), pct(ret, p.cost))));
  }

  function paintOrders() {
    const a = account.get();
    const mine = (a?.orders ?? []).filter((o) => o.sym === sym).slice(-8).reverse();
    orders.hidden = !mine.length;
    orders.replaceChildren(h('p', { class: 'eyebrow' }, `Your ${sym} orders`), h('ul', { class: 'order-list' }, ...mine.map(orderRow)));
  }

  const offNeed = live.need(() => [sym]);
  const offLive = live.on((_q, fresh) => {
    if (!fresh.has(sym)) return;
    paintPrice();
    paintPosition();
    if (range === '1D') paintChart();
  });
  const offAcc = account.onChange(() => { paintPosition(); paintOrders(); });
  const offWatch = watchlist.onChange(paintWatch);
  // the 1D chart's minute bars are re-read every 30 s; live prices fill in between
  const reload = window.setInterval(() => { if (range === '1D' && !document.hidden) load(); }, 30000);

  paintWatch();
  paintPrice();
  paintPosition();
  paintOrders();
  load();
  live.refresh();

  return {
    destroy() {
      offNeed(); offLive(); offAcc(); offWatch(); t.destroy();
      document.removeEventListener('keydown', onKey);
      window.clearInterval(reload);
    },
  };
}

function spec(k: string, v: string, cls = '', sub = '') {
  return h('div', null, h('dt', null, k), h('dd', { class: `num ${cls}` }, v, sub ? h('small', null, sub) : ''));
}

const TYPE_NAME = { market: 'Market', limit: 'Limit', stop: 'Stop' } as const;
const STATUS_NAME = { open: 'Waiting', filled: 'Filled', cancelled: 'Cancelled', rejected: 'Rejected' } as const;

/** A compact order line, shared with the Portfolio and Orders screens. */
export function orderRow(o: Order) {
  const what = `${o.side === 'buy' ? 'Buy' : 'Sell'} ${shares(o.qty)} ${o.sym}`;
  const how = o.type === 'market' ? 'Market' : `${TYPE_NAME[o.type]} ${usd(o.trigger!)}`;
  const right = o.status === 'filled' ? `at ${usd(o.fill!)}` : o.status === 'open' ? '' : STATUS_NAME[o.status];
  return h('li', { class: `order ${o.status}` },
    h('span', { class: `o-side ${o.side}` }, o.side === 'buy' ? 'B' : 'S'),
    h('span', { class: 'o-what' }, h('b', { class: 'num' }, what), h('small', null, `${how} · ${when(o.status === 'open' ? o.placed : o.done ?? o.placed)}`)),
    o.status === 'open'
      ? h('button', { type: 'button', class: 'pill sm', onclick: () => account.cancel(o.id) }, 'Cancel')
      : h('span', { class: 'o-right num' }, right, o.pnl != null ? h('small', { class: tone(o.pnl) }, `${usd(o.pnl, true)} P/L`) : ''),
    o.note ? h('small', { class: 'o-note' }, o.note) : '');
}
