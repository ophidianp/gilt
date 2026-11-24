// Every preference in one place, saved in local storage. Screens read `settings.get()` and can
// listen for changes; appearance settings are applied to <html> straight away.

export type ChartType =
  | 'candle' | 'bar' | 'colored-bar' | 'line' | 'colored-line' | 'vertex-line' | 'step'
  | 'mountain' | 'baseline' | 'hollow-candle' | 'volume-candle' | 'colored-hlc' | 'points' | 'histogram';

export interface Settings {
  // appearance
  theme: 'dark' | 'light' | 'system';
  colors: 'green-red' | 'blue-orange' | 'red-green';
  motion: 'full' | 'reduced' | 'off';
  density: 'comfortable' | 'compact';
  // charts
  defaultRange: '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y';
  chartType: ChartType;
  showVolume: boolean;
  showPrevClose: boolean;
  showForecast: boolean;
  forecastReach: 'short' | 'medium' | 'long';
  showAnnotations: boolean;
  magnet: boolean;
  logScale: boolean;
  // prices & data
  refreshOpen: number; // ms
  refreshClosed: number;
  refreshHidden: number; // 0 = paused
  timeZone: 'market' | 'local';
  // trading
  review: boolean;
  defaultOrder: 'market' | 'limit' | 'stop';
  defaultUnit: 'shares' | 'dollars';
  fractional: boolean;
  commission: number; // $ per order
  slippage: number; // fraction, 0.001 = 0.1%
  // notifications
  fillToasts: boolean;
  fillSound: boolean;
  // AI
  apiKey: string;
  model: 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5';
  // window
  alwaysOnTop: boolean;
  startMaximized: boolean;
}

export const DEFAULTS: Settings = {
  theme: 'dark', colors: 'green-red', motion: 'full', density: 'comfortable',
  defaultRange: '1D', chartType: 'candle', showVolume: true, showPrevClose: true, showForecast: true,
  forecastReach: 'medium', showAnnotations: true, magnet: true, logScale: false,
  refreshOpen: 3000, refreshClosed: 30000, refreshHidden: 20000, timeZone: 'market',
  review: true, defaultOrder: 'market', defaultUnit: 'shares', fractional: true, commission: 0, slippage: 0,
  fillToasts: true, fillSound: false,
  apiKey: '', model: 'claude-opus-5-5',
  alwaysOnTop: false, startMaximized: false,
};

const KEY = 'gilt.settings.v1';
type Listener = (s: Settings, changed: keyof Settings | null) => void;
const listeners = new Set<Listener>();

let cur: Settings = load();

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const out = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS) as (keyof Settings)[]) {
      if (k in raw && typeof raw[k] === typeof DEFAULTS[k]) (out as any)[k] = raw[k];
    }
    return out;
  } catch {
    return { ...DEFAULTS };
  }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* storage full or blocked */ }
}

const systemLight = matchMedia('(prefers-color-scheme: light)');
const systemCalm = matchMedia('(prefers-reduced-motion: reduce)');

/** Puts the appearance settings on <html> so the CSS can follow them. */
function apply() {
  const root = document.documentElement;
  const light = cur.theme === 'light' || (cur.theme === 'system' && systemLight.matches);
  root.dataset.theme = light ? 'light' : 'dark';
  root.dataset.colors = cur.colors;
  root.dataset.motion = motionLevel();
  root.classList.toggle('compact', cur.density === 'compact');
}

/** 'off' also when the system asks for reduced motion and the setting is left on Full. */
export function motionLevel(): Settings['motion'] {
  if (cur.motion === 'full' && systemCalm.matches) return 'reduced';
  return cur.motion;
}
export const animate = () => motionLevel() === 'full';

export const settings = {
  get: () => cur,
  set<K extends keyof Settings>(k: K, v: Settings[K]) {
    if (cur[k] === v) return;
    cur = { ...cur, [k]: v };
    save();
    apply();
    listeners.forEach((l) => l(cur, k));
  },
  /** Back to the defaults, keeping the API key unless `all` is set. */
  reset(all = false) {
    cur = { ...DEFAULTS, apiKey: all ? '' : cur.apiKey };
    save();
    apply();
    listeners.forEach((l) => l(cur, null));
  },
  onChange(l: Listener) {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
  apply,
};

systemLight.addEventListener('change', apply);
systemCalm.addEventListener('change', apply);
apply();
