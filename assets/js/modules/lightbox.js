import { $, byId } from '../utils/dom.js';

export function setupLightbox() {
  const bd = byId('lbBackdrop');
  const img = byId('lbImg');
  const title = byId('lbTitle');
  const body = byId('lbBody');
  const data = [
    { title: 'Janoshik report #208700', body: 'GHK-Cu 50mg — Batch GHK-2026-05-A — 99.799% purity with 46.68mg GHK-Cu reported by Janoshik Analytical on 28 Jul 2026. Verify at verify.janoshik.com/tests/208700-GHKCu_50mg_ENTH4P5LPBYX' },
    { title: 'Tested GHK-Cu sample', body: 'The Janoshik report documents the submitted UKMAXX GHK-Cu 50mg vial and connects it to batch GHK-2026-05-A, the published analytical result, and the original laboratory verification record.' }
  ];
  const open = (i) => {
    img.src = document.querySelectorAll('.coa-tile-img img')[i]?.src || '';
    title.textContent = data[i].title;
    body.textContent = data[i].body;
    bd.classList.add('is-open');
  };
  const close = () => bd.classList.remove('is-open');
  document.querySelectorAll('[data-lb]').forEach(el => el.addEventListener('click', (e) => { e.preventDefault(); open(Number(el.dataset.lb)); }));
  byId('lbClose')?.addEventListener('click', close);
  byId('lbClose2')?.addEventListener('click', close);
  bd?.addEventListener('click', (e) => { if (e.target === bd) close(); });
}
