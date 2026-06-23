import { TRUSTPILOT } from '../data/trustpilot.js';
import { tpStars } from '../utils/money.js';
import { byId } from '../utils/dom.js';

let trustpilotState = { ...TRUSTPILOT };

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function setText(id, value) {
  const el = byId(id);
  if (el) el.textContent = value;
}

function setHref(id, value) {
  const el = byId(id);
  if (el && value) el.setAttribute('href', value);
}

function setFirst(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.textContent = value;
}

function setSummaryScore(ratingReady, rating) {
  const el = document.querySelector('.tp-summary-score');
  if (!el) return;
  el.innerHTML = ratingReady ? `<strong>${rating.toFixed(1)}</strong> <span>/ 5</span>` : '<strong>—</strong>';
}

function hasRating() {
  return Number(trustpilotState.rating) > 0 && Number(trustpilotState.reviewCount) > 0;
}

function renderRatingBars() {
  const bars = byId('trustpilotBars');
  if (!bars) return;

  if (!hasRating()) {
    bars.innerHTML = `
      <div class="review-bar-row"><span class="review-bar-label">5</span><span class="review-bar-track"><span class="review-bar-fill" style="width:0%"></span></span><span class="review-bar-pct">Awaiting</span></div>
      <div class="review-bar-row"><span class="review-bar-label">4</span><span class="review-bar-track"><span class="review-bar-fill" style="width:0%"></span></span><span class="review-bar-pct">real</span></div>
      <div class="review-bar-row"><span class="review-bar-label">3</span><span class="review-bar-track"><span class="review-bar-fill" style="width:0%"></span></span><span class="review-bar-pct">Trustpilot</span></div>
      <div class="review-bar-row"><span class="review-bar-label">2</span><span class="review-bar-track"><span class="review-bar-fill" style="width:0%"></span></span><span class="review-bar-pct">reviews</span></div>
      <div class="review-bar-row"><span class="review-bar-label">1</span><span class="review-bar-track"><span class="review-bar-fill" style="width:0%"></span></span><span class="review-bar-pct">only</span></div>
    `;
    return;
  }

  const distribution = trustpilotState.distribution || {};
  bars.innerHTML = [5, 4, 3, 2, 1].map(stars => {
    const pct = Math.max(0, Math.min(100, Number(distribution[stars] || 0)));
    return `<div class="review-bar-row"><span class="review-bar-label">${stars}</span><span class="review-bar-track"><span class="review-bar-fill" style="width:${pct}%"></span></span><span class="review-bar-pct">${pct}%</span></div>`;
  }).join('');
}

function renderTrustpilotCards() {
  const grid = byId('reviewsGrid');
  if (!grid) return;

  const reviews = Array.isArray(trustpilotState.reviews) ? trustpilotState.reviews : [];
  if (!reviews.length) {
    grid.innerHTML = `
      <article class="review-card review-card--empty">
        <div class="review-card-head"><span>Trustpilot</span><span>Coming soon</span></div>
        <div class="review-card-badge"><svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Real reviews only</div>
        <p class="review-card-text">Genuine Trustpilot reviews will appear here once the UKMAXX business profile is live and customers have left public feedback.</p>
        <div class="review-card-author">No placeholder reviews shown</div>
      </article>`;
    return;
  }

  grid.innerHTML = reviews.slice(0, 6).map(r => {
    const title = r.title ? `<strong>${escapeHtml(r.title)}</strong><br>` : '';
    return `<article class="review-card">
      <div class="review-card-head"><span>${escapeHtml(r.product || 'UKMAXX')}</span><span>${formatDate(r.date)}</span></div>
      ${tpStars(Number(r.rating) || 5)}
      <div class="review-card-badge"><svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> ${r.verified ? 'Verified · ' : ''}Trustpilot</div>
      <p class="review-card-text">${title}${escapeHtml(r.text || '')}</p>
      <div class="review-card-author">— ${escapeHtml(r.initials || 'Verified reviewer')}</div>
    </article>`;
  }).join('');
}

function renderTrustpilotSummary() {
  const ratingReady = hasRating();
  const rating = Number(trustpilotState.rating || 0);
  const reviewCount = Number(trustpilotState.reviewCount || 0);

  setText('trustpilotBadge', ratingReady ? (trustpilotState.label || 'Trustpilot') : 'Trustpilot pending');
  setText('trustpilotScore', ratingReady ? rating.toFixed(1) : '—');
  setText('trustpilotScoreSuffix', ratingReady ? '/ 5' : '');
  setSummaryScore(ratingReady, rating);
  setFirst(
    '.tp-summary-meta',
    ratingReady
      ? `Based on ${reviewCount.toLocaleString('en-GB')} real Trustpilot reviews`
      : 'Create and verify the UKMAXX Trustpilot profile to activate live review data.'
  );
  setText(
    'trustpilotMeta',
    ratingReady
      ? `Based on ${reviewCount.toLocaleString('en-GB')} real Trustpilot reviews`
      : 'Create and verify the UKMAXX Trustpilot profile to activate live review data.'
  );

  const stars = byId('trustpilotStars');
  if (stars) {
    stars.setAttribute('aria-label', ratingReady ? `${rating.toFixed(1)} out of 5 stars` : 'No Trustpilot rating yet');
    stars.style.display = ratingReady ? '' : 'none';
  }

  const allReviewsLink = byId('trustpilotAllReviewsLink');
  if (allReviewsLink) allReviewsLink.textContent = ratingReady ? `See all ${reviewCount.toLocaleString('en-GB')} reviews` : 'View Trustpilot profile';

  setHref('trustpilotProfileLink', trustpilotState.profileUrl);
  setHref('trustpilotLogoLink', trustpilotState.profileUrl);
  setHref('trustpilotReviewLink', trustpilotState.reviewUrl);
  setHref('trustpilotInviteLink', trustpilotState.reviewUrl);
  setHref('trustpilotAllReviewsLink', trustpilotState.profileUrl);
}

async function loadTrustpilot() {
  if (!TRUSTPILOT.apiUrl) return;
  try {
    const res = await fetch(TRUSTPILOT.apiUrl, { headers: { Accept: 'application/json' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.configured) return;
    trustpilotState = {
      ...trustpilotState,
      ...data,
      reviews: Array.isArray(data.reviews) ? data.reviews : trustpilotState.reviews,
    };
    renderTrustpilotSummary();
    renderRatingBars();
    renderTrustpilotCards();
  } catch {
    // Keep the honest fallback content if Trustpilot is unavailable.
  }
}

export function renderReviews() {
  renderTrustpilotSummary();
  renderRatingBars();
  renderTrustpilotCards();
  loadTrustpilot();
}
