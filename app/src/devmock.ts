// Dev only: lets `npm run dev` run in a plain browser by answering the three Rust price commands
// through Vite's /yf proxy. Never included in the installed app (main.ts only loads it in dev,
// outside Tauri).
const get = async (path: string, q: Record<string, string>) => {
  const r = await fetch(`/yf${path}?${new URLSearchParams(q)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

(window as any).__TAURI_INTERNALS__ = {
  metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
  transformCallback: () => 0,
  async invoke(cmd: string, a: any) {
    if (cmd === 'spark') return get('/v8/finance/spark', { symbols: a.symbols.join(','), range: '1d', interval: '5m' });
    if (cmd === 'chart') return get(`/v8/finance/chart/${encodeURIComponent(a.symbol)}`, { range: a.range, interval: a.interval });
    if (cmd === 'search') return get('/v1/finance/search', { q: a.query, quotesCount: '8', newsCount: '0', listsCount: '0' });
    return null; // window buttons etc. do nothing in a browser
  },
};
(window as any).__GILT_DEV_MOCK__ = true;
export {};
