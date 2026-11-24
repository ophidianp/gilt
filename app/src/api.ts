// Market data, fetched by the Rust side (src-tauri/src/lib.rs) from Yahoo Finance's public endpoints.
import { invoke } from '@tauri-apps/api/core';

export interface Quote {
  sym: string;
  price: number;
  prev: number; // previous close
  closes: number[]; // today's 5-minute closes, for sparklines
  time: number; // unix seconds of the latest trade
}

export interface Point { t: number; v: number }

export interface Chart {
  sym: string;
  name: string;
  exchange: string;
  price: number;
  prev: number;
  points: Point[];
  /** Today's regular session in unix seconds, used to lay out the 1D chart. */
  session: [number, number] | null;
  time: number;
}

export type RangeKey = '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y';
export const RANGES: Record<RangeKey, { range: string; interval: string; label: string }> = {
  '1D': { range: '1d', interval: '1m', label: 'today' },
  '1W': { range: '5d', interval: '15m', label: 'past week' },
  '1M': { range: '1mo', interval: '1h', label: 'past month' },
  '3M': { range: '3mo', interval: '1d', label: 'past 3 months' },
  '1Y': { range: '1y', interval: '1d', label: 'past year' },
  '5Y': { range: '5y', interval: '1wk', label: 'past 5 years' },
};

export interface SearchHit { sym: string; name: string; exchange: string; type: string }

const nums = (a: unknown): number[] => (Array.isArray(a) ? a.filter((v): v is number => typeof v === 'number') : []);

/** Live quotes for any number of tickers (sent 20 at a time). */
export async function fetchQuotes(symbols: string[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>();
  const unique = [...new Set(symbols)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 20) chunks.push(unique.slice(i, i + 20));
  const replies = await Promise.all(chunks.map((c) => invoke<Record<string, any>>('spark', { symbols: c })));
  replies.forEach((raw, k) => {
    for (const sym of chunks[k]) {
      const r = raw?.[sym];
      if (!r) continue;
      const closes = nums(r.close);
      const price = typeof r.fulldayPrice === 'number' ? r.fulldayPrice : closes[closes.length - 1];
      const prev = r.previousClose ?? r.chartPreviousClose;
      if (typeof price !== 'number' || typeof prev !== 'number') continue;
      const ts = nums(r.timestamp);
      out.set(sym, { sym, price, prev, closes, time: ts[ts.length - 1] ?? 0 });
    }
  });
  return out;
}

export async function fetchChart(sym: string, range: RangeKey): Promise<Chart> {
  const { range: r, interval } = RANGES[range];
  const raw = await invoke<any>('chart', { symbol: sym, range: r, interval });
  const res = raw?.chart?.result?.[0];
  if (!res) throw new Error(raw?.chart?.error?.description ?? `No data for ${sym}`);
  const m = res.meta ?? {};
  const ts: number[] = res.timestamp ?? [];
  const cl: (number | null)[] = res.indicators?.quote?.[0]?.close ?? [];
  const points: Point[] = [];
  ts.forEach((t, i) => { const v = cl[i]; if (typeof v === 'number') points.push({ t, v }); });
  const price = m.regularMarketPrice ?? points[points.length - 1]?.v;
  const reg = m.currentTradingPeriod?.regular;
  return {
    sym,
    name: m.longName ?? m.shortName ?? sym,
    exchange: m.fullExchangeName ?? m.exchangeName ?? '',
    price,
    prev: m.previousClose ?? m.chartPreviousClose ?? points[0]?.v ?? price,
    points,
    session: reg && range === '1D' ? [reg.start, reg.end] : null,
    time: m.regularMarketTime ?? ts[ts.length - 1] ?? 0,
  };
}

const KINDS = new Set(['EQUITY', 'ETF', 'INDEX', 'MUTUALFUND', 'CRYPTOCURRENCY']);
const OK_SYMBOL = /^[A-Za-z0-9^.\-=]{1,20}$/;

export async function searchStocks(query: string): Promise<SearchHit[]> {
  const raw = await invoke<any>('search', { query });
  const quotes: any[] = raw?.quotes ?? [];
  return quotes
    .filter((q) => KINDS.has(q.quoteType) && OK_SYMBOL.test(q.symbol ?? ''))
    .map((q) => ({ sym: q.symbol, name: q.longname ?? q.shortname ?? q.symbol, exchange: q.exchDisp ?? '', type: q.typeDisp ?? '' }));
}

/** One price bar: open, high, low, close and volume over an interval starting at t (unix seconds). */
export interface Bar { t: number; o: number; h: number; l: number; c: number; v: number }

export interface Bars {
  sym: string;
  name: string;
  exchange: string;
  price: number;
  prev: number;
  bars: Bar[];
  /** True when the bars are shorter than a day (times matter, not just dates). */
  intraday: boolean;
}

/** The full-screen viewer's ranges, each with the bar sizes that make sense for it (first = default). */
export type ViewRange = '1D' | '5D' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '5Y' | 'MAX';
export const VIEW_RANGES: Record<ViewRange, { range: string; intervals: string[] }> = {
  '1D': { range: '1d', intervals: ['2m', '1m', '5m', '15m'] },
  '5D': { range: '5d', intervals: ['15m', '5m', '30m', '60m'] },
  '1M': { range: '1mo', intervals: ['60m', '30m', '1d'] },
  '3M': { range: '3mo', intervals: ['1d', '60m', '1wk'] },
  '6M': { range: '6mo', intervals: ['1d', '1wk'] },
  YTD: { range: 'ytd', intervals: ['1d', '1wk'] },
  '1Y': { range: '1y', intervals: ['1d', '1wk'] },
  '5Y': { range: '5y', intervals: ['1wk', '1d', '1mo'] },
  MAX: { range: 'max', intervals: ['1mo', '1wk', '3mo'] },
};
export const INTERVAL_NAME: Record<string, string> = {
  '1m': '1 min', '2m': '2 min', '5m': '5 min', '15m': '15 min', '30m': '30 min', '60m': '1 hour',
  '1d': '1 day', '1wk': '1 week', '1mo': '1 month', '3mo': '3 months',
};

export async function fetchBars(sym: string, range: string, interval: string): Promise<Bars> {
  const raw = await invoke<any>('chart', { symbol: sym, range, interval });
  const res = raw?.chart?.result?.[0];
  if (!res) throw new Error(raw?.chart?.error?.description ?? `No data for ${sym}`);
  const m = res.meta ?? {};
  const ts: number[] = res.timestamp ?? [];
  const q = res.indicators?.quote?.[0] ?? {};
  const bars: Bar[] = [];
  ts.forEach((t, i) => {
    const o = q.open?.[i], hi = q.high?.[i], lo = q.low?.[i], c = q.close?.[i];
    if (typeof c !== 'number' || typeof o !== 'number' || typeof hi !== 'number' || typeof lo !== 'number') return;
    bars.push({ t, o, h: Math.max(hi, o, c), l: Math.min(lo, o, c), c, v: typeof q.volume?.[i] === 'number' ? q.volume[i] : 0 });
  });
  const price = m.regularMarketPrice ?? bars[bars.length - 1]?.c;
  return {
    sym,
    name: m.longName ?? m.shortName ?? sym,
    exchange: m.fullExchangeName ?? m.exchangeName ?? '',
    price,
    prev: m.previousClose ?? m.chartPreviousClose ?? bars[0]?.o ?? price,
    bars,
    intraday: /m$/.test(interval) && interval !== '1mo' && interval !== '3mo',
  };
}
