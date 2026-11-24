// Markets: your watchlist as cards with sparklines, and the biggest US companies, all live.
// Click any of them to open its page and trade it.
import { account } from './account';
import { flash, h, sparkPoints, sparkSvg, type View } from './dom';
import { pct, price, signed, tone } from './fmt';
import { live } from './live';
import { BIG, nameOf, watchlist } from './store';
import { startAddSearch } from './titlebar';

interface Cell { px: HTMLElement; ch: HTMLElement; line: SVGPolylineElement; svg: SVGSVGElement; held?: HTMLElement; last: number }

export function marketsView(root: HTMLElement): View {
  const cells = new Map<string, Cell[]>();
  const grid = h('div', { class: 'cards' });
  const big = h('div', { class: 'rows-list' });

  root.append(h('div', { class: 'page markets' },
    h('div', { class: 'page-head' },
      h('div', null, h('p', { class: 'eyebrow' }, 'Markets'), h('h1', { class: 'display sm' }, 'Pick something ', h('em', null, 'to trade.'))),
      h('p', { class: 'lede' }, 'Live prices for your watchlist and the biggest US companies. Click one to see its chart and trade it with paper money.')),
    h('section', { class: 'block' },
      h('div', { class: 'block-head' }, h('h2', null, 'Your watchlist'), h('button', { type: 'button', class: 'pill sm', onclick: startAddSearch }, '+ Add a stock')),
      grid),
    h('section', { class: 'block' },
      h('div', { class: 'block-head' }, h('h2', null, 'Biggest US companies')),
      big)));

  const add = (sym: string, c: Cell) => { const l = cells.get(sym) ?? []; l.push(c); cells.set(sym, l); };

  function buildCards() {
    for (const [sym, l] of cells) cells.set(sym, l.filter((c) => !grid.contains(c.px)));
    const items = watchlist.items();
    if (!items.length) {
      grid.replaceChildren(h('div', { class: 'empty-card' }, h('p', null, 'Your watchlist is empty. Add the stocks you want to keep an eye on.'),
        h('button', { type: 'button', class: 'pill', onclick: startAddSearch }, '+ Add a stock')));
      return;
    }
    grid.replaceChildren(...items.map((it) => {
      const { svg, line } = sparkSvg('spark');
      const px = h('div', { class: 'tile-px num' }, '—');
      const ch = h('span', { class: 'tile-ch num' });
      const held = h('span', { class: 'tile-held' });
      add(it.sym, { px, ch, line, svg, held, last: NaN });
      return h('a', { class: 'tile card', href: `#/s/${encodeURIComponent(it.sym)}` },
        h('div', { class: 'tile-top' }, h('div', null, h('b', null, it.sym), h('small', null, nameOf(it.sym))), ch),
        px, svg, held);
    }));
  }

  function buildBig() {
    big.replaceChildren(...BIG.map((it, i) => {
      const { svg, line } = sparkSvg('spark sm');
      const px = h('span', { class: 'r-px num' }, '—');
      const ch = h('span', { class: 'r-ch num' });
      add(it.sym, { px, ch, line, svg, last: NaN });
      return h('a', { class: 'row-link', href: `#/s/${encodeURIComponent(it.sym)}` },
        h('span', { class: 'r-n num' }, String(i + 1).padStart(2, '0')),
        h('span', { class: 'r-name' }, h('b', null, it.sym), h('small', null, it.name)),
        svg, px, ch, h('span', { class: 'r-go' }, 'Trade →'));
    }));
  }

  function paint(fresh: Set<string> = new Set()) {
    const a = account.get();
    cells.forEach((list, sym) => {
      const q = live.get(sym);
      for (const c of list) {
        if (a && c.held) {
          const p = a.positions[sym];
          c.held.textContent = p ? `You own ${+p.qty.toFixed(4)}` : '';
        }
        if (!q) continue;
        if (fresh.has(sym) && !Number.isNaN(c.last) && q.price !== c.last) flash(c.px, q.price > c.last);
        c.last = q.price;
        c.px.textContent = price(q.price);
        const d = q.price - q.prev;
        c.ch.textContent = `${signed(d)} (${pct(d, q.prev)})`;
        c.ch.className = `${c.ch.className.split(' ')[0]} num ${tone(d)}`;
        c.svg.classList.toggle('down', d < 0);
        if (q.closes.length > 1) c.line.setAttribute('points', sparkPoints(q.closes));
      }
    });
  }

  const offNeed = live.need(() => [...watchlist.items().map((i) => i.sym), ...BIG.map((b) => b.sym)]);
  const offLive = live.on((_q, fresh) => paint(fresh));
  const offWatch = watchlist.onChange(() => { buildCards(); paint(); });
  buildCards();
  buildBig();
  paint();
  live.refresh();
  return { destroy() { offNeed(); offLive(); offWatch(); } };
}
