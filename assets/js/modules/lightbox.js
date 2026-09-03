import { $, byId } from '../utils/dom.js';

export function setupLightbox() {
  const bd = byId('lbBackdrop');
  const img = byId('lbImg');
  const title = byId('lbTitle');
  const body = byId('lbBody');
  const data = [
    { title: 'Janoshik report #225850', body: 'Retatrutide 20mg — batch RT20-2026-08-A — 99.607% purity with 23.20mg Retatrutide reported by Janoshik Analytical on 27 Aug 2026.' },
    { title: 'Submitted RT20 sample', body: 'The Janoshik report documents the submitted UKMAXX Retatrutide 20mg vial and connects it to batch RT20-2026-08-A, the published analytical result and report #225850.' }
  ];
  const open = (trigger) => {
    const i = Number(trigger.dataset.lb);
    const fallback = data[i] || {};
    img.src = document.querySelectorAll('.coa-tile-img img')[i]?.src || '';
    img.alt = trigger.querySelector('img')?.alt || '';
    title.textContent = trigger.dataset.lbTitle || fallback.title || '';
    body.textContent = trigger.dataset.lbBody || fallback.body || '';
    bd.classList.add('is-open');
    bd.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };
  const close = () => {
    bd.classList.remove('is-open');
    bd.setAttribute('aria-hidden', 'true');
    document.body.style.removeProperty('overflow');
  };
  document.querySelectorAll('[data-lb]').forEach(el => el.addEventListener('click', (e) => { e.preventDefault(); open(el); }));
  byId('lbClose')?.addEventListener('click', close);
  byId('lbClose2')?.addEventListener('click', close);
  bd?.addEventListener('click', (e) => { if (e.target === bd) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && bd?.classList.contains('is-open')) close(); });
}
