// Settings: appearance, charts, prices, trading, notifications, AI, window, your data,
// keyboard shortcuts and about. Every control saves as soon as it changes.
import { account } from './account';
import { aiError, testKey } from './ai';
import { h, type View } from './dom';
import { DEFAULTS, settings, type Settings } from './settings';
import { watchlist } from './store';
import { chime, toast } from './toast';
import { CHART_TYPES } from './viewer';

const VERSION = '0.3.0';
const inTauri = '__TAURI_INTERNALS__' in window && !('__GILT_DEV_MOCK__' in window);

type Opt<T> = [T, string];

export function settingsView(root: HTMLElement, section?: string): View {
  const offs: (() => void)[] = [];
  const S = () => settings.get();

  /** A labelled row: name and help on the left, the control on the right. */
  const row = (label: string, help: string, control: Node, id?: string) =>
    h('div', { class: 'set-row', id: id ?? null },
      h('div', { class: 'set-text' }, h('b', null, label), help ? h('p', null, help) : ''),
      h('div', { class: 'set-ctl' }, control));

  function seg<K extends keyof Settings>(key: K, opts: Opt<Settings[K]>[], label = String(key)) {
    const el = h('div', { class: 'seg small', role: 'radiogroup', 'aria-label': label },
      ...opts.map(([v, text]) => h('button', { type: 'button', role: 'radio', 'data-v': String(v), onclick: () => settings.set(key, v) }, text)));
    const sync = () => el.querySelectorAll<HTMLElement>('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === String(S()[key]))));
    sync();
    offs.push(settings.onChange(sync));
    return el;
  }

  function toggle<K extends { [P in keyof Settings]: Settings[P] extends boolean ? P : never }[keyof Settings]>(key: K, label: string) {
    const el = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-label': label, onclick: () => settings.set(key, !S()[key] as Settings[K]) }, h('span'));
    const sync = () => el.setAttribute('aria-checked', String(S()[key]));
    sync();
    offs.push(settings.onChange(sync));
    return el;
  }

  function select<K extends keyof Settings>(key: K, opts: Opt<Settings[K]>[], label: string) {
    const el = h('select', { class: 'set-select', 'aria-label': label }, ...opts.map(([v, text]) => h('option', { value: String(v) }, text))) as HTMLSelectElement;
    const sync = () => { el.value = String(S()[key]); };
    el.addEventListener('change', () => { const o = opts.find(([v]) => String(v) === el.value); if (o) settings.set(key, o[0]); });
    sync();
    offs.push(settings.onChange(sync));
    return el;
  }

  function money(key: 'commission', label: string) {
    const input = h('input', { class: 'set-input num', type: 'number', min: '0', max: '100', step: '0.01', 'aria-label': label }) as HTMLInputElement;
    input.value = String(S()[key]);
    input.addEventListener('change', () => {
      const v = Math.max(0, Math.min(100, Number(input.value) || 0));
      input.value = String(v);
      settings.set(key, v);
    });
    return h('div', { class: 'set-money' }, h('span', null, '$'), input);
  }

  // ---------- AI key ----------
  const keyInput = h('input', { class: 'set-input key', type: 'password', placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Anthropic API key' }) as HTMLInputElement;
  keyInput.value = S().apiKey;
  const keyMsg = h('p', { class: 'set-msg', role: 'status', 'aria-live': 'polite' });
  const showBtn = h('button', { type: 'button', class: 'link-btn', onclick: () => { keyInput.type = keyInput.type === 'password' ? 'text' : 'password'; showBtn.textContent = keyInput.type === 'password' ? 'Show' : 'Hide'; } }, 'Show');
  const saveKey = () => {
    const v = keyInput.value.trim();
    settings.set('apiKey', v);
    keyMsg.className = 'set-msg';
    keyMsg.textContent = v ? 'Saved on this computer.' : 'Key removed.';
  };
  keyInput.addEventListener('change', saveKey);
  const testBtn = h('button', { type: 'button', class: 'pill sm', onclick: async () => {
    saveKey();
    if (!S().apiKey) return;
    keyMsg.className = 'set-msg'; keyMsg.textContent = 'Checking…';
    try { keyMsg.textContent = await testKey(S().apiKey); keyMsg.classList.add('good'); }
    catch (e) { keyMsg.textContent = aiError(e); keyMsg.classList.add('bad'); }
  } }, 'Test key');
  const removeBtn = h('button', { type: 'button', class: 'link-btn', onclick: () => { keyInput.value = ''; saveKey(); } }, 'Remove');

  // ---------- backup ----------
  const restoreBox = h('div', { class: 'set-restore', hidden: true });
  const backupMsg = h('p', { class: 'set-msg', role: 'status', 'aria-live': 'polite' });
  function backupText() {
    const { apiKey: _k, ...rest } = S();
    void _k;
    return JSON.stringify({ app: 'gilt', v: 1, saved: new Date().toISOString(), account: account.get(), watchlist: watchlist.items(), settings: rest,
      drawings: JSON.parse(localStorage.getItem('gilt.drawings.v1') ?? '{}') });
  }
  async function copyBackup() {
    try {
      await navigator.clipboard.writeText(backupText());
      backupMsg.className = 'set-msg good';
      backupMsg.textContent = 'Backup copied. Paste it into a text file to keep it. Your API key is not included.';
    } catch {
      backupMsg.className = 'set-msg bad';
      backupMsg.textContent = "Couldn't reach the clipboard.";
    }
  }
  function openRestore() {
    const ta = h('textarea', { class: 'set-ta', rows: '5', placeholder: 'Paste a gilt backup here', spellcheck: 'false' }) as HTMLTextAreaElement;
    restoreBox.hidden = false;
    restoreBox.replaceChildren(ta, h('div', { class: 'set-btns' },
      h('button', { type: 'button', class: 'pill sm acc', onclick: () => {
        try {
          const b = JSON.parse(ta.value);
          if (b?.app !== 'gilt') throw new Error();
          if (b.account && !account.restore(b.account)) throw new Error();
          if (Array.isArray(b.watchlist)) watchlist.replace(b.watchlist);
          if (b.settings) for (const [k, v] of Object.entries(b.settings)) if (k in DEFAULTS && k !== 'apiKey' && typeof v === typeof (DEFAULTS as any)[k]) settings.set(k as keyof Settings, v as never);
          if (b.drawings) localStorage.setItem('gilt.drawings.v1', JSON.stringify(b.drawings));
          restoreBox.hidden = true;
          backupMsg.className = 'set-msg good';
          backupMsg.textContent = 'Backup restored.';
        } catch {
          backupMsg.className = 'set-msg bad';
          backupMsg.textContent = "That doesn't look like a gilt backup.";
        }
      } }, 'Restore'),
      h('button', { type: 'button', class: 'pill sm', onclick: () => { restoreBox.hidden = true; } }, 'Cancel')));
    ta.focus();
  }

  /** A button that asks once more before doing something that can't be undone. */
  function danger(label: string, question: string, act: () => void) {
    const wrap = h('div', { class: 'set-danger' });
    const ask = () => wrap.replaceChildren(
      h('span', { class: 'set-q' }, question),
      h('button', { type: 'button', class: 'pill sm danger', onclick: () => { act(); idle(); } }, 'Yes'),
      h('button', { type: 'button', class: 'pill sm', onclick: idle }, 'Cancel'));
    const idle = () => wrap.replaceChildren(h('button', { type: 'button', class: 'pill sm danger', onclick: ask }, label));
    idle();
    return wrap;
  }

  const sections: [string, string, Node[]][] = [
    ['appearance', 'Appearance', [
      row('Theme', 'System follows Windows.', seg('theme', [['dark', 'Dark'], ['light', 'Light'], ['system', 'System']], 'Theme')),
      row('Gains and losses', 'Blue and orange are easier to tell apart with red–green colour blindness. Red-up is the convention in China and Japan.',
        seg('colors', [['green-red', 'Green / red'], ['blue-orange', 'Blue / orange'], ['red-green', 'Red up']], 'Gain and loss colours')),
      row('Motion', 'Reduced keeps fades but drops movement. System reduced-motion settings are respected.', seg('motion', [['full', 'Full'], ['reduced', 'Reduced'], ['off', 'Off']], 'Motion')),
      row('Density', 'Compact fits more on screen.', seg('density', [['comfortable', 'Comfortable'], ['compact', 'Compact']], 'Density')),
    ]],
    ['charts', 'Charts', [
      row('Starting range', 'The range a stock page opens on.', seg('defaultRange', ['1D', '1W', '1M', '3M', '1Y', '5Y'].map((r) => [r, r]) as Opt<Settings['defaultRange']>[], 'Starting range')),
      row('Full-screen chart type', 'Also changeable from the full-screen chart.', select('chartType', CHART_TYPES.map(([k, label]) => [k, label]), 'Chart type')),
      row('Previous close line', "Yesterday's close as a dashed line on 1D charts.", toggle('showPrevClose', 'Previous close line')),
      row('Volume pane', 'Trading volume under the full-screen chart.', toggle('showVolume', 'Volume pane')),
      row('Forecast cone', 'Where the price could be next, with 50% and 90% ranges.', toggle('showForecast', 'Forecast cone')),
      row('Forecast reach', 'How far ahead the forecast looks, as a share of the bars on screen.', seg('forecastReach', [['short', 'Short'], ['medium', 'Medium'], ['long', 'Long']], 'Forecast reach')),
      row('Automatic notes', 'Support, resistance, crossovers, volume spikes and gaps.', toggle('showAnnotations', 'Automatic notes')),
      row('Magnet', 'The crosshair and drawings snap to the nearest open, high, low or close.', toggle('magnet', 'Magnet')),
      row('Log scale', 'Equal percentage moves look the same size. Useful on long ranges.', toggle('logScale', 'Log scale')),
    ]],
    ['data', 'Prices and data', [
      row('While the market is open', 'How often prices refresh.', seg('refreshOpen', [[2000, '2 s'], [3000, '3 s'], [5000, '5 s'], [10000, '10 s']], 'Refresh while open')),
      row('While it is closed', 'Crypto and currencies still move.', seg('refreshClosed', [[15000, '15 s'], [30000, '30 s'], [60000, '1 min'], [300000, '5 min']], 'Refresh while closed')),
      row('While gilt is minimized', 'Paused saves data; waiting orders then fill when you come back.', seg('refreshHidden', [[20000, '20 s'], [60000, '1 min'], [0, 'Paused']], 'Refresh while minimized')),
      row('Show times in', 'Market hours are always New York time.', seg('timeZone', [['market', 'New York'], ['local', 'This computer']], 'Time zone')),
    ]],
    ['trading', 'Trading', [
      row('Review before placing', 'Shows a confirm step before each order.', toggle('review', 'Review before placing')),
      row('Default order type', '', seg('defaultOrder', [['market', 'Market'], ['limit', 'Limit'], ['stop', 'Stop']], 'Default order type')),
      row('Default amount in', '', seg('defaultUnit', [['shares', 'Shares'], ['dollars', 'Dollars']], 'Default amount')),
      row('Fractional shares', 'Off means whole shares only, like many real brokers.', toggle('fractional', 'Fractional shares')),
      row('Commission per order', 'Charged on every fill, to practise with real-world costs.', money('commission', 'Commission per order')),
      row('Slippage', 'Fills land slightly worse than the quoted price, like a real market order.', seg('slippage', [[0, 'None'], [0.0005, '0.05%'], [0.001, '0.1%'], [0.0025, '0.25%']], 'Slippage')),
    ]],
    ['alerts', 'Notifications', [
      row('Pop-up when an order fills', 'A small note in the corner, wherever you are in gilt.', toggle('fillToasts', 'Fill pop-ups')),
      row('Sound when an order fills', 'A soft chime.', h('div', { class: 'set-inline' }, toggle('fillSound', 'Fill sound'), h('button', { type: 'button', class: 'link-btn', onclick: () => chime(true) }, 'Play'))),
    ]],
    ['ai', 'AI', [
      row('Anthropic API key', 'Lets "Ask Claude" read a chart in the full-screen view. Kept on this computer and sent only to Anthropic. Get one at console.anthropic.com.',
        h('div', { class: 'set-key' }, h('div', { class: 'set-key-row' }, keyInput, showBtn), h('div', { class: 'set-btns' }, testBtn, removeBtn), keyMsg), 'ai-key'),
      row('Model', 'Opus is the most thorough; Haiku is quickest and cheapest. Each request is billed to your Anthropic account.',
        seg('model', [['claude-opus-5-5', 'Opus 5.5'], ['claude-sonnet-5-5', 'Sonnet 5.5'], ['claude-haiku-5-5', 'Haiku 5.5']], 'Model')),
    ]],
    ['window', 'Window', [
      row('Always on top', inTauri ? 'Keeps gilt above other windows.' : 'Only in the installed app.', toggle('alwaysOnTop', 'Always on top')),
      row('Start maximized', inTauri ? 'Opens gilt full size.' : 'Only in the installed app.', toggle('startMaximized', 'Start maximized')),
    ]],
    ['your-data', 'Your data', [
      row('Backup', 'Your account, orders, watchlist, drawings and settings as text, to keep or move to another computer.',
        h('div', { class: 'set-key' }, h('div', { class: 'set-btns' }, h('button', { type: 'button', class: 'pill sm', onclick: copyBackup }, 'Copy backup'), h('button', { type: 'button', class: 'pill sm', onclick: openRestore }, 'Restore…')), restoreBox, backupMsg)),
      row('Reset paper account', 'Closes the account and its history. You choose new starting cash next.', danger('Reset account', 'Erase the account?', () => { account.reset(); toast('Paper account reset.'); })),
      row('Reset watchlist', 'Back to the starting list.', danger('Reset watchlist', 'Replace your watchlist?', () => { watchlist.replace(); toast('Watchlist reset.'); })),
      row('Reset settings', 'Everything on this page back to its default. Your API key is kept.', danger('Reset settings', 'Reset all settings?', () => { settings.reset(); toast('Settings reset.'); })),
      row('Erase everything', 'Account, watchlist, drawings, settings and API key. gilt starts fresh.', danger('Erase everything', 'Erase all gilt data?', () => {
        account.reset(); watchlist.replace(); settings.reset(true);
        localStorage.removeItem('gilt.drawings.v1'); localStorage.removeItem('gilt.viewer.v1'); localStorage.removeItem('gilt.quotes.v1');
        keyInput.value = '';
        toast('Everything erased.');
      })),
    ]],
    ['keys', 'Keyboard', [
      h('dl', { class: 'keys' }, ...([
        ['Ctrl K', 'Search any stock'],
        ['F', 'Full-screen chart (on a stock page)'],
        ['Esc', 'Close the full-screen chart, menu or tool'],
        ['+  /  −', 'Zoom the full-screen chart'],
        ['←  /  →', 'Move back and forward in time'],
        ['0', 'Reset the zoom'],
        ['Scroll', 'Zoom around the pointer'],
        ['Drag', 'Pan; double-click resets'],
      ] as [string, string][]).map(([k, v]) => h('div', null, h('dt', null, ...k.split('  ').map((p) => (p === '/' ? h('span', { class: 'mute' }, ' / ') : h('kbd', null, p)))), h('dd', null, v)))),
    ]],
    ['about', 'About', [
      h('div', { class: 'about' },
        h('p', null, h('b', null, `gilt ${VERSION}`), ' · paper trading on live prices.'),
        h('p', { class: 'mute' }, "Prices come from Yahoo Finance's public data and can be delayed. Everything is pretend money, saved only on this computer. Forecasts and Claude's notes are statistics and opinions about past prices, not advice."),
        h('a', { class: 'more', href: 'https://ophidianp.github.io/', target: '_blank', rel: 'noopener' }, 'More projects ↗')),
    ]],
  ];

  const nav = h('nav', { class: 'set-nav', 'aria-label': 'Settings sections' },
    ...sections.map(([id, title]) => h('a', { href: `#/settings/${id}`, 'data-id': id, onclick: (e: Event) => { e.preventDefault(); jump(id); } }, title)));
  const body = h('div', { class: 'set-body' },
    ...sections.map(([id, title, rows]) => h('section', { class: 'set-sec', id: `set-${id}` }, h('h2', null, title), ...rows)));

  root.append(h('div', { class: 'page settings' },
    h('div', { class: 'page-head' },
      h('div', null, h('p', { class: 'eyebrow' }, 'Settings'), h('h1', { class: 'display sm' }, 'Make it ', h('em', null, 'yours.'))),
      h('p', { class: 'lede' }, 'Changes save as you make them.')),
    h('div', { class: 'set-grid' }, nav, body)));

  const scroller = root;
  function jump(id: string) {
    const target = document.getElementById(`set-${id}`);
    if (!target) return;
    history.replaceState(null, '', `#/settings/${id}`);
    scroller.scrollTo({ top: target.offsetTop - 24, behavior: document.documentElement.dataset.motion === 'full' ? 'smooth' : 'auto' });
  }
  // highlight the section in view
  const spy = () => {
    let cur = sections[0][0];
    for (const [id] of sections) { const s = document.getElementById(`set-${id}`); if (s && s.offsetTop - 80 <= scroller.scrollTop) cur = id; }
    nav.querySelectorAll<HTMLElement>('a').forEach((a) => a.classList.toggle('on', a.dataset.id === cur));
  };
  scroller.addEventListener('scroll', spy, { passive: true });
  requestAnimationFrame(() => { if (section) jump(section); spy(); if (section === 'ai') keyInput.focus(); });

  return { destroy() { offs.forEach((o) => o()); scroller.removeEventListener('scroll', spy); } };
}
