import { TRUSTPILOT } from '../data/trustpilot.js';
import { tpStars } from '../utils/money.js';
import { byId } from '../utils/dom.js';

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

function renderRatingBars() {
  const bars = byId('trustpilotBars');
  if (!bars) return;

  if (!TRUSTPILOT.reviewCount) {
    bars.innerHTML = `
      <div class="review-bar-row"><span class="review-bar-label">Status</span><span class="review-bar-track"><span class="review-bar-fill" style="width:100%"></span></span><span class="review-bar-pct">Awaiting real reviews</span></div>
      <div class="review-bar-row"><span class="review-bar-label">Source</span><span class="review-bar-track"><span class="review-bar-fill" style="width:100%"></span></span><span class="review-bar-pct">Trustpilot only</span></div>
      <div class="review-bar-row"><span class="review-bar-label">Policy</span><span class="review-bar-track"><span class="review-bar-fill" style="width:100%"></span></span><span class="review-bar-pct">No placeholders</span></div>
    `;
    return;
  }

  const distribution = TRUSTPILOT.distribution || {};
  bars.innerHTML = [5, 4, 3, 2, 1].map(stars => {
    const pct = Math.max(0, Math.min(100, Number(distribution[stars] || 0)));
    return `<div class="review-bar-row"><span class="review-bar-label">${stars}</span><span class="review-bar-track"><span class="review-bar-fill" style="width:${pct}%"></span></span><span class="review-bar-pct">${pct}%</span></div>`;
  }).join('');
}

function renderTrustpilotCards() {
  const grid = byId('reviewsGrid');
  if (!grid) return;

  const reviews = Array.isArray(TRUSTPILOT.reviews) ? TRUSTPILOT.reviews : [];
  if (!reviews.length) {
    grid.innerHTML = '<article class="review-card"><div class="review-card-head"><span>Trustpilot</span><span>Coming soon</span></div><p class="review-card-text">Real Trustpilot reviews will appear here after the UKMAXX Trustpilot business profile is live and genuine customer reviews are available.</p><div class="review-card-author">No onsite or placeholder reviews shown</div></article>';
    return;
  }

  grid.innerHTML = reviews.slice(0, 6).map(r => {
    return `<article class="review-card">
      <div class="review-card-head"><span>${r.product || 'UKMAXX'}</span><span>${r.date || ''}</span></div>
      ${tpStars(Number(r.rating) || 5)}
      <div class="review-card-badge"><svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Trustpilot</div>
      <p class="review-card-text">${r.text || ''}</p>
      <div class="review-card-author">— ${r.initials || 'Verified reviewer'}</div>
    </article>`;
  }).join('');
}

export function renderReviews() {
  const hasRating = Number(TRUSTPILOT.rating) > 0 && Number(TRUSTPILOT.reviewCount) > 0;
  setText('trustpilotBadge', hasRating ? (TRUSTPILOT.label || 'Trustpilot') : 'Trustpilot coming soon');
  setText('trustpilotScore', hasRating ? Number(TRUSTPILOT.rating).toFixed(1) : '—');
  setText('trustpilotScoreSuffix', hasRating ? '/ 5' : '');
  setFirst('.tp-summary-score strong', hasRating ? Number(TRUSTPILOT.rating).toFixed(1) : '—');
  setFirst('.tp-summary-score span', hasRating ? '/ 5' : '');
  setFirst(
    '.tp-summary-meta',
    hasRating
      ? `Based on ${Number(TRUSTPILOT.reviewCount).toLocaleString('en-GB')} real Trustpilot reviews`
      : 'Create and verify the UKMAXX Trustpilot profile, then add the real score here.'
  );
  setText(
    'trustpilotMeta',
    hasRating
      ? `Based on ${Number(TRUSTPILOT.reviewCount).toLocaleString('en-GB')} real Trustpilot reviews`
      : 'Create and verify the UKMAXX Trustpilot profile, then add the real score here.'
  );

  const stars = byId('trustpilotStars');
  if (stars) {
    stars.setAttribute('aria-label', hasRating ? `${Number(TRUSTPILOT.rating).toFixed(1)} out of 5 stars` : 'No Trustpilot rating yet');
    stars.style.display = hasRating ? '' : 'none';
  }

  setHref('trustpilotProfileLink', TRUSTPILOT.profileUrl);
  setHref('trustpilotReviewLink', TRUSTPILOT.reviewUrl);
  setHref('trustpilotInviteLink', TRUSTPILOT.reviewUrl);
  setHref('trustpilotAllReviewsLink', TRUSTPILOT.profileUrl);

  renderRatingBars();
  renderTrustpilotCards();
}
