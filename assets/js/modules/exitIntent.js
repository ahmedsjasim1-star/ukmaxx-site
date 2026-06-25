import { EXIT_KEY } from '../data/products.js';
import { toast } from './toast.js';
import { byId } from '../utils/dom.js';
import { getRaw, setRaw } from '../utils/storage.js';

export function setupExitIntent() {
  const backdrop = byId('exitBackdrop');
  const form = byId('exitForm');
  if (!backdrop || !form) return;
  if (getRaw(EXIT_KEY)) return;

  let shown = false;
  const show = () => {
    if (shown) return;
    shown = true;
    backdrop.classList.add('is-open');
    backdrop.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  const close = () => {
    backdrop.classList.remove('is-open');
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setRaw(EXIT_KEY, '1');
  };

  byId('exitClose')?.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  document.addEventListener('mouseout', (e) => { if (e.clientY <= 0 && !shown) show(); });

  const dwellTimer = setTimeout(() => { if (!shown) show(); }, 30000);
  document.addEventListener('scroll', () => {
    const atBottom = (window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200;
    if (atBottom && !shown) { clearTimeout(dwellTimer); show(); }
  }, { passive: true });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = byId('exitEmail')?.value.trim();
    if (!email) return;
    try {
      const res = await fetch('/api/subscribe-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, topics: ['restock', 'batch_updates'], hp: '' })
      });
      if (!res.ok) throw new Error('subscribe_failed');
      toast('You’re on the list', 'We’ll email important restock and batch-release updates.');
      close();
    } catch {
      toast('Try again', 'Unable to subscribe. Please try again later.', 'error');
    }
  });
}
