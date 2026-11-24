// The watchlist and stock names, kept in this computer's local storage. (The paper account is in account.ts.)

export interface Item { sym: string; name: string }

export const BIG: Item[] = [
  { sym: 'AAPL', name: 'Apple' },
  { sym: 'MSFT', name: 'Microsoft' },
  { sym: 'NVDA', name: 'NVIDIA' },
  { sym: 'GOOGL', name: 'Alphabet' },
  { sym: 'AMZN', name: 'Amazon' },
  { sym: 'META', name: 'Meta Platforms' },
  { sym: 'AVGO', name: 'Broadcom' },
  { sym: 'TSLA', name: 'Tesla' },
  { sym: 'BRK-B', name: 'Berkshire Hathaway' },
  { sym: 'JPM', name: 'JPMorgan Chase' },
];

const DEFAULT_WATCH: Item[] = [
  { sym: 'NVDA', name: 'NVIDIA' },
  { sym: 'AMD', name: 'Advanced Micro Devices' },
  { sym: 'TSLA', name: 'Tesla' },
  { sym: 'PLTR', name: 'Palantir' },
  { sym: 'COIN', name: 'Coinbase' },
  { sym: 'SOFI', name: 'SoFi Technologies' },
];

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
const save = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v));

type Listener = () => void;
function emitter() {
  const ls = new Set<Listener>();
  return {
    on(l: Listener) { ls.add(l); return () => { ls.delete(l); }; },
    emit() { ls.forEach((l) => l()); },
  };
}

// ---------- names ----------
const names = new Map<string, string>([...BIG, ...DEFAULT_WATCH].map((i) => [i.sym, i.name]));
export const nameOf = (sym: string) => names.get(sym) ?? sym;
export function rememberName(sym: string, name: string) {
  if (name && name !== sym) names.set(sym, name);
}

// ---------- watchlist ----------
const WATCH_KEY = 'gilt.watch.v1';
const watchEvents = emitter();
let watch: Item[] = load(WATCH_KEY, DEFAULT_WATCH);
watch.forEach((i) => rememberName(i.sym, i.name));

export const watchlist = {
  items: () => watch,
  has: (sym: string) => watch.some((i) => i.sym === sym),
  add(sym: string, name = nameOf(sym)) {
    if (this.has(sym)) return;
    rememberName(sym, name);
    watch = [...watch, { sym, name }];
    save(WATCH_KEY, watch);
    watchEvents.emit();
  },
  remove(sym: string) {
    watch = watch.filter((i) => i.sym !== sym);
    save(WATCH_KEY, watch);
    watchEvents.emit();
  },
  /** Replaces the whole list (restore from a backup, or back to the starting list). */
  replace(items: Item[] = DEFAULT_WATCH) {
    watch = items.filter((i) => i && typeof i.sym === 'string').map((i) => ({ sym: i.sym, name: i.name ?? i.sym }));
    watch.forEach((i) => rememberName(i.sym, i.name));
    save(WATCH_KEY, watch);
    watchEvents.emit();
  },
  onChange: watchEvents.on,
};
