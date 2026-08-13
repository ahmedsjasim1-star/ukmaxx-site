import { PRODUCTS } from '../data/products.js';
import { byId } from '../utils/dom.js';

export function updateHeroBatchChips() {
  const product = PRODUCTS.GHKCU;
  if (!product) return;

  const purityValue = byId('heroPurityValue');
  if (purityValue && product.purity) {
    purityValue.textContent = `${product.purity} verified`;
  }

  const batchValue = byId('heroBatchValue');
  if (batchValue) {
    batchValue.textContent = `${product.id} · Verified`;
  }
}
