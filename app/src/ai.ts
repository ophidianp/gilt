// "Ask Claude" in the chart viewer: sends the bars on screen and the local analysis to Claude
// with the user's own Anthropic API key (Settings → AI), and gets back a short read of the chart
// plus notes to pin on it. Nothing is sent unless the user presses the button.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';
import type { Bar } from './api';
import type { Forecast, Note } from './outlook';
import { settings } from './settings';

const Analysis = z.object({
  summary: z.string().describe('Two or three plain sentences on what the chart shows right now.'),
  outlook: z.enum(['bullish', 'bearish', 'neutral']),
  confidence: z.enum(['low', 'medium', 'high']),
  horizon: z.string().describe('The time span the outlook covers, e.g. "next 2 weeks".'),
  target_low: z.number().describe('Low end of the likely price range at the end of the horizon.'),
  target_high: z.number().describe('High end of the likely price range at the end of the horizon.'),
  points: z.array(z.string()).describe('Three to five short observations backing the outlook.'),
  risks: z.array(z.string()).describe('One to three things that would prove the outlook wrong.'),
  annotations: z.array(z.object({
    time: z.number().describe('Unix time in seconds of one of the bars given (copy it exactly).'),
    price: z.number(),
    label: z.string().describe('At most five words, shown on the chart.'),
    kind: z.enum(['support', 'resistance', 'pattern', 'breakout', 'event', 'note']),
  })).describe('Two to six notes to pin on the chart.'),
});
export type Analysis = z.infer<typeof Analysis>;

const SYSTEM = `You read stock charts inside gilt, a paper-trading app where people practise with pretend money.
Work only from the price bars and statistics you are given; you have no news or fundamentals, so say so if it matters.
Be candid about uncertainty: most short-term moves are noise, and a neutral outlook with low confidence is often the honest answer.
Write for a beginner: plain words, no hype, no instructions to buy or sell. This is education, not financial advice.
Pin annotations on bars from the data (use their exact times) at meaningful prices: levels, patterns, breakouts or notable bars.`;

export interface AskInput {
  sym: string;
  name: string;
  rangeLabel: string;
  interval: string;
  bars: Bar[];
  forecast: Forecast | null;
  notes: Note[];
  stamp: (t: number) => string;
}

/** Keeps the request small: at most `max` bars, merged evenly (OHLC and volume combined correctly). */
function thin(bars: Bar[], max = 160): Bar[] {
  if (bars.length <= max) return bars;
  const step = bars.length / max;
  const out: Bar[] = [];
  for (let k = 0; k < max; k++) {
    const a = Math.floor(k * step), b = Math.max(a + 1, Math.floor((k + 1) * step));
    const g = bars.slice(a, b);
    out.push({ t: g[0].t, o: g[0].o, c: g[g.length - 1].c, h: Math.max(...g.map((x) => x.h)), l: Math.min(...g.map((x) => x.l)), v: g.reduce((s, x) => s + x.v, 0) });
  }
  return out;
}

const r = (v: number) => (v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(3) : v.toPrecision(4));

export async function askClaude(input: AskInput, signal?: AbortSignal): Promise<Analysis> {
  const { apiKey, model } = settings.get();
  if (!apiKey) throw new Error('Add your Anthropic API key in Settings → AI first.');
  // A desktop app calling the API with the user's own key, typed in on this computer.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });

  const bars = thin(input.bars);
  const table = bars.map((b) => `${b.t},${input.stamp(b.t)},${r(b.o)},${r(b.h)},${r(b.l)},${r(b.c)},${Math.round(b.v)}`).join('\n');
  const f = input.forecast;
  const stats = [
    `Last price: ${r(input.bars[input.bars.length - 1].c)}`,
    f && `Local statistical forecast, ${f.horizon} bars ahead: middle ${r(f.mid[f.horizon - 1])}, 50% range ${r(f.in50[f.horizon - 1][0])}–${r(f.in50[f.horizon - 1][1])}, 90% range ${r(f.in90[f.horizon - 1][0])}–${r(f.in90[f.horizon - 1][1])}, chance higher ${(f.pUp * 100).toFixed(0)}%, typical move per bar ${(f.vol * 100).toFixed(2)}%.`,
    input.notes.length && `Automatic notes: ${input.notes.map((n) => `${n.label} at ${r(n.price)} (${input.stamp(input.bars[n.i].t)})`).join('; ')}.`,
  ].filter(Boolean).join('\n');

  const prompt = `${input.sym} (${input.name}), ${input.rangeLabel}, ${input.interval} bars${bars.length < input.bars.length ? ` (merged down to ${bars.length})` : ''}.

Bars (unix_time,date,open,high,low,close,volume):
${table}

${stats}

Read this chart and give your outlook for roughly the next ${f ? `${f.horizon} bars` : 'stretch of similar length'}.`;

  const params = {
    model,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: 'user' as const, content: prompt }],
    output_config: { format: betaZodOutputFormat(Analysis) },
  };
  // Opus and Sonnet can hand a declined request to another model server-side; Haiku has no fallback.
  const res = model === 'claude-haiku-5-5'
    ? await client.beta.messages.parse(params, { signal })
    : await client.beta.messages.parse({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, { signal });

  if (res.stop_reason === 'refusal') throw new Error("Claude declined to analyse this chart. Try again or pick another model in Settings.");
  if (res.stop_reason === 'max_tokens') throw new Error('The answer was cut off. Try again.');
  if (!res.parsed_output) throw new Error("Claude's answer couldn't be read. Try again.");
  return res.parsed_output;
}

/** A plain-English message for an API failure. */
export function aiError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'Your API key was not accepted. Check it in Settings → AI.';
  if (e instanceof Anthropic.PermissionDeniedError) return "Your API key can't use this model. Pick another in Settings → AI.";
  if (e instanceof Anthropic.RateLimitError) return 'Too many requests right now. Wait a moment and try again.';
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach Anthropic. Check your internet connection.";
  if (e instanceof Anthropic.APIError) return `Anthropic returned an error (${e.status ?? 'unknown'}). Try again shortly.`;
  return e instanceof Error ? e.message : String(e);
}

/** Checks a key with the smallest possible request. */
export async function testKey(apiKey: string): Promise<string> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 0 });
  await client.models.retrieve(settings.get().model);
  return 'Key works.';
}
