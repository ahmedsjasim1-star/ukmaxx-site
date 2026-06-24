import { $, byId } from '../utils/dom.js';

export function setupLightbox() {
  const bd = byId('lbBackdrop');
  const img = byId('lbImg');
  const title = byId('lbTitle');
  const body = byId('lbBody');
  const data = [
    { title: 'Janoshik report #193587', body: 'Retatrutide 10mg — Batch RT10-2026-06-A — 99.223% purity confirmed via UPLC/MS GLP-1 blind test on 22 Jun 2026. Verify at verify.janoshik.com/tests/193587-RT10_I8UPPV43CJ42' },
    { title: 'Batch code traceability', body: 'UKMAXX batch codes are matched against the published COA record where available. Products awaiting documentation are marked as pending until the matching lab result is ready.' }
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
