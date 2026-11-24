// Portfolio: the paper account at a glance (value, value chart, stats, positions, waiting orders),
// or, before there's an account, the screen where you choose your starting cash.
import { account, dayChange, value, type Account, type EqPoint } from './account';
import { BigChart } from './chart';
import { countTo, flash, h, type View } from './dom';
import { compact, pct, price, shares, tone, usd, when } from './fmt';
import { live } from './live';
import { nameOf } from './store';
import { orderRow } from './stock';

export function portfolioView(root: HTMLElement): View {
  let inner: View | null = null;
  let had: boolean | null = null;
  const render = () => {
    const has = !!account.get();
    if (has === had) return;
    had = has;
    inner?.destroy();
    root.replaceChildren();
    inner = has ? accountView(root) : setupView(root);
  };
  const off = account.onChange(render);
  render();
  return { destroy() { off(); inner?.destroy(); } };
}

// ---------- choose your starting cash ----------
const PRESETS = [1000, 10000, 100000, 1000000];
const MAX = 1e9;

function setupView(root: HTMLElement): View {
  const input = h('input', { class: 'field-input big num', id: 'start-amt', type: 'number', min: '1', max: String(MAX), step: 'any', value: '10000', inputmode: 'decimal' }) as HTMLInputElement;
  const msg = h('p', { class: 'ticket-msg bad', role: 'status' });
  const chips = h('div', { class: 'chips' }, ...PRESETS.map((v) =>
    h('button', { type: 'button', class: 'chip', onclick: () => { input.value = String(v); sync(); } }, compact(v))));
  const sync = () => chips.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', Number(input.value) === PRESETS[i]));
  input.addEventListener('input', () => { msg.textContent = ''; sync(); });
  const start = () => {
    const v = Math.round(Number(input.value) * 100) / 100;
    if (!(v >= 1)) { msg.textContent = 'Start with at least $1.'; return; }
    if (v > MAX) { msg.textContent = 'The most you can start with is $1,000,000,000.'; return; }
    account.begin(v);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
  sync();

  root.append(h('div', { class: 'page setup' },
    h('div', { class: 'setup-grid' },
      h('div', null,
        h('p', { class: 'eyebrow' }, 'Paper trading'),
        h('h1', { class: 'display' }, 'Trade the real market. ', h('em', null, 'With pretend money.'))),
      h('div', { class: 'card setup-card' },
        h('label', { class: 'field-top', for: 'start-amt' }, 'Starting cash'),
        h('div', { class: 'field-box big' }, h('span', { class: 'affix' }, '$'), input),
        chips,
        h('button', { type: 'button', class: 'pill acc wide', onclick: start }, 'Open my paper account →'),
        msg,
        h('p', { class: 'fine' }, 'You can start over with a new amount any time.'))),
    h('div', { class: 'ticks' },
      tick('01', 'Live prices', 'Orders fill at the real price, updated every few seconds.'),
      tick('02', 'Real order types', 'Market, limit and stop orders, in shares or dollars.'),
      tick('03', 'Nothing at stake', 'No account, no bank, no real money. Ever.'))));
  window.setTimeout(() => { input.focus(); input.select(); }, 50);
  return { destroy() {} };
}

const tick = (n: string, t: string, p: string) => h('div', null, h('span', null, n), h('b', null, t), h('p', null, p));

// ---------- the account ----------
type Span = '1D' | '1W' | '1M' | 'ALL';
const SPAN_S: Record<Span, number> = { '1D': 86400, '1W': 7 * 86400, '1M': 30 * 86400, ALL: Infinity };

function accountView(root: HTMLElement): View {
  let span: Span = 'ALL';
  let lastVal = NaN;
  let confirmReset = false;

  const eyebrow = h('p', { class: 'eyebrow' });
  const val = h('div', { class: 'acct-big num' }, '—');
  const day = h('span', { class: 'num' });
  const all = h('span', { class: 'num' });
  const chart = new BigChart();
  const chartMsg = h('p', { class: 'chart-msg' });
  const spans = h('div', { class: 'seg small', role: 'radiogroup', 'aria-label': 'Chart range' },
    ...(Object.keys(SPAN_S) as Span[]).map((k) => h('button', { type: 'button', role: 'radio', 'data-v': k, 'aria-checked': String(k === span),
      onclick: () => { span = k; spans.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === k))); paintChart(); } }, k === 'ALL' ? 'All' : k)));
  const stats = h('dl', { class: 'specgrid five' });
  const positions = h('section', { class: 'block' });
  const waiting = h('section', { class: 'block' });
  const recent = h('section', { class: 'block' });
  const resetBox = h('div', { class: 'reset' });

  root.append(h('div', { class: 'page portfolio' },
    h('div', { class: 'acct-hero' },
      h('div', null, eyebrow, val, h('p', { class: 'acct-lines' }, day, all)),
      h('a', { class: 'pill acc', href: '#/markets' }, 'Find something to trade →')),
    h('div', { class: 'card chart-card' }, h('div', { class: 'chart-top' }, h('span', { class: 'eyebrow' }, 'Account value'), spans), chart.el, chartMsg),
    stats, positions, waiting, recent, resetBox));

  function paint(fresh: Set<string> = new Set()) {
    const a = account.get();
    if (!a) return;
    const q = live.quotes;
    const { value: v } = value(a, q);
    if (!Number.isNaN(lastVal) && Math.abs(v - lastVal) > 0.004 && fresh.size) flash(val, v > lastVal);
    lastVal = v;
    eyebrow.textContent = `Paper account · opened ${new Date(a.begun).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} with ${usd(a.start)}`;
    countTo(val, v, usd);
    const d = dayChange(a, q);
    day.textContent = `${usd(d.change, true)} (${pct(d.change, d.base)}) today`;
    day.className = `num ${tone(d.change)}`;
    all.textContent = `${usd(v - a.start, true)} (${pct(v - a.start, a.start)}) all time`;
    all.className = `num ${tone(v - a.start)}`;

    const invested = v - a.cash;
    let unreal = 0;
    for (const [sym, p] of Object.entries(a.positions)) { const qq = q.get(sym); if (qq) unreal += p.qty * qq.price - p.cost; }
    const sells = a.orders.filter((o) => o.status === 'filled' && o.side === 'sell' && o.pnl != null);
    const wins = sells.filter((o) => (o.pnl ?? 0) > 0).length;
    stats.replaceChildren(
      spec('Buying power', usd(account.buyingPower())),
      spec('Cash', usd(a.cash)),
      spec('Invested', usd(invested), '', v > 0 ? `${((invested / v) * 100).toFixed(0)}% of account` : ''),
      spec('Open P/L', usd(unreal, true), tone(unreal), 'on what you hold'),
      spec('Closed P/L', usd(a.realized, true), tone(a.realized), sells.length ? `${wins} of ${sells.length} sells won` : 'no sells yet'));

    paintPositions(a, v);
    paintOrders(a);
    paintChart();
  }

  function paintPositions(a: Account, total: number) {
    const q = live.quotes;
    const syms = Object.keys(a.positions);
    if (!syms.length) {
      positions.replaceChildren(head('Positions'),
        h('div', { class: 'empty-card' },
          h('p', null, 'You don’t own anything yet. Search any stock with ', h('kbd', null, 'Ctrl K'), ' or pick one from Markets, then buy it with your paper cash.'),
          h('a', { class: 'pill', href: '#/markets' }, 'Browse markets →')));
      return;
    }
    const rows = syms.map((sym) => {
      const p = a.positions[sym], qq = q.get(sym);
      const mv = qq ? p.qty * qq.price : p.cost;
      const ret = mv - p.cost;
      const dayCh = qq ? p.qty * (qq.price - qq.prev) : 0;
      return { sym, p, qq, mv, ret, dayCh };
    }).sort((x, y) => y.mv - x.mv);
    positions.replaceChildren(head('Positions', `${syms.length} holding${syms.length === 1 ? '' : 's'}`),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, ...['Stock', 'Shares', 'Avg cost', 'Price', 'Value', 'Today', 'Total return', 'Weight'].map((c, i) => h('th', { class: i ? 'r' : '' }, c)))),
        h('tbody', null, ...rows.map((r) => h('tr', { tabindex: '0', onclick: () => go(r.sym), onkeydown: (e: Event) => { if ((e as KeyboardEvent).key === 'Enter') go(r.sym); } },
          h('td', null, h('b', null, r.sym), h('small', null, nameOf(r.sym))),
          h('td', { class: 'r num' }, shares(r.p.qty)),
          h('td', { class: 'r num' }, price(r.p.cost / r.p.qty)),
          h('td', { class: 'r num' }, r.qq ? price(r.qq.price) : '—'),
          h('td', { class: 'r num' }, usd(r.mv)),
          h('td', { class: `r num ${tone(r.dayCh)}` }, r.qq ? usd(r.dayCh, true) : '—'),
          h('td', { class: `r num ${tone(r.ret)}` }, usd(r.ret, true), h('small', null, pct(r.ret, r.p.cost))),
          h('td', { class: 'r num' }, `${((r.mv / total) * 100).toFixed(1)}%`)))))));
  }

  function paintOrders(a: Account) {
    const open = a.orders.filter((o) => o.status === 'open').reverse();
    waiting.hidden = !open.length;
    waiting.replaceChildren(head('Waiting orders', `${open.length}`), h('ul', { class: 'order-list card' }, ...open.map(orderRow)));
    const done = a.orders.filter((o) => o.status !== 'open').slice(-5).reverse();
    recent.hidden = !done.length;
    recent.replaceChildren(head('Recent activity', '', h('a', { class: 'more', href: '#/orders' }, 'All orders →')), h('ul', { class: 'order-list card' }, ...done.map(orderRow)));
  }

  function paintChart() {
    const a = account.get();
    if (!a) return;
    const now = Date.now() / 1000;
    let pts: EqPoint[] = a.equity.filter((p) => now - p.t <= SPAN_S[span]);
    if (pts.length < 2 && a.equity.length >= 2 && span !== 'ALL') pts = a.equity.slice(-2);
    const ref = span === 'ALL' ? a.start : pts[0]?.v ?? a.start;
    const longSpan = span === '1M' || span === 'ALL';
    chart.set(pts, {
      ref, refLabel: span === 'ALL' ? 'Started' : 'From', session: null, label: 'Account value',
      tick: longSpan ? { month: 'short', day: 'numeric' } : span === '1W' ? { weekday: 'short' } : { hour: 'numeric', minute: '2-digit' },
      hover: { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
      fmt: (x) => usd(x),
    });
    chartMsg.hidden = pts.length >= 2;
    chartMsg.textContent = `Your account's value is recorded every minute gilt is open. The chart fills in as you trade (opened ${when(a.begun)}).`;
  }

  function paintReset() {
    resetBox.replaceChildren(confirmReset
      ? h('div', { class: 'reset-confirm' },
        h('p', null, 'Close this paper account? Your positions, orders and history are deleted, and you choose a new starting amount.'),
        h('button', { type: 'button', class: 'pill danger', onclick: () => account.reset() }, 'Yes, start over'),
        h('button', { type: 'button', class: 'pill', onclick: () => { confirmReset = false; paintReset(); } }, 'Keep it'))
      : h('button', { type: 'button', class: 'link-btn', onclick: () => { confirmReset = true; paintReset(); } }, 'Start over with a new amount'));
  }

  const offNeed = live.need(() => account.symbols());
  const offLive = live.on((_q, fresh) => paint(fresh));
  const offAcc = account.onChange(() => paint());
  paint();
  paintReset();
  live.refresh();
  return { destroy() { offNeed(); offLive(); offAcc(); } };
}

const go = (sym: string) => { location.hash = `#/s/${encodeURIComponent(sym)}`; };

function head(title: string, note = '', extra: Node | string = '') {
  return h('div', { class: 'block-head' }, h('h2', null, title, note ? h('span', { class: 'count num' }, note) : ''), extra);
}

function spec(k: string, v: string, cls = '', sub = '') {
  return h('div', null, h('dt', null, k), h('dd', { class: `num ${cls}` }, v, sub ? h('small', null, sub) : ''));
}
