import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter-tight/500.css';
import '@fontsource/inter-tight/600.css';
import '@fontsource/inter-tight/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles.css';
import './settings';

if (import.meta.env.DEV && !('__TAURI_INTERNALS__' in window)) await import('./devmock');

import { account } from './account';
import type { View } from './dom';
import { live } from './live';
import { marketsView } from './markets';
import { ordersView } from './orders';
import { portfolioView } from './portfolio';
import { stockView } from './stock';
import { settingsView } from './settings-page';
import { initTitlebar, setActiveTab } from './titlebar';
import { watchFills } from './toast';
import { slidingSegs } from './dom';

const view = document.getElementById('view') as HTMLElement;
let current: View | null = null;
let currentPath = '';

// #/           Portfolio (or "choose your starting cash")
// #/markets    Markets
// #/orders     Orders
// #/s/NVDA     one stock, with the order ticket
function route() {
  const path = location.hash.replace(/^#/, '') || '/';
  // moving between sections of Settings doesn't rebuild the page
  if (path.startsWith('/settings/') && currentPath.startsWith('/settings')) { currentPath = path; return; }
  currentPath = path;
  current?.destroy();
  current = null;
  view.replaceChildren();
  view.scrollTop = 0;

  const stock = path.match(/^\/s\/(.+)$/);
  if (stock) {
    const sym = decodeURIComponent(stock[1]).toUpperCase();
    if (/^[A-Z0-9^.\-=]{1,20}$/.test(sym)) {
      setActiveTab(null, sym);
      current = stockView(view, sym);
      return;
    }
  }
  if (path === '/markets') { setActiveTab('markets'); current = marketsView(view); return; }
  if (path === '/orders') { setActiveTab('orders'); current = ordersView(view); return; }
  const set = path.match(/^\/settings(?:\/([a-z-]+))?$/);
  if (set) { setActiveTab('settings'); current = settingsView(view, set[1]); return; }
  setActiveTab('portfolio');
  current = portfolioView(view);
}

// every price update can fill waiting orders and records the account's value
live.need(() => account.symbols());
live.on((quotes) => account.tick(quotes));

initTitlebar();
watchFills();
slidingSegs();
window.addEventListener('hashchange', route);
route();
live.start();

// No browser right-click menu (Reload, Inspect…) in the installed app, except in text fields.
if (import.meta.env.PROD) {
  document.addEventListener('contextmenu', (e) => {
    if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
  });
}
