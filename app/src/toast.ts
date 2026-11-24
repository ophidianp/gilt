// Small notes in the bottom-right corner (an order filled, a setting was reset), and the fill chime.
import { account } from './account';
import { h } from './dom';
import { shares, usd } from './fmt';
import { settings } from './settings';

let stack: HTMLElement | null = null;

export function toast(text: string, tone: '' | 'up' | 'down' = '', sub = '') {
  if (!stack) { stack = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(stack); }
  const el = h('div', { class: `toast ${tone}` }, h('span', { class: 'toast-dot' }), h('div', null, h('b', null, text), sub ? h('small', null, sub) : ''));
  const dismiss = () => {
    if (!el.isConnected || el.classList.contains('out')) return;
    el.classList.add('out');
    window.setTimeout(() => el.remove(), 260);
  };
  el.addEventListener('click', dismiss);
  stack.append(el);
  while (stack.children.length > 4) stack.firstElementChild?.remove();
  window.setTimeout(dismiss, 4500);
}

let audio: AudioContext | null = null;
/** Two soft notes. `force` plays it even when the setting is off (the Play button in Settings). */
export function chime(force = false) {
  if (!force && !settings.get().fillSound) return;
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    [659.25, 987.77].forEach((f, k) => {
      const o = audio!.createOscillator(), g = audio!.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + k * 0.09);
      g.gain.linearRampToValueAtTime(0.12, t + k * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + k * 0.09 + 0.6);
      o.connect(g).connect(audio!.destination);
      o.start(t + k * 0.09); o.stop(t + k * 0.09 + 0.65);
    });
  } catch { /* no audio device */ }
}

/** Watches the account and announces every order that fills or is rejected. */
export function watchFills() {
  const seen = new Map<number, string>();
  const scan = (announce: boolean) => {
    for (const o of account.get()?.orders ?? []) {
      const was = seen.get(o.id);
      seen.set(o.id, o.status);
      if (!announce || was === o.status || o.status === 'open' || o.status === 'cancelled') continue;
      if (!settings.get().fillToasts && !settings.get().fillSound) continue;
      if (o.status === 'filled') {
        if (settings.get().fillToasts) toast(`${o.side === 'buy' ? 'Bought' : 'Sold'} ${shares(o.qty)} ${o.sym} at ${usd(o.fill!)}`, o.side === 'buy' ? 'up' : 'down',
          o.pnl != null ? `${usd(o.pnl, true)} profit/loss${o.fee ? ` · ${usd(o.fee)} commission` : ''}` : `${usd(o.qty * o.fill! + (o.fee ?? 0))} total${o.fee ? ` incl. ${usd(o.fee)} commission` : ''}`);
        chime();
      } else if (o.status === 'rejected' && settings.get().fillToasts) {
        toast(`${o.side === 'buy' ? 'Buy' : 'Sell'} ${o.sym} rejected`, 'down', o.note ?? '');
      }
    }
  };
  scan(false);
  account.onChange(() => scan(true));
}
