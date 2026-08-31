const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('RT10 single and bundle use full pricing without launch-price presentation', () => {
  const products = read('assets/js/data/products.js');
  const single = products.match(/RT10:\{[^\n]+/)?.[0] || '';
  const bundle = products.match(/RT10X3:\{[^\n]+/)?.[0] || '';

  assert.match(single, /price:54\.99/);
  assert.match(bundle, /price:149\.99/);
  for (const definition of [single, bundle]) {
    assert.doesNotMatch(definition, /originalPrice|launchPrice|promoExcluded/);
  }
});

test('MAXX10 applies to RT10 products while NAD remains excluded', () => {
  const fena = read('api/create-fena-payment.js');
  const excluded = fena.match(/PROMO_EXCLUDED_SKUS = new Set\(\[([^\]]*)\]\)/)?.[1] || '';

  assert.doesNotMatch(excluded, /RT10/);
  assert.match(excluded, /NJ500/);
});

test('Supabase migration restores RT10 prices without changing stock', () => {
  const migration = read('supabase/migrations/20260831_restore_rt10_full_pricing.sql');

  assert.match(migration, /when 'RT10' then 54\.99/);
  assert.match(migration, /when 'RT10X3' then 149\.99/);
  assert.doesNotMatch(migration, /stock_quantity\s*=/);
});
