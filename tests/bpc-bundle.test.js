const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('BPC 3-pack is priced as a MAXX10-eligible full-price bundle', () => {
  const products = read('assets/js/data/products.js');
  const fena = read('api/create-fena-payment.js');
  assert.match(products, /BC5X3:\{[^\n]+price:89\.99,separatePrice:98\.96/);
  assert.match(products, /BC5X3: \{ BC5: 3, WA10: 1 \}/);
  const excluded = fena.match(/PROMO_EXCLUDED_SKUS = new Set\(\[([^\]]*)\]\)/)?.[1] || '';
  assert.doesNotMatch(excluded, /BC5X3/);
});

test('every order path expands BC5X3 into three BC5 and one WA10', () => {
  [
    'api/create-checkout-session.js',
    'api/create-fena-payment.js',
    'api/order-admin.js',
    'api/telegram-bot.js',
  ].forEach((file) => {
    assert.match(read(file), /BC5X3: \{ BC5: 3, WA10: 1 \}/, file);
  });
  const migration = read('supabase/migrations/20260827_bpc_3_pack_bundle.sql');
  assert.match(migration, /\('BC5X3', 'BC5', 3\)/);
  assert.match(migration, /\('BC5X3', 'WA10', 1\)/);
  assert.match(migration, /allocate_coa_batch_sale\(v_order\.id, v_component_sku, v_component_qty \* v_qty\)/);
});

test('BPC bundle is discoverable and uses the supplied product image', () => {
  assert.equal(fs.existsSync(path.join(root, 'images/product-photography/ukmaxx-bpc-157-3-pack-bundle.jpg')), true);
  assert.match(read('sitemap.xml'), /product\.html\?sku=BC5X3/);
  assert.match(read('bpc-157-5mg-uk.html'), /product\.html\?sku=BC5X3/);
  assert.match(read('api/track-order.js'), /BC5X3: '\.\/images\/product-photography\/ukmaxx-bpc-157-3-pack-verification-card\.jpg'/);
});
