import { SAMPLE_REVIEWS } from '../data/products.js';
import { tpStars } from '../utils/money.js';
import { $, $$, byId } from '../utils/dom.js';

export function renderReviews() {
  const grid = byId('reviewsGrid');
  if (!grid) return;
  grid.innerHTML = SAMPLE_REVIEWS.map(r => {
    return `<article class="review-card">
      <div class="review-card-head"><span>${r.product}</span><span>${r.date}</span></div>
      ${tpStars(Number(r.rating) || 5)}
      <div class="review-card-badge"><svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Verified · Trustpilot</div>
      <p class="review-card-text">${r.text}</p>
      <div class="review-card-author">— ${r.initials}</div>
    </article>`;
  }).join('');
  fetch('/api/reviews').then(r => r.json()).then(data => {
    const rows = Array.isArray(data?.reviews) ? data.reviews : [];
    if (!rows.length) return;
    const extra = rows.slice(0, 6).map(r => {
      const date = r.review_date ? new Date(r.review_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase() : '';
      return `<article class="review-card">
        <div class="review-card-head"><span>${r.product || ''}</span><span>${date}</span></div>
        ${tpStars(Number(r.rating) || 5)}
        <div class="review-card-badge"><svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Verified · Trustpilot</div>
        <p class="review-card-text">${r.review_text || ''}</p>
        <div class="review-card-author">— ${r.initials || ''}</div>
      </article>`;
    }).join('');
    grid.insertAdjacentHTML('beforeend', extra);
  }).catch(() => {});
}

export function setupReviewDrawer() {
  const drawer = byId('reviewDrawer');
  const open = () => { if (drawer) { drawer.style.display = 'flex'; document.body.style.overflow = 'hidden'; } };
  const shut = () => { if (drawer) { drawer.style.display = 'none'; document.body.style.overflow = ''; } };
  byId('leaveReviewBtn')?.addEventListener('click', (e) => { e.preventDefault(); open(); });
  byId('reviewCloseBtn')?.addEventListener('click', shut);
  drawer?.addEventListener('click', (e) => { if (e.target === drawer) shut(); });
  byId('reviewSubmitBtn')?.addEventListener('click', async () => {
    const name = byId('reviewName')?.value.trim();
    const product = byId('reviewProduct')?.value;
    const rating = byId('reviewRating')?.value;
    const text = byId('reviewText')?.value.trim();
    const msg = byId('reviewMsg');
    if (!name || !product || !rating || !text) { if (msg) { msg.textContent = 'Please complete all review fields.'; msg.style.color = 'var(--danger)'; } return; }
    try {
      const res = await fetch('/api/submit-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initials: name, product, rating: Number(rating), reviewText: text, hp: '' }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { if (msg) { msg.textContent = 'Unable to submit review right now.'; msg.style.color = 'var(--danger)'; } return; }
      if (msg) { msg.textContent = 'Thanks — your review was submitted for verification.'; msg.style.color = 'var(--success)'; }
      ['reviewName', 'reviewProduct', 'reviewRating', 'reviewText'].forEach(id => { const el = byId(id); if (el) el.value = ''; });
      setTimeout(shut, 1800);
    } catch {
      if (msg) { msg.textContent = 'Network error — please try again.'; msg.style.color = 'var(--danger)'; }
    }
  });
}
