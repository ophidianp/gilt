// Tiny DOM helpers, sparklines and the "flash on change" effect.

type Attr = string | number | boolean | null | undefined | EventListener;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, Attr> | null = null, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  setAttrs(el, attrs);
  for (const k of kids) if (k != null && k !== false) el.append(k);
  return el;
}

const NS = 'http://www.w3.org/2000/svg';
export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, Attr> | null = null, ...kids: Child[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  setAttrs(el, attrs);
  for (const k of kids) if (k != null && k !== false) el.append(k);
  return el;
}

function setAttrs(el: Element, attrs: Record<string, Attr> | null) {
  if (!attrs) return;
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === false || v == null) continue;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

/** Sparkline points for a 100×40 viewBox. */
export function sparkPoints(vals: number[], w = 100, hgt = 40, pad = 4): string {
  if (vals.length < 2) return '';
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  return vals.map((v, i) => `${((i * w) / (vals.length - 1)).toFixed(2)},${(pad + (hgt - 2 * pad) * (1 - (v - lo) / span)).toFixed(2)}`).join(' ');
}

export function sparkSvg(cls = 'spark') {
  const line = s('polyline');
  const svg = s('svg', { class: cls, viewBox: '0 0 100 40', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, line);
  return { svg, line };
}

/** Briefly tint an element green or coral when its price moves. */
export function flash(el: Element, up: boolean) {
  el.classList.remove('flash-up', 'flash-down');
  void (el as HTMLElement).offsetWidth; // restart the animation
  el.classList.add(up ? 'flash-up' : 'flash-down');
}

export interface View { destroy(): void }

const tweens = new WeakMap<Element, { from: number; to: number; start: number; raf: number }>();
/** Counts a number up or down to `v` over ~600 ms instead of jumping (instant when motion is off). */
export function countTo(el: HTMLElement, v: number, fmt: (n: number) => string) {
  const prev = tweens.get(el);
  const shown = prev ? current(prev) : Number(el.dataset.v);
  el.dataset.v = String(v);
  if (prev) cancelAnimationFrame(prev.raf);
  if (!Number.isFinite(shown) || shown === v || document.documentElement.dataset.motion !== 'full' || document.hidden) {
    tweens.delete(el);
    el.textContent = fmt(v);
    return;
  }
  const t = { from: shown, to: v, start: performance.now(), raf: 0 };
  tweens.set(el, t);
  const step = () => {
    const k = Math.min(1, (performance.now() - t.start) / 600);
    el.textContent = fmt(k >= 1 ? v : current(t));
    if (k < 1) t.raf = requestAnimationFrame(step); else tweens.delete(el);
  };
  t.raf = requestAnimationFrame(step);
}
function current(t: { from: number; to: number; start: number }) {
  const k = Math.min(1, (performance.now() - t.start) / 600);
  return t.from + (t.to - t.from) * (1 - (1 - k) ** 3);
}

/** Gives every .seg a sliding highlight that glides to the selected option. */
export function slidingSegs() {
  const place = (seg: HTMLElement, instant = false) => {
    let thumb = seg.querySelector<HTMLElement>(':scope > .seg-thumb');
    if (!thumb) { thumb = document.createElement('span'); thumb.className = 'seg-thumb'; seg.prepend(thumb); instant = true; }
    const on = seg.querySelector<HTMLElement>(':scope > button[aria-checked="true"]');
    if (!on || !on.offsetWidth) { thumb.style.opacity = '0'; return; }
    if (instant) thumb.style.transition = 'none';
    thumb.style.opacity = '1';
    thumb.style.width = `${on.offsetWidth}px`;
    thumb.style.height = `${on.offsetHeight}px`;
    thumb.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
    if (instant) { void thumb.offsetWidth; thumb.style.transition = ''; }
    seg.classList.add('slides');
  };
  const ro = new ResizeObserver((es) => es.forEach((e) => place(e.target as HTMLElement, true)));
  const known = new WeakSet<Element>();
  const adopt = (root: ParentNode) => root.querySelectorAll<HTMLElement>('.seg').forEach((s) => {
    if (!known.has(s)) { known.add(s); ro.observe(s); }
    place(s);
  });
  new MutationObserver((muts) => {
    const segs = new Set<HTMLElement>();
    for (const m of muts) {
      if (m.type === 'attributes') { const s = (m.target as HTMLElement).closest<HTMLElement>('.seg'); if (s) segs.add(s); }
      else m.addedNodes.forEach((n) => { if (n instanceof HTMLElement) { if (n.matches('.seg')) segs.add(n); n.querySelectorAll<HTMLElement>('.seg').forEach((s) => segs.add(s)); } });
    }
    segs.forEach((s) => { if (!known.has(s)) { known.add(s); ro.observe(s); } place(s); });
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-checked'] });
  adopt(document);
}
