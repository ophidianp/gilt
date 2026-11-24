// The order ticket on a stock's page: buy or sell, market / limit / stop, in shares or dollars,
// then a review step before the order is placed on the paper account.
import { account, tradable, type OrderInput, type OrderType, type Side } from './account';
import { h } from './dom';
import { alwaysOpen, shares, usd } from './fmt';
import { live } from './live';
import { settings } from './settings';

const TYPE_HELP: Record<OrderType, (side: Side) => string> = {
  market: (s) => `${s === 'buy' ? 'Buys' : 'Sells'} right away at the live price.`,
  limit: (s) => (s === 'buy' ? 'Buys only at your price or lower.' : 'Sells only at your price or higher.'),
  stop: (s) => (s === 'buy' ? 'Buys once the price rises to your stop.' : 'Sells once the price falls to your stop, to limit a loss.'),
};

export function ticket(sym: string) {
  let side: Side = 'buy';
  let type: OrderType = settings.get().defaultOrder;
  let unit: 'shares' | 'dollars' = settings.get().defaultUnit;
  const whole = (v: number) => (settings.get().fractional ? Math.floor(v * 1e4) / 1e4 : Math.floor(v));
  let reviewing = false;

  const el = h('section', { class: 'ticket', 'aria-label': `Trade ${sym}` });

  const sideSeg = seg([['buy', 'Buy'], ['sell', 'Sell']], () => side, (v) => { side = v as Side; reviewing = false; update(); }, 'side');
  const typeSeg = seg([['market', 'Market'], ['limit', 'Limit'], ['stop', 'Stop']], () => type, (v) => { type = v as OrderType; reviewing = false; update(); }, 'small');
  const unitSeg = seg([['shares', 'Shares'], ['dollars', 'Dollars']], () => unit, (v) => { unit = v as typeof unit; amount.value = ''; reviewing = false; update(); }, 'small');

  const amount = h('input', { class: 'field-input num', type: 'number', min: '0', step: 'any', inputmode: 'decimal', placeholder: '0', id: `amt-${sym}` }) as HTMLInputElement;
  const trigger = h('input', { class: 'field-input num', type: 'number', min: '0', step: 'any', inputmode: 'decimal', placeholder: '0.00', id: `trg-${sym}` }) as HTMLInputElement;
  const amountLabel = h('label', { for: amount.id }, 'Shares');
  const triggerLabel = h('label', { for: trigger.id }, 'Limit price');
  const maxBtn = h('button', { type: 'button', class: 'link-btn', onclick: fillMax }, 'Max');
  const triggerRow = h('div', { class: 'field' }, h('div', { class: 'field-top' }, triggerLabel), h('div', { class: 'field-box' }, h('span', { class: 'affix' }, '$'), trigger));
  const amountRow = h('div', { class: 'field' },
    h('div', { class: 'field-top' }, amountLabel, maxBtn),
    h('div', { class: 'field-box' }, h('span', { class: 'affix', id: `aff-${sym}` }, ''), amount));
  const help = h('p', { class: 'ticket-help' });

  const rows = h('dl', { class: 'ticket-rows' });
  const msg = h('p', { class: 'ticket-msg', role: 'status', 'aria-live': 'polite' });
  const reviewBtn = h('button', { type: 'button', class: 'pill acc wide', onclick: review }, 'Review order');
  const confirm = h('div', { class: 'ticket-confirm' });
  const closed = h('p', { class: 'ticket-closed' });

  const form = h('div', { class: 'ticket-form' }, typeSeg, help, triggerRow, h('div', { class: 'unit-row' }, unitSeg), amountRow, rows, reviewBtn, confirm, msg, closed);
  const setup = h('div', { class: 'ticket-setup' },
    h('p', null, 'Open a paper account to start trading. You choose how much pretend cash to start with.'),
    h('a', { class: 'pill acc wide', href: '#/' }, 'Open a paper account'));
  el.append(h('div', { class: 'ticket-head' }, h('p', { class: 'eyebrow' }, 'Paper trade'), h('span', { class: 'ticket-sym' }, sym)), sideSeg, form, setup);

  amount.addEventListener('input', () => { reviewing = false; msg.textContent = ''; update(); });
  trigger.addEventListener('input', () => { reviewing = false; msg.textContent = ''; update(); });
  amount.addEventListener('keydown', (e) => { if (e.key === 'Enter') review(); });

  /** What the order would be right now (qty in shares). */
  function current(): OrderInput & { per: number | null } {
    const q = live.get(sym);
    const trg = Number(trigger.value) || null;
    const per = type === 'market' ? q?.price ?? null : type === 'limit' ? trg : Math.max(trg ?? 0, q?.price ?? 0) || null;
    const raw = Number(amount.value) || 0;
    const qty = unit === 'shares' ? raw : per ? whole(raw / per) : 0;
    return { sym, side, type, qty, trigger: type === 'market' ? null : trg, per };
  }

  function fillMax() {
    const o = current();
    if (side === 'sell') {
      unit = 'shares';
      amount.value = String(account.sellable(sym));
    } else if (o.per) {
      const bp = account.buyingPower();
      const { slippage, commission } = settings.get();
      const room = Math.max(0, bp - commission) / (1 + slippage);
      amount.value = unit === 'dollars' ? (Math.floor(room * 100) / 100).toFixed(2) : String(whole(room / o.per));
    }
    reviewing = false;
    update();
  }

  function review() {
    const o = current();
    const q = live.get(sym);
    const err = account.check(o, q);
    msg.className = 'ticket-msg';
    if (err) { msg.textContent = err; msg.classList.add('bad'); reviewing = false; update(); return; }
    msg.textContent = '';
    if (!settings.get().review) { place(); return; }
    reviewing = true;
    update();
  }

  function place() {
    const o = current();
    const { error, order } = account.place(o, live.get(sym));
    msg.className = 'ticket-msg';
    reviewing = false;
    if (error || !order) { msg.textContent = error ?? 'Something went wrong.'; msg.classList.add('bad'); update(); return; }
    if (order.status === 'filled') {
      msg.textContent = `${order.side === 'buy' ? 'Bought' : 'Sold'} ${shares(order.qty)} ${sym} at ${usd(order.fill!)}.`;
      msg.classList.add('good');
    } else if (order.status === 'rejected') {
      msg.textContent = order.note ?? 'The order was rejected.';
      msg.classList.add('bad');
    } else {
      msg.textContent = order.type === 'market'
        ? `Order placed. It fills when the market opens.`
        : `Order placed. It fills when ${sym} reaches ${usd(order.trigger!)}.`;
      msg.classList.add('good');
    }
    amount.value = '';
    update();
  }

  function update() {
    const has = !!account.get();
    form.hidden = !has;
    sideSeg.hidden = !has;
    setup.hidden = has;
    if (!has) return;

    el.dataset.side = side;
    sync(sideSeg, side); sync(typeSeg, type); sync(unitSeg, unit);
    triggerRow.hidden = type === 'market';
    triggerLabel.textContent = type === 'limit' ? 'Limit price' : 'Stop price';
    amountLabel.textContent = unit === 'shares' ? 'Shares' : 'Amount';
    (el.querySelector(`#aff-${CSS.escape(sym)}`) as HTMLElement).textContent = unit === 'dollars' ? '$' : '';
    maxBtn.textContent = side === 'sell' ? 'Sell all' : 'Max';
    help.textContent = TYPE_HELP[type](side);

    const q = live.get(sym);
    const o = current();
    const est = o.per ? o.qty * o.per : 0;
    const items: [string, string][] = [
      [type === 'market' ? 'Price now' : 'Price now', q ? usd(q.price) : '—'],
      [unit === 'dollars' ? 'Shares' : side === 'buy' ? 'Estimated cost' : 'Estimated proceeds', unit === 'dollars' ? (o.qty ? shares(o.qty) : '—') : est ? usd(est) : '—'],
      side === 'buy' ? ['Buying power', usd(account.buyingPower())] : ['You can sell', `${shares(account.sellable(sym))} shares`],
    ];
    const fee = settings.get().commission;
    if (fee > 0) items.push(['Commission', usd(fee)]);
    rows.replaceChildren(...items.flatMap(([k, v]) => [h('dt', null, k), h('dd', { class: 'num' }, v)]));

    const open = tradable(sym, q);
    closed.hidden = open || alwaysOpen(sym);
    closed.textContent = type === 'market'
      ? 'The market is closed. Market orders wait and fill at the next open.'
      : 'The market is closed. Your order waits and fills once the price is reached during market hours.';

    reviewBtn.textContent = settings.get().review ? 'Review order' : side === 'buy' ? 'Place buy order' : 'Place sell order';
    reviewBtn.hidden = reviewing;
    confirm.hidden = !reviewing;
    if (reviewing) {
      const how = type === 'market' ? (open ? 'at the market price' : 'at the next open') : `with a ${type} at ${usd(o.trigger!)}`;
      confirm.replaceChildren(
        h('p', { class: 'confirm-line' }, `${side === 'buy' ? 'Buy' : 'Sell'} `, h('b', { class: 'num' }, `${shares(o.qty)} ${sym}`), ` ${how}`,
          est ? h('span', { class: 'mute num' }, ` · about ${usd(est)}`) : ''),
        h('div', { class: 'confirm-btns' },
          h('button', { type: 'button', class: 'pill acc', onclick: place }, side === 'buy' ? 'Place buy order' : 'Place sell order'),
          h('button', { type: 'button', class: 'pill', onclick: () => { reviewing = false; update(); } }, 'Edit')));
    }
  }

  const offLive = live.on(() => { if (!reviewing) update(); });
  const offAcc = account.onChange(update);
  const offSet = settings.onChange(() => { if (!reviewing) update(); });
  update();
  return {
    el,
    /** Pre-fill a sell of everything (from the position card). */
    sellAll() { side = 'sell'; type = 'market'; unit = 'shares'; amount.value = String(account.sellable(sym)); reviewing = false; update(); amount.focus(); },
    destroy() { offLive(); offAcc(); offSet(); },
  };
}

function seg(opts: [string, string][], get: () => string, set: (v: string) => void, cls: string) {
  return h('div', { class: `seg ${cls}`, role: 'radiogroup' }, ...opts.map(([v, label]) =>
    h('button', { type: 'button', role: 'radio', 'data-v': v, 'aria-checked': String(get() === v), onclick: () => set(v) }, label)));
}
function sync(segEl: HTMLElement, v: string) {
  segEl.querySelectorAll<HTMLElement>('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === v)));
}

