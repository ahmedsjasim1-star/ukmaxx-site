import { PRODUCTS } from '../data/products.js?v=20260901-retatrutide-method';
import { byId } from '../utils/dom.js';

export function updateHeroBatchChips() {
  const product = PRODUCTS.RT20;
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
