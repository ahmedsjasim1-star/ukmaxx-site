const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('GHK-Cu bundle uses the agreed price and remains MAXX10 eligible', () => {
  const products = read('assets/js/data/products.js');
  const fena = read('api/create-fena-payment.js');
  assert.match(products, /GHKCUX3:\{[^\n]+price:89\.99,separatePrice:98\.96/);
  assert.match(products, /GHKCUX3: \{ GHKCU: 3, WA10: 1 \}/);
  assert.doesNotMatch(fena.match(/PROMO_EXCLUDED_SKUS[^;]+/)?.[0] || '', /GHKCUX3/);
});

test('every order path expands GHKCUX3 into three GHKCU and one WA10', () => {
  [
    'api/create-checkout-session.js',
    'api/create-fena-payment.js',
    'api/order-admin.js',
    'api/telegram-bot.js',
  ].forEach((file) => {
    assert.match(read(file), /GHKCUX3: \{ GHKCU: 3, WA10: 1 \}/, file);
  });

  const migration = read('supabase/migrations/20260827_ghkcu_3_pack_bundle.sql');
  assert.match(migration, /\('GHKCUX3', 'GHKCU', 3\)/);
  assert.match(migration, /\('GHKCUX3', 'WA10', 1\)/);
  assert.match(migration, /allocate_coa_batch_sale\(v_order\.id, v_component_sku, v_component_qty \* v_qty\)/);
});

test('GHK-Cu bundle image and discovery links are wired', () => {
  assert.ok(fs.existsSync(path.join(root, 'images/product-photography/ukmaxx-ghk-cu-3-pack-bundle.jpg')));
  assert.match(read('sitemap.xml'), /product\.html\?sku=GHKCUX3/);
  assert.match(read('ghk-cu-50mg-uk.html'), /product\.html\?sku=GHKCUX3/);
  assert.match(read('api/track-order.js'), /GHKCUX3: '\.\/images\/product-photography\/ukmaxx-ghk-cu-3-pack-bundle\.jpg'/);
});
