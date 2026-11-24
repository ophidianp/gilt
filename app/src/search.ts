// A search box with a keyboard-friendly results list. Used in the title bar and on the Practice page.
import { searchStocks, type SearchHit } from './api';
import { h } from './dom';
import { rememberName } from './store';

interface Options {
  input: HTMLInputElement;
  list: HTMLElement;
  onPick(hit: SearchHit): void;
  /** Text on the right of each result, e.g. "Add" or "Buy". Defaults to the exchange. */
  action?: () => string | null;
}

export function attachSearch({ input, list, onPick, action }: Options) {
  let hits: SearchHit[] = [];
  let active = -1;
  let seq = 0;
  let timer = 0;

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function show(children: Node[]) {
    list.replaceChildren(...children);
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function render() {
    if (!hits.length) return show([h('div', { class: 'hit-empty' }, 'No matches')]);
    const label = action?.();
    show(hits.map((hit, i) =>
      h('div', {
        id: `${list.id}-${i}`,
        class: 'hit' + (i === active ? ' active' : ''),
        role: 'option',
        'aria-selected': i === active ? 'true' : 'false',
        onmousedown: (e: Event) => e.preventDefault(), // keep focus in the input
        onclick: () => pick(i),
      },
      h('span', { class: 'hit-sym' }, hit.sym),
      h('span', { class: 'hit-name' }, hit.name),
      h('span', { class: label ? 'hit-act' : 'hit-ex' }, label ?? hit.exchange))));
    if (active >= 0) input.setAttribute('aria-activedescendant', `${list.id}-${active}`);
  }

  function pick(i: number) {
    const hit = hits[i];
    if (!hit) return;
    rememberName(hit.sym, hit.name);
    input.value = '';
    hits = [];
    close();
    onPick(hit);
  }

  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { hits = []; close(); return; }
    timer = window.setTimeout(async () => {
      const mine = ++seq;
      try {
        const found = await searchStocks(q);
        if (mine !== seq) return;
        hits = found;
        active = found.length ? 0 : -1;
        render();
      } catch {
        if (mine === seq) show([h('div', { class: 'hit-empty' }, "Search isn't reachable right now")]);
      }
    }, 180);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (!list.hidden) close(); else input.blur(); e.preventDefault(); return; }
    if (list.hidden || !hits.length) return;
    if (e.key === 'ArrowDown') { active = (active + 1) % hits.length; render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = (active - 1 + hits.length) % hits.length; render(); e.preventDefault(); }
    else if (e.key === 'Enter') { pick(active < 0 ? 0 : active); e.preventDefault(); }
  });

  input.addEventListener('blur', () => window.setTimeout(close, 120));
  input.addEventListener('focus', () => { if (hits.length && input.value.trim()) render(); });

  return { close };
}
