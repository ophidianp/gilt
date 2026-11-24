// The custom title bar (wordmark, search, live status, window buttons) and the sidebar
// (account value, sections, live watchlist).
import { getCurrentWindow } from '@tauri-apps/api/window';
import { account, dayChange, value } from './account';
import { countTo, h, flash } from './dom';
import { pct, price, tone, usd } from './fmt';
import { live } from './live';
import { settings } from './settings';
import logo from './logo.json';
import { attachSearch } from './search';
import { nameOf, watchlist } from './store';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** When set, picking a search result adds it to the watchlist instead of opening it. */
let addMode = false;
const PLACEHOLDER = 'Search any stock to trade';

export function initTitlebar() {
  const wm = byId('wordmark') as unknown as SVGSVGElement;
  wm.setAttribute('viewBox', logo.viewBox);
  wm.innerHTML = `<path fill="currentColor" d="${logo.word}"/>`;

  // Window buttons. Outside Tauri (plain browser) these are simply inert.
  if ('__TAURI_INTERNALS__' in window && !('__GILT_DEV_MOCK__' in window)) {
    const win = getCurrentWindow();
    byId('win-min').addEventListener('click', () => win.minimize());
    byId('win-max').addEventListener('click', () => win.toggleMaximize());
    byId('win-close').addEventListener('click', () => win.close());
    const syncMax = async () => {
      const max = await win.isMaximized();
      document.body.classList.toggle('maximized', max);
      byId('win-max').setAttribute('aria-label', max ? 'Restore' : 'Maximize');
    };
    win.onResized(syncMax);
    syncMax();
    // Settings → Window
    const s = settings.get();
    if (s.startMaximized) win.maximize();
    if (s.alwaysOnTop) win.setAlwaysOnTop(true);
    settings.onChange((now, k) => { if (k === 'alwaysOnTop' || k === null) win.setAlwaysOnTop(now.alwaysOnTop); });
  }

  const input = byId<HTMLInputElement>('search');
  attachSearch({
    input,
    list: byId('search-results'),
    action: () => (addMode ? 'Watch' : 'Trade'),
    onPick(hit) {
      if (addMode) watchlist.add(hit.sym, hit.name);
      else location.hash = `#/s/${encodeURIComponent(hit.sym)}`;
      endAddMode();
    },
  });
  input.addEventListener('blur', () => window.setTimeout(endAddMode, 150));
  byId('watch-add').addEventListener('click', startAddSearch);

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

  initSidebar();
}

function endAddMode() {
  addMode = false;
  byId<HTMLInputElement>('search').placeholder = PLACEHOLDER;
  byId('search-box').classList.remove('adding');
}

export function startAddSearch() {
  addMode = true;
  const input = byId<HTMLInputElement>('search');
  input.placeholder = 'Add a stock to your watchlist';
  byId('search-box').classList.add('adding');
  input.focus();
}

export function setActiveTab(tab: 'portfolio' | 'markets' | 'orders' | 'settings' | null, sym: string | null = null) {
  document.querySelectorAll<HTMLAnchorElement>('.side-nav a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.querySelectorAll<HTMLElement>('.watch-list li').forEach((li) => li.classList.toggle('on', li.dataset.sym === sym));
  activeSym = sym;
}
let activeSym: string | null = null;

// ---------- sidebar ----------
function initSidebar() {
  const list = byId('watch-list');
  const rows = new Map<string, { li: HTMLElement; px: HTMLElement; ch: HTMLElement; last: number }>();

  function build() {
    rows.clear();
    const items = watchlist.items();
    if (!items.length) {
      list.replaceChildren(h('li', { class: 'watch-empty' }, 'Nothing here yet. Press + to add a stock.'));
      return;
    }
    list.replaceChildren(...items.map((it) => {
      const px = h('span', { class: 'w-px num' }, '—');
      const ch = h('span', { class: 'w-ch num' }, '');
      const li = h('li', { 'data-sym': it.sym, class: it.sym === activeSym ? 'on' : '' },
        h('a', { href: `#/s/${encodeURIComponent(it.sym)}`, title: nameOf(it.sym) },
          h('span', { class: 'w-sym' }, it.sym), px, ch),
        h('button', { type: 'button', class: 'w-x', 'aria-label': `Remove ${it.sym} from your watchlist`, onclick: () => watchlist.remove(it.sym) }, '×'));
      rows.set(it.sym, { li, px, ch, last: NaN });
      return li;
    }));
    paint(new Set());
  }

  function paint(fresh: Set<string>) {
    rows.forEach((r, sym) => {
      const q = live.get(sym);
      if (!q) return;
      if (fresh.has(sym) && !Number.isNaN(r.last) && q.price !== r.last) flash(r.px, q.price > r.last);
      r.last = q.price;
      r.px.textContent = price(q.price);
      r.ch.textContent = pct(q.price - q.prev, q.prev);
      r.ch.className = `w-ch num ${tone(q.price - q.prev)}`;
    });
  }

  function paintAccount() {
    const a = account.get();
    const val = byId('acct-val'), chg = byId('acct-chg'), badge = byId('open-count');
    if (!a) {
      val.textContent = 'Not opened';
      chg.textContent = 'Choose your starting cash';
      chg.className = 'acct-chg';
      badge.hidden = true;
      return;
    }
    const { value: v } = value(a, live.quotes);
    const d = dayChange(a, live.quotes);
    countTo(val, v, usd);
    chg.textContent = `${usd(d.change, true)} (${pct(d.change, d.base)}) today`;
    chg.className = `acct-chg num ${tone(d.change)}`;
    const n = account.openOrders().length;
    badge.hidden = !n;
    badge.textContent = String(n);
  }

  live.need(() => watchlist.items().map((i) => i.sym));
  live.need(() => account.symbols());
  live.on((_q, fresh) => { paint(fresh); paintAccount(); });
  watchlist.onChange(() => { build(); live.refresh(); });
  account.onChange(paintAccount);
  build();
  paintAccount();
}
