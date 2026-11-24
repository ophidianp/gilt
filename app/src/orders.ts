// Orders: what's waiting to fill (with Cancel), and the full history of every order.
import { account, type Order } from './account';
import { h, type View } from './dom';
import { price, shares, tone, usd, when } from './fmt';
import { orderRow } from './stock';

type Filter = 'all' | 'filled' | 'cancelled';

export function ordersView(root: HTMLElement): View {
  let filter: Filter = 'all';
  const waiting = h('section', { class: 'block' });
  const hist = h('section', { class: 'block' });
  const filters = h('div', { class: 'seg small', role: 'radiogroup', 'aria-label': 'Show' },
    ...([['all', 'All'], ['filled', 'Filled'], ['cancelled', 'Cancelled & rejected']] as [Filter, string][]).map(([v, l]) =>
      h('button', { type: 'button', role: 'radio', 'data-v': v, 'aria-checked': String(v === filter),
        onclick: () => { filter = v; filters.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === v))); paint(); } }, l)));

  root.append(h('div', { class: 'page orders' },
    h('div', { class: 'page-head' },
      h('div', null, h('p', { class: 'eyebrow' }, 'Orders'), h('h1', { class: 'display sm' }, 'Every trade, ', h('em', null, 'on the record.'))),
      h('p', { class: 'lede' }, 'Limit and stop orders wait here until the price is reached. Market orders placed while the market is closed fill at the next open.')),
    waiting, hist));

  function paint() {
    const a = account.get();
    if (!a) {
      waiting.replaceChildren(h('div', { class: 'empty-card' }, h('p', null, 'Open a paper account to start placing orders.'), h('a', { class: 'pill acc', href: '#/' }, 'Open a paper account')));
      hist.replaceChildren();
      return;
    }
    const open = a.orders.filter((o) => o.status === 'open').reverse();
    waiting.replaceChildren(
      h('div', { class: 'block-head' }, h('h2', null, 'Waiting to fill', h('span', { class: 'count num' }, String(open.length)))),
      open.length ? h('ul', { class: 'order-list card' }, ...open.map(orderRow)) : h('p', { class: 'mute' }, 'Nothing waiting. Limit and stop orders show up here until they fill.'));

    const done = a.orders.filter((o) => o.status !== 'open' && (filter === 'all' || (filter === 'filled' ? o.status === 'filled' : o.status !== 'filled'))).reverse();
    hist.replaceChildren(
      h('div', { class: 'block-head' }, h('h2', null, 'History'), filters),
      done.length
        ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
          h('thead', null, h('tr', null, ...['When', 'Order', 'Type', 'Shares', 'Fill price', 'Total', 'P/L', 'Status'].map((c, i) => h('th', { class: i > 2 && i < 7 ? 'r' : '' }, c)))),
          h('tbody', null, ...done.map(histRow))))
        : h('p', { class: 'mute' }, 'No orders here yet.'));
  }

  const off = account.onChange(paint);
  paint();
  return { destroy() { off(); } };
}

function histRow(o: Order) {
  const total = o.fill != null ? o.qty * o.fill : null;
  return h('tr', { onclick: () => { location.hash = `#/s/${encodeURIComponent(o.sym)}`; } },
    h('td', { class: 'mute' }, when(o.done ?? o.placed)),
    h('td', null, h('span', { class: `o-side ${o.side}` }, o.side === 'buy' ? 'B' : 'S'), h('b', null, ` ${o.side === 'buy' ? 'Buy' : 'Sell'} ${o.sym}`)),
    h('td', null, o.type === 'market' ? 'Market' : `${o.type === 'limit' ? 'Limit' : 'Stop'} ${usd(o.trigger!)}`),
    h('td', { class: 'r num' }, shares(o.qty)),
    h('td', { class: 'r num' }, o.fill != null ? price(o.fill) : '—'),
    h('td', { class: 'r num' }, total != null ? usd(total) : '—'),
    h('td', { class: `r num ${o.pnl != null ? tone(o.pnl) : ''}` }, o.pnl != null ? usd(o.pnl, true) : '—'),
    h('td', null, h('span', { class: `status-tag ${o.status}`, title: o.note ?? '' }, o.status === 'filled' ? 'Filled' : o.status === 'cancelled' ? 'Cancelled' : 'Rejected')));
}
