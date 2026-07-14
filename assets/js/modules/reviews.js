import { tpStars } from '../utils/money.js';
import { $, byId } from '../utils/dom.js';

const REVIEW_ENDPOINT = '/api/track-order';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function reviewDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase();
  } catch {
    return '';
  }
}

function reviewCard(review) {
  const rating = Math.max(1, Math.min(5, Number(review.rating || 5)));
  return `<article class="review-card">
    <div class="review-card-head"><span>${escapeHtml(review.product || 'UKMAXX')}</span><span>${escapeHtml(reviewDate(review.review_date || review.created_at))}</span></div>
    ${tpStars(rating)}
    <div class="review-card-badge"><svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Verified order</div>
    <p class="review-card-text">${escapeHtml(review.review_text)}</p>
    <div class="review-card-author">&mdash; ${escapeHtml(review.initials)}</div>
  </article>`;
}

function emptyCard(message = 'Customer feedback will appear here once fulfilled UKMAXX orders have been reviewed and approved.') {
  return `<article class="review-card review-card--empty">
    <div class="review-card-head"><span>UKMAXX feedback</span><span>Verified orders only</span></div>
    <div class="review-card-badge">
      <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
      Awaiting reviews
    </div>
    <p class="review-card-text">${escapeHtml(message)}</p>
    <div class="review-card-author">No placeholders shown</div>
  </article>`;
}

async function fetchReviews(product = '') {
  const params = new URLSearchParams({ type: 'reviews' });
  if (product) params.set('product', product);
  const res = await fetch(`${REVIEW_ENDPOINT}?${params.toString()}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.reviews) ? data.reviews : [];
}

function averageRating(rows) {
  if (!rows.length) return 0;
  const total = rows.reduce((sum, r) => sum + Number(r.rating || 0), 0);
  return total / rows.length;
}

function ratingBreakdown(rows) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  rows.forEach((r) => {
    const rating = Math.max(1, Math.min(5, Math.round(Number(r.rating || 0))));
    counts[rating] += 1;
  });
  return counts;
}

function renderBars(container, rows, variant = 'home') {
  if (!container) return;
  if (!rows.length) {
    container.innerHTML = variant === 'product'
      ? '<p class="pdp-reviews-empty">No verified reviews yet for this product.</p>'
      : `<div class="review-bar-row"><span class="review-bar-label">1</span><span class="review-bar-track"><span class="review-bar-fill" style="width:100%"></span></span><span class="review-bar-pct">Real orders only</span></div>
        <div class="review-bar-row"><span class="review-bar-label">2</span><span class="review-bar-track"><span class="review-bar-fill" style="width:100%"></span></span><span class="review-bar-pct">Approved before publishing</span></div>
        <div class="review-bar-row"><span class="review-bar-label">3</span><span class="review-bar-track"><span class="review-bar-fill" style="width:100%"></span></span><span class="review-bar-pct">No placeholders</span></div>`;
    return;
  }
  const counts = ratingBreakdown(rows);
  container.innerHTML = [5, 4, 3, 2, 1].map((rating) => {
    const count = counts[rating] || 0;
    const pct = Math.round((count / rows.length) * 100);
    if (variant === 'product') {
      return `<div class="pdp-rb-row"><span class="pdp-rb-label">${rating}</span><div class="pdp-rb-bar"><div class="pdp-rb-bar-fill" style="width:${pct}%"></div></div><span class="pdp-rb-pct">${pct}%</span></div>`;
    }
    return `<div class="review-bar-row"><span class="review-bar-label">${rating}</span><span class="review-bar-track"><span class="review-bar-fill" style="width:${pct}%"></span></span><span class="review-bar-pct">${pct}%</span></div>`;
  }).join('');
}

export async function renderReviews() {
  const grid = byId('reviewsGrid');
  if (!grid) return;

  grid.style.display = '';
  grid.innerHTML = emptyCard();

  const rows = await fetchReviews();
  const summary = $('.reviews-summary');
  if (summary) summary.style.display = '';

  if (!rows.length) {
    renderBars(byId('feedbackBars'), []);
    return;
  }

  const avg = averageRating(rows);
  const score = $('.tp-summary-score strong');
  const meta = $('.tp-summary-meta');
  if (score) score.textContent = avg.toFixed(1);
  if (meta) meta.innerHTML = `Based on <strong>${rows.length}</strong> verified order review${rows.length === 1 ? '' : 's'}.`;
  renderBars(byId('feedbackBars'), rows);
  grid.innerHTML = rows.slice(0, 6).map(reviewCard).join('');
}

export async function renderProductReviewsSummary(productId) {
  if (!productId) return;
  const rows = await fetchReviews(productId);
  const avg = averageRating(rows);
  const hasRows = rows.length > 0;

  const scoreNum = byId('pdpScoreNum');
  if (scoreNum) scoreNum.textContent = hasRows ? avg.toFixed(1) : '—';

  const scoreStars = byId('pdpScoreStars');
  if (scoreStars) {
    scoreStars.innerHTML = hasRows ? tpStars(avg).replace('review-card-stars', 'review-card-stars pdp-stars-inline') : '';
    scoreStars.style.display = hasRows ? '' : 'none';
  }

  const scoreText = byId('pdpScoreText');
  if (scoreText) scoreText.textContent = hasRows ? `${rows.length} verified review${rows.length === 1 ? '' : 's'}` : 'Verified customer feedback coming soon';

  renderBars(byId('pdpRbList'), rows, 'product');

  const list = byId('pdpReviewsList');
  if (list) {
    list.innerHTML = hasRows
      ? rows.slice(0, 4).map(reviewCard).join('')
      : '<p class="pdp-reviews-empty">No reviews yet for this product.</p>';
  }

  const ratingTop = byId('pdpRating');
  const reviewCountTop = byId('pdpReviewCount');
  if (ratingTop) ratingTop.textContent = hasRows ? avg.toFixed(1) : '0.0';
  if (reviewCountTop) reviewCountTop.textContent = hasRows ? `${rows.length} review${rows.length === 1 ? '' : 's'}` : 'Awaiting verified reviews';
}

export function setupReviewDrawer() {
  const drawer = byId('reviewDrawer');
  if (!drawer) return;

  const open = (product = '') => {
    const productField = byId('reviewProduct');
    if (productField && product) productField.value = product;
    drawer.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };
  const shut = () => {
    drawer.style.display = 'none';
    document.body.style.overflow = '';
  };

  byId('leaveReviewBtn')?.addEventListener('click', (e) => { e.preventDefault(); open(); });
  byId('feedbackInviteLink')?.addEventListener('click', (e) => { e.preventDefault(); open(); });
  document.querySelectorAll('.js-open-review, .btn-write').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const sku = new URLSearchParams(location.search).get('sku') || btn.getAttribute('data-review-product') || '';
      open(sku);
    });
  });
  byId('reviewCloseBtn')?.addEventListener('click', shut);
  drawer.addEventListener('click', (e) => { if (e.target === drawer) shut(); });

  const params = new URLSearchParams(location.search);
  if (params.get('review') === '1') {
    const orderField = byId('reviewOrderNumber');
    if (orderField && params.get('order')) orderField.value = params.get('order');
    setTimeout(() => open(params.get('product') || ''), 250);
  }

  byId('reviewSubmitBtn')?.addEventListener('click', async () => {
    const reviewerName = byId('reviewFullName')?.value.trim();
    const initials = byId('reviewName')?.value.trim();
    const orderNumber = byId('reviewOrderNumber')?.value.trim();
    const email = byId('reviewEmail')?.value.trim();
    const product = byId('reviewProduct')?.value;
    const rating = byId('reviewRating')?.value;
    const reviewText = byId('reviewText')?.value.trim();
    const msg = byId('reviewMsg');

    if (!reviewerName || !initials || !orderNumber || !email || !product || !rating || !reviewText) {
      if (msg) { msg.textContent = 'Please complete all review fields.'; msg.style.color = 'var(--danger)'; }
      return;
    }

    const btn = byId('reviewSubmitBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }
    try {
      const res = await fetch(REVIEW_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'submit-review',
          reviewerName,
          initials,
          orderNumber,
          email,
          product,
          rating: Number(rating),
          reviewText,
          hp: '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const messages = {
          order_not_found: 'We could not match that order number and email.',
          order_not_delivered: 'Reviews open once the order has been marked delivered.',
          product_not_in_order: 'Please select a product from that order.',
          review_too_short: 'Please add a little more detail to your review.',
        };
        if (msg) {
          msg.textContent = messages[data.error] || 'Unable to submit review right now.';
          msg.style.color = 'var(--danger)';
        }
        return;
      }
      if (msg) { msg.textContent = 'Thanks — your review was submitted for approval.'; msg.style.color = 'var(--success)'; }
      ['reviewFullName', 'reviewName', 'reviewOrderNumber', 'reviewEmail', 'reviewProduct', 'reviewRating', 'reviewText'].forEach((id) => {
        const el = byId(id);
        if (el) el.value = '';
      });
      setTimeout(shut, 1800);
    } catch {
      if (msg) { msg.textContent = 'Network error — please try again.'; msg.style.color = 'var(--danger)'; }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Submit review'; }
    }
  });
}
