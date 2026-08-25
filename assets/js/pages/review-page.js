import { trackEvent } from '../modules/analytics.js?v=20260824-verified-review-photos';

const endpoint = '/api/track-order';
const byId = (id) => document.getElementById(id);
const state = { verified: null, images: [], rating: 0 };

function setMessage(element, text = '', type = '') {
  if (!element) return;
  element.textContent = text;
  element.className = `review-message${type ? ` is-${type}` : ''}`;
}

function errorMessage(code) {
  return {
    invalid_order_details: 'Enter a valid order number and order email.',
    order_not_found: 'We could not match that order number and email.',
    order_not_delivered: 'Reviews open once the order has been marked delivered.',
    product_not_in_order: 'Please choose a product from this delivered order.',
    review_too_short: 'Please add a little more detail to your review.',
    review_already_exists: 'A review for this product and order has already been submitted.',
    order_reviews_complete: 'Every product from this order already has a review submitted.',
    invalid_review_image: 'One of those files is not a supported image.',
    review_image_too_large: 'One image is still too large after processing. Please choose another.',
    review_image_upload_failed: 'We could not upload the images. Please try again or submit without them.',
  }[code] || 'Something went wrong. Please try again.';
}

function setVerifying(isBusy) {
  const button = byId('reviewVerifyBtn');
  if (!button) return;
  button.disabled = isBusy;
  button.textContent = isBusy ? 'Checking order...' : 'Verify delivered order';
}

function uniqueProducts(products) {
  const unique = [];
  const seen = new Set();
  products.forEach((product) => {
    if (!product.sku || seen.has(product.sku)) return;
    seen.add(product.sku);
    unique.push(product);
  });
  return unique;
}

function renderProductChoices(products) {
  const container = byId('reviewProductChoices');
  if (!container) return;
  const requested = new URLSearchParams(location.search).get('product')?.toUpperCase() || '';
  const unique = uniqueProducts(products);
  container.innerHTML = unique.map((product, index) => `
    <label class="review-product-choice">
      <input type="radio" name="reviewProduct" value="${product.sku}" ${(requested === product.sku || (!requested && unique.length === 1 && index === 0)) ? 'checked' : ''}>
      <strong>${product.name}</strong>
      <small>${product.sku}${product.qty > 1 ? ` · Qty ${product.qty}` : ''}</small>
    </label>`).join('');
}

async function verifyOrder() {
  const orderNumber = byId('reviewOrderNumber')?.value.trim();
  const email = byId('reviewEmail')?.value.trim();
  const message = byId('reviewVerifyMsg');
  if (!orderNumber || !email) return setMessage(message, 'Enter your order number and order email.', 'error');

  setVerifying(true);
  setMessage(message, '');
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'review-order-options', orderNumber, email }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) return setMessage(message, errorMessage(data.error), 'error');

    const products = uniqueProducts(data.products || []);
    state.verified = { orderNumber: data.orderNumber, email, identity: data.identity, products };
    renderProductChoices(products);
    byId('reviewInitialsPreview').textContent = data.identity?.initials || 'Initials';
    byId('reviewFirstNamePreview').textContent = data.identity?.firstName || 'First name';
    byId('verifiedOrderText').textContent = `${data.orderNumber} · delivered order verified`;
    byId('reviewForm').hidden = false;
    setMessage(message, 'Delivered order verified. You can now leave feedback.', 'success');
    trackEvent('review_order_verified', { orderNumber: data.orderNumber });
    byId('reviewForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch {
    setMessage(message, 'Network error — please try again.', 'error');
  } finally {
    setVerifying(false);
  }
}

function setRating(rating) {
  state.rating = rating;
  byId('reviewRating').value = String(rating);
  document.querySelectorAll('#reviewStars button').forEach((button) => {
    const active = Number(button.dataset.rating) <= rating;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function resetReviewForm() {
  state.images.forEach((image) => URL.revokeObjectURL(image.preview));
  state.images = [];
  renderImagePreviews();
  renderProductChoices(state.verified?.products || []);
  setRating(0);
  byId('reviewText').value = '';
  byId('reviewCharacterCount').textContent = '0 / 500';
  byId('reviewConsent').checked = false;
  setMessage(byId('reviewSubmitMsg'), 'Choose the next product from this delivered order.');
}

function reviewAnotherProduct() {
  if (!state.verified?.products?.length) return;
  resetReviewForm();
  byId('reviewSuccess').hidden = true;
  byId('reviewForm').hidden = false;
  byId('reviewForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function fileToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function loadBitmap(file) {
  if ('createImageBitmap' in window) return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
}

async function compressImage(file) {
  const bitmap = await loadBitmap(file);
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, 1400 / longest);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d', { alpha: false }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  let blob = await canvasBlob(canvas, .78);
  if (blob?.size > 800 * 1024) blob = await canvasBlob(canvas, .60);
  if (blob?.size > 850 * 1024) blob = await canvasBlob(canvas, .44);
  if (!blob || blob.size > 850 * 1024) throw new Error('too_large');
  return { dataUrl: await fileToDataUrl(blob), preview: URL.createObjectURL(blob) };
}

function renderImagePreviews() {
  const container = byId('reviewImagePreviews');
  if (!container) return;
  container.innerHTML = state.images.map((image, index) => `
    <div class="review-image-preview">
      <img src="${image.preview}" alt="Selected review photo ${index + 1}">
      <button type="button" data-remove-image="${index}" aria-label="Remove photo ${index + 1}">&times;</button>
    </div>`).join('');
  container.querySelectorAll('[data-remove-image]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.removeImage);
      URL.revokeObjectURL(state.images[index]?.preview || '');
      state.images.splice(index, 1);
      renderImagePreviews();
    });
  });
}

async function addImages(files) {
  const message = byId('reviewSubmitMsg');
  const available = Math.max(0, 3 - state.images.length);
  if (!available) return setMessage(message, 'You can add up to three photos.', 'error');
  const selected = Array.from(files || []).slice(0, available);
  if (!selected.length) return;
  setMessage(message, 'Preparing photos...');
  try {
    for (const file of selected) state.images.push(await compressImage(file));
    renderImagePreviews();
    setMessage(message, `${state.images.length} photo${state.images.length === 1 ? '' : 's'} ready for moderation.`, 'success');
  } catch {
    setMessage(message, 'One photo could not be processed. Please use a JPG, PNG or WebP image.', 'error');
  } finally {
    byId('reviewImages').value = '';
  }
}

async function submitReview(event) {
  event.preventDefault();
  const message = byId('reviewSubmitMsg');
  const product = document.querySelector('input[name="reviewProduct"]:checked')?.value || '';
  const reviewText = byId('reviewText')?.value.trim() || '';
  const displayMode = document.querySelector('input[name="reviewDisplayMode"]:checked')?.value || 'initials';
  if (!state.verified) return setMessage(message, 'Verify your delivered order first.', 'error');
  if (!product) return setMessage(message, 'Choose the product you are reviewing.', 'error');
  if (!state.rating) return setMessage(message, 'Choose a star rating.', 'error');
  if (reviewText.length < 12) return setMessage(message, 'Please add a little more detail to your review.', 'error');
  if (!byId('reviewConsent')?.checked) return setMessage(message, 'Please confirm how your review may be displayed.', 'error');

  const button = byId('reviewSubmitBtn');
  button.disabled = true;
  button.textContent = state.images.length ? 'Uploading and submitting...' : 'Submitting...';
  setMessage(message, '');
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'submit-review',
        orderNumber: state.verified.orderNumber,
        email: state.verified.email,
        product,
        rating: state.rating,
        reviewText,
        displayMode,
        images: state.images.map((image) => image.dataUrl),
        hp: byId('reviewHoneypot')?.value || '',
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) return setMessage(message, errorMessage(data.error), 'error');
    trackEvent('review_submitted', { productSku: product, rating: state.rating, photoCount: state.images.length });
    state.images.forEach((image) => URL.revokeObjectURL(image.preview));
    state.images = [];
    state.verified.products = (state.verified.products || []).filter((item) => item.sku !== product);
    const remaining = state.verified.products.length;
    byId('reviewSuccessText').textContent = remaining
      ? `It has been matched to your order and sent for approval. You still have ${remaining} product${remaining === 1 ? '' : 's'} from this order available to review.`
      : 'It has been matched to your order and sent for approval. Nothing appears publicly until it has been checked.';
    byId('reviewAnotherProductBtn').hidden = remaining === 0;
    byId('reviewForm').hidden = true;
    byId('reviewVerifyStep').hidden = true;
    byId('reviewSuccess').hidden = false;
    byId('reviewSuccess').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch {
    setMessage(message, 'Network error — please try again.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Submit review for approval';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  if (params.get('order')) byId('reviewOrderNumber').value = params.get('order');
  trackEvent('review_opened', { productSku: params.get('product') || '' });
  byId('reviewVerifyBtn')?.addEventListener('click', verifyOrder);
  byId('reviewOrderNumber')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') verifyOrder(); });
  byId('reviewEmail')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') verifyOrder(); });
  document.querySelectorAll('#reviewStars button').forEach((button) => button.addEventListener('click', () => setRating(Number(button.dataset.rating))));
  byId('reviewText')?.addEventListener('input', () => { byId('reviewCharacterCount').textContent = `${byId('reviewText').value.length} / 500`; });
  byId('reviewImages')?.addEventListener('change', (event) => addImages(event.target.files));
  byId('reviewForm')?.addEventListener('submit', submitReview);
  byId('reviewAnotherProductBtn')?.addEventListener('click', reviewAnotherProduct);
});
