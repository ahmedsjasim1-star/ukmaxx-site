import { PRODUCTS, CUSTOM_BUNDLE_ELIGIBLE_SKUS, isPurchasable } from '../data/products.js?v=20260903-rt20-reprice';
import { addCustomBundle } from './cart.js?v=20260903-rt20-reprice';
import { money } from '../utils/money.js';
import { byId } from '../utils/dom.js';

const selection = [];

function selectedCount(sku) {
  return selection.filter((item) => item === sku).length;
}

function availableProducts() {
  return CUSTOM_BUNDLE_ELIGIBLE_SKUS
    .map((sku) => PRODUCTS[sku])
    .filter((product) => product && isPurchasable(product));
}

function closeBuilder() {
  const backdrop = byId('customBundleBackdrop');
  if (!backdrop) return;
  backdrop.classList.remove('is-open');
  backdrop.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function renderBuilder() {
  const options = byId('customBundleOptions');
  const summary = byId('customBundleSummary');
  const addButton = byId('customBundleAdd');
  const count = byId('customBundleCount');
  if (!options || !summary || !addButton || !count) return;

  const products = availableProducts();
  options.innerHTML = products.map((product) => {
    const qty = selectedCount(product.id);
    const remaining = Math.max(0, Number(product.stockCount || 0) - qty);
    return `<article class="custom-bundle-option${qty ? ' is-selected' : ''}">
      <div class="custom-bundle-option-media custom-bundle-option-media--${product.id}"><img src="${product.image}" alt="${product.name}"></div>
      <div class="custom-bundle-option-copy">
        <span class="custom-bundle-option-type">${product.category === 'coenzymes' ? 'Coenzyme' : 'Peptide'}</span>
        <strong>${product.name}</strong>
        <span>${money(product.price)} · ${remaining} available</span>
      </div>
      <div class="custom-bundle-stepper" role="group" aria-label="Quantity for ${product.name}">
        <button type="button" data-custom-remove="${product.id}" aria-label="Remove one ${product.name}" ${qty ? '' : 'disabled'}>−</button>
        <span>${qty}</span>
        <button type="button" data-custom-add="${product.id}" aria-label="Add one ${product.name}" ${selection.length >= 3 || remaining < 1 ? 'disabled' : ''}>+</button>
      </div>
    </article>`;
  }).join('');

  const selectedProducts = selection.map((sku) => PRODUCTS[sku]).filter(Boolean);
  const selectedTotal = selectedProducts.reduce((total, product) => total + Number(product.price || 0), 0);
  const bundleSaving = selectedProducts.reduce((total, product) => (
    total + (Math.round(Number(product.price || 0) * 100 * 0.05) / 100)
  ), 0);
  const bundlePrice = selectedTotal - bundleSaving;
  const maxxPrice = bundlePrice * 0.90;
  const slots = [0, 1, 2].map((index) => {
    const product = selectedProducts[index];
    return product
      ? `<span class="custom-bundle-slot is-filled"><img src="${product.image}" alt="">${product.shortName}</span>`
      : `<span class="custom-bundle-slot">Choose vial ${index + 1}</span>`;
  }).join('');

  summary.innerHTML = `<div class="custom-bundle-slots">${slots}</div>
    <div class="custom-bundle-free-gift">
      <img src="${PRODUCTS.WA10.image}" alt="BAC Water 10ml">
      <div><span>Included automatically</span><strong>BAC Water 10ml</strong></div>
      <b>FREE</b>
    </div>
    <div class="custom-bundle-price-row">
      <span>Selected vial total</span><strong>${money(selectedTotal)}</strong>
    </div>
    <div class="custom-bundle-price-row">
      <span>Bundle saving (5%)</span><strong>-${money(bundleSaving)}</strong>
    </div>
    <div class="custom-bundle-maxx-row">
      <span>Bundle price</span><strong>${money(bundlePrice)}</strong>
    </div>
    <p class="custom-bundle-discount-note">MAXX10 is also eligible: ${money(maxxPrice)} after the additional 10% saving.</p>`;

  count.textContent = `${selection.length} of 3 selected`;
  addButton.disabled = selection.length !== 3 || !isPurchasable(PRODUCTS.WA10);
}

function openBuilder() {
  const backdrop = byId('customBundleBackdrop');
  if (!backdrop) return;
  selection.splice(0, selection.length);
  renderBuilder();
  backdrop.classList.add('is-open');
  backdrop.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  byId('customBundleClose')?.focus();
}

export function setupCustomBundleBuilder() {
  const backdrop = byId('customBundleBackdrop');
  if (!backdrop) return;

  document.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-open-custom-bundle]');
    if (opener) {
      event.preventDefault();
      openBuilder();
      return;
    }
    const add = event.target.closest('[data-custom-add]');
    if (add && selection.length < 3) {
      selection.push(add.dataset.customAdd);
      renderBuilder();
      return;
    }
    const remove = event.target.closest('[data-custom-remove]');
    if (remove) {
      const index = selection.lastIndexOf(remove.dataset.customRemove);
      if (index >= 0) selection.splice(index, 1);
      renderBuilder();
    }
  });

  byId('customBundleClose')?.addEventListener('click', closeBuilder);
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeBuilder(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && backdrop.classList.contains('is-open')) closeBuilder();
  });
  byId('customBundleAdd')?.addEventListener('click', () => {
    const result = addCustomBundle(selection);
    if (!result.ok) return;
    closeBuilder();
    byId('cartToggle')?.click();
  });
}

document.addEventListener('DOMContentLoaded', setupCustomBundleBuilder);
