import { $, byId } from '../utils/dom.js';

export function setupLightbox() {
  const bd = byId('lbBackdrop');
  const img = byId('lbImg');
  const title = byId('lbTitle');
  const body = byId('lbBody');
  const data = [
    { title: 'Tamper seal integrity', body: 'Each vial ships with a tamper-evident security seal applied before dispatch. If the seal is broken, missing, or shows signs of interference on arrival, do not use the product. Contact us immediately for a replacement.' },
    { title: 'Batch code traceability', body: 'Every UKMAXX vial carries a unique batch QR code printed on the label. Scanning the code takes you directly to the third-party COA results for that specific batch — confirming compound identity, purity percentage, test method, lab name, and report date.' }
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
