export const money = n => '£' + Number(n).toFixed(2);
export const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);

export function tpStars(rating) {
  const full = Math.floor(rating);
  const half = (rating - full) >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  let html = '<div class="review-card-stars" aria-label="' + rating + ' out of 5">';
  for (let i = 0; i < full; i++) html += '<i></i>';
  if (half) html += '<i class="tp-half"></i>';
  for (let i = 0; i < empty; i++) html += '<i class="empty"></i>';
  html += '</div>';
  return html;
}
