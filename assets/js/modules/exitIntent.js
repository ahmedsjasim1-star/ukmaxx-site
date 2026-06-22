import { EXIT_KEY } from '../data/products.js';
import { toast } from './toast.js';
import { $, byId } from '../utils/dom.js';
import { getRaw, setRaw } from '../utils/storage.js';

export function setupExitIntent() {
  if (getRaw(EXIT_KEY)) return;
  let shown = false;
  const show = () => {
    if (shown) return;
    shown = true;
    byId('exitBackdrop').classList.add('is-open');
    byId('exitBackdrop').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };
  const close = () => {
    byId('exitBackdrop').classList.remove('is-open');
    byId('exitBackdrop').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setRaw(EXIT_KEY, '1');
  };
  byId('exitClose')?.addEventListener('click', close);
  byId('exitBackdrop')?.addEventListener('click', (e) => { if (e.target === byId('exitBackdrop')) close(); });

  document.addEventListener('mouseout', (e) => { if (e.clientY <= 0 && !shown) show(); });

  let dwellTimer = setTimeout(() => { if (!shown) show(); }, 30000);
  document.addEventListener('scroll', () => {
    const atBottom = (window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200;
    if (atBottom && !shown) { clearTimeout(dwellTimer); show(); }
  }, { passive: true });

  byId('exitForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const em = byId('exitEmail').value.trim();
    if (!em) return;
    try {
      await fetch('/api/subscribe-notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: em, topics: ['restock', 'batch_updates', 'promo'], hp: '' }) });
      toast('Code sent!', 'Check your inbox for WELCOME10 — valid for 14 days.');
      close();
    } catch {
      toast('Try again', 'Unable to subscribe. Please try again later.', 'error');
    }
  });
}
