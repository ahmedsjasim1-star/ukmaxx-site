import { byId } from '../utils/dom.js';

function renderFeedbackEmptyState() {
  const grid = byId('reviewsGrid');
  if (!grid) return;

  grid.innerHTML = `
    <article class="review-card review-card--empty">
      <div class="review-card-head"><span>UKMAXX feedback</span><span>Verified orders only</span></div>
      <div class="review-card-badge">
        <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        No placeholder reviews
      </div>
      <p class="review-card-text">Customer feedback will appear here once it is connected to fulfilled UKMAXX orders.</p>
      <div class="review-card-author">Real feedback only</div>
    </article>`;
}

export function renderReviews() {
  renderFeedbackEmptyState();
}
