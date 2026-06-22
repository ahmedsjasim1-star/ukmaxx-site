import { toast } from './toast.js';
import { byId } from '../utils/dom.js';

export function setupNewsletter() {
  byId('newsletterForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = byId('newsletterEmail')?.value.trim();
    if (!email) return;
    try {
      const res = await fetch('/api/subscribe-newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, hp: '' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && !data.ok) {
        toast('Try again', 'Unable to subscribe right now.', 'error');
        return;
      }
      toast('Subscribed!', 'Thanks for signing up — check your inbox.');
      if (byId('newsletterEmail')) byId('newsletterEmail').value = '';
    } catch {
      toast('Try again', 'Network error — please try again later.', 'error');
    }
  });
}
