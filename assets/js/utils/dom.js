export const $ = (sel, ctx) => (ctx || document).querySelector(sel);
export const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];
export const byId = id => document.getElementById(id);

export function on(els, event, handler) {
  (Array.isArray(els) ? els : [els]).forEach(el => {
    if (el) el.addEventListener(event, handler);
  });
}

export function delegate(root, sel, event, handler) {
  const r = typeof root === 'string' ? byId(root) : root;
  if (r) r.addEventListener(event, e => {
    const target = e.target.closest(sel);
    if (target) handler(e, target);
  });
}
