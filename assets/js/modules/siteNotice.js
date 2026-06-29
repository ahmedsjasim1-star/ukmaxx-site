import { COOKIE_KEY } from '../data/products.js';
import { byId } from '../utils/dom.js';
import { getRaw, setRaw } from '../utils/storage.js';

export function setupCookieBanner() {
  if (getRaw(COOKIE_KEY)) return;
  const b = byId('cookieBanner');
  if (!b) return;
  setTimeout(() => b.classList.add('is-shown'), 1500);
  const close = val => { setRaw(COOKIE_KEY, val); b.classList.remove('is-shown'); };
  byId('cookieAccept')?.addEventListener('click', () => close('accepted'));
  byId('cookieReject')?.addEventListener('click', () => close('rejected'));
}
