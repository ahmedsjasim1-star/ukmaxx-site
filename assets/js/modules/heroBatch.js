import { PRODUCTS } from '../data/products.js';
import { byId } from '../utils/dom.js';

function batchMonthLabel(batch) {
  const match = String(batch || '').match(/-(20\d{2})-(\d{2})-/);
  if (!match) return '';
  const [, year, month] = match;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleString('en-GB', { month: 'short', year: 'numeric' });
}

export function updateHeroBatchChips() {
  const product = PRODUCTS.RT10;
  if (!product) return;

  const purityValue = byId('heroPurityValue');
  if (purityValue && product.purity) {
    purityValue.textContent = `${product.purity} verified`;
  }

  const batchValue = byId('heroBatchValue');
  const monthLabel = batchMonthLabel(product.batch);
  if (batchValue && monthLabel) {
    batchValue.textContent = `${product.id} · ${monthLabel}`;
  }
}
