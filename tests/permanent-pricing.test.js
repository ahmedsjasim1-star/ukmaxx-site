const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('NAD is permanently £39.99 and no longer carries launch-price behavior', () => {
  const products = read('assets/js/data/products.js');
  const builder = read('assets/js/modules/customBundle.js');
  const fena = read('api/create-fena-payment.js');

  assert.match(products, /Object\.assign\(PRODUCTS\.NJ500, \{ price: 39\.99 \}\)/);
  assert.doesNotMatch(products.match(/NJ500:\{[^\n]+/)?.[0] || '', /originalPrice|launchPrice|promoExcluded/);
  assert.doesNotMatch(builder, /Launch price|launchPrice|promoExcluded/);
  assert.doesNotMatch(fena, /PROMO_EXCLUDED_SKUS/);
});

test('all fixed bundles except RT10 receive the agreed 5% reduction', () => {
  const products = read('assets/js/data/products.js');
  assert.match(products, /RT10X3:\{[^\n]+price:149\.99/);
  assert.match(products, /Object\.assign\(PRODUCTS\.RT20X3, \{ price: 227\.97 \}\)/);
  assert.match(products, /Object\.assign\(PRODUCTS\.BC5X3, \{ price: 84\.99 \}\)/);
  assert.match(products, /Object\.assign\(PRODUCTS\.GHKCUX3, \{ price: 84\.99 \}\)/);
  assert.match(products, /Object\.assign\(PRODUCTS\.UKXRB1, \{ price: 109\.99 \}\)/);
});

test('database migration updates prices only and preserves RT10X3', () => {
  const migration = read('supabase/migrations/20260831_permanent_pricing_and_bundle_savings.sql');
  assert.match(migration, /when 'NJ500' then 39\.99/);
  assert.match(migration, /when 'RT20X3' then 269\.99/);
  assert.match(migration, /when 'BC5X3' then 84\.99/);
  assert.match(migration, /when 'GHKCUX3' then 84\.99/);
  assert.match(migration, /when 'UKXRB1' then 109\.99/);
  assert.doesNotMatch(migration, /when 'RT10X3'/);
  assert.doesNotMatch(migration, /stock_quantity\s*=/);
});

test('both payment paths independently price the custom bundle saving', () => {
  const fena = read('api/create-fena-payment.js');
  const stripe = read('api/create-checkout-session.js');
  assert.match(fena, /customBundleDiscount\(normalized, bySku\)/);
  assert.match(fena, /promoEligibleSubtotal - bundleDiscount/);
  assert.match(stripe, /customBundleDiscountedQuantities\(normalized, bySku\)/);
  assert.match(stripe, /unitAmount - Math\.round\(unitAmount \* 0\.05\)/);
  assert.match(stripe, /bundle_saving: '5_percent'/);
});
