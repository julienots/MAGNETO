type Child = Node | string | number | null | undefined | false | Child[];
export interface Props { [k: string]: any }

/** Tiny hyperscript: h('div.panel#id', {onclick}, children) */
export function h(sel: string, props: Props | Child = {}, ...children: Child[]): HTMLElement {
  if (props === null || typeof props !== 'object' || props instanceof Node || Array.isArray(props)) { children.unshift(props as Child); props = {}; }
  const m = sel.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
  const tag = m?.[1] || 'div';
  const el = document.createElement(tag);
  for (const part of (m?.[2] ?? '').match(/[.#][\w-]+/g) ?? []) {
    if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1);
  }
  for (const [k, v] of Object.entries(props as Props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'class') el.className += ' ' + v;
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}
function append(el: HTMLElement, c: Child) {
  if (c === null || c === undefined || c === false) return;
  if (Array.isArray(c)) { c.forEach((x) => append(el, x)); return; }
  el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
}
export const clear = (el: HTMLElement) => { while (el.firstChild) el.firstChild.remove(); return el; };
export const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
