// The little live / closed / offline indicator in the title bar.
import { clock, marketOpen, nyFormat } from './fmt';

function set(state: 'live' | 'closed' | 'error', text: string) {
  const el = document.getElementById('status');
  const label = document.getElementById('status-text');
  if (!el || !label) return;
  el.dataset.state = state;
  label.textContent = text;
}

export const status = {
  /** `t` is the unix time (seconds) of the newest price, when known. */
  ok(t: number) {
    if (marketOpen()) set('live', `Live · ${clock()}`);
    else set('closed', t ? `Market closed · ${nyFormat(t, { weekday: 'short', hour: 'numeric', minute: '2-digit' })} ET` : 'Market closed');
  },
  fail(e: unknown) {
    console.warn('gilt: refresh failed', e);
    set('error', 'Offline · retrying');
  },
};
