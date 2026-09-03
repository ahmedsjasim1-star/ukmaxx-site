const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('RT20 single and bundle use the agreed full prices and remain MAXX10 eligible', () => {
  const products = read('assets/js/data/products.js');
  const fena = read('api/create-fena-payment.js');
  const migration = read('supabase/migrations/20260903_reprice_rt20.sql');
  const bundleHub = read('research-peptide-bundles-uk.html');

  assert.match(products, /Object\.assign\(PRODUCTS\.RT20, \{ price: 79\.99 \}\)/);
  assert.doesNotMatch(products.match(/RT20:\{[^\n]+/)?.[0] || '', /originalPrice|launchPrice|promoExcluded/);
  assert.match(products, /Object\.assign\(PRODUCTS\.RT20X3, \{ price: 227\.97 \}\)/);
  assert.match(products, /delete PRODUCTS\.RT20X3\.separatePrice/);
  assert.match(products, /RT20X3: \{ RT20: 3, WA10: 1 \}/);
  assert.doesNotMatch(fena, /PROMO_EXCLUDED_SKUS/);
  assert.match(migration, /when 'RT20' then 79\.99/);
  assert.match(migration, /when 'RT20X3' then 227\.97/);
  assert.doesNotMatch(migration, /stock_quantity|bundle_components|allocate_order_stock/);
  assert.match(bundleHub, /<dt>Bundle price<\/dt><dd>£227\.97<\/dd>/);
});

test('RT20 fixed bundle exactly matches the three-vial builder price', () => {
  const threeSingles = 79.99 * 3;
  const builderSaving = Math.round(79.99 * 100 * 0.05) / 100 * 3;
  const builderPrice = Number((threeSingles - builderSaving).toFixed(2));
  assert.equal(builderPrice, 227.97);
  assert.equal(Number((builderPrice * 0.90).toFixed(2)), 205.17);
});

test('RT20 COA data matches Janoshik report 225850', () => {
  const products = read('assets/js/data/products.js');
  const migration = read('supabase/migrations/20260831_rt20_verified_bundle.sql');

  for (const content of [products, migration]) {
    assert.match(content, /RT20-2026-08-A/);
    assert.match(content, /23\.20mg/);
    assert.match(content, /99\.607%/);
    assert.match(content, /225850-RT20_QX5EZXK4B9YV/);
  }
  assert.match(migration, /49,/);
});

test('every order path expands RT20X3 into three RT20 and one WA10', () => {
  [
    'api/create-checkout-session.js',
    'api/create-fena-payment.js',
    'api/order-admin.js',
    'api/telegram-bot.js',
  ].forEach((file) => {
    assert.match(read(file), /RT20X3: \{ RT20: 3, WA10: 1 \}/, file);
  });

  const migration = read('supabase/migrations/20260831_rt20_verified_bundle.sql');
  assert.match(migration, /\('RT20X3', 'RT20', 3\)/);
  assert.match(migration, /\('RT20X3', 'WA10', 1\)/);
  assert.match(migration, /allocate_coa_batch_sale\(v_order\.id, v_component_sku, v_component_qty \* v_qty\)/);
});

test('RT20 photography, tracking and discovery are wired', () => {
  [
    'images/product-photography/ukmaxx-retatrutide-20mg-product.jpg',
    'images/product-photography/ukmaxx-retatrutide-20mg-product-wide.jpg',
    'images/product-photography/ukmaxx-retatrutide-20mg-3-pack-verification-card.jpg',
    'images/retatrutide-20mg-coa-2026-08.png',
    'images/retatrutide-20mg-janoshik-sample.jpg',
  ].forEach((file) => assert.equal(fs.existsSync(path.join(root, file)), true, file));

  assert.match(read('api/track-order.js'), /RT20: '\.\/images\/product-photography\/ukmaxx-retatrutide-20mg-product\.jpg'/);
  assert.match(read('api/track-order.js'), /RT20X3: '\.\/images\/product-photography\/ukmaxx-retatrutide-20mg-3-pack-verification-card\.jpg'/);
  assert.match(read('sitemap.xml'), /product\.html\?sku=RT20/);
  assert.match(read('sitemap.xml'), /product\.html\?sku=RT20X3/);
});
