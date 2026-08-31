const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('flagship research bundle uses the agreed price with silent MAXX10 eligibility', () => {
  const products = read('assets/js/data/products.js');
  const fena = read('api/create-fena-payment.js');
  const definition = products.match(/UKXRB1:\{[^\n]+/)?.[0] || '';

  assert.match(products, /Object\.assign\(PRODUCTS\.UKXRB1, \{ price: 109\.99 \}\)/);
  assert.doesNotMatch(definition, /separatePrice|originalPrice|launchPrice|promoExcluded/);
  assert.match(products, /UKXRB1: \{ RT10: 1, BC5: 1, GHKCU: 1, WA10: 1 \}/);
  assert.doesNotMatch(fena, /PROMO_EXCLUDED_SKUS/);
});

test('every order path expands UKXRB1 into its four live-stock components', () => {
  [
    'api/create-checkout-session.js',
    'api/create-fena-payment.js',
    'api/order-admin.js',
    'api/telegram-bot.js',
  ].forEach((file) => {
    assert.match(read(file), /UKXRB1: \{ RT10: 1, BC5: 1, GHKCU: 1, WA10: 1 \}/, file);
  });

  const migration = read('supabase/migrations/20260827_ukmaxx_research_bundle.sql');
  assert.match(migration, /\('UKXRB1', 'RT10', 1\)/);
  assert.match(migration, /\('UKXRB1', 'BC5', 1\)/);
  assert.match(migration, /\('UKXRB1', 'GHKCU', 1\)/);
  assert.match(migration, /\('UKXRB1', 'WA10', 1\)/);
  assert.match(migration, /allocate_coa_batch_sale\(v_order\.id, v_component_sku, v_component_qty \* v_qty\)/);
});

test('real bundle gallery, three COAs and discovery links are wired', () => {
  const products = read('assets/js/data/products.js');
  const detail = read('assets/js/modules/productDetail.js');
  const definition = products.match(/UKXRB1:\{[^\n]+/)?.[0] || '';

  assert.ok(fs.existsSync(path.join(root, 'images/product-photography/ukmaxx-research-bundle.jpg')));
  assert.ok(fs.existsSync(path.join(root, 'images/product-photography/ukmaxx-research-bundle-verification-card.jpg')));
  assert.match(definition, /gallery:\[(?:.|\n)*?label:'GHK-Cu sample'/);
  assert.equal((definition.match(/label:'(?:Bundle|Verification card|RETA sample|BPC sample|GHK-Cu sample)'/g) || []).length, 5);
  assert.match(detail, /p\.id === 'UKXRB1'/);
  assert.match(detail, /thumb\.label !== 'RETA sample'/);
  assert.doesNotMatch(definition, /label:'(?:RETA COA|BPC COA|GHK-Cu COA)'/);
  assert.equal((products.match(/product:'(?:RETA 10MG|BPC 157|GHK-Cu 50MG)'/g) || []).length, 3);
  assert.match(detail, /galleryThumbs\.classList\.toggle\('has-many', thumbs\.length > 4\)/);
  assert.match(detail, /pdp-multi-coa/);
  assert.match(read('sitemap.xml'), /product\.html\?sku=UKXRB1/);
  assert.match(read('retatrutide-10mg-uk.html'), /product\.html\?sku=UKXRB1/);
  assert.match(read('bpc-157-5mg-uk.html'), /product\.html\?sku=UKXRB1/);
  assert.match(read('ghk-cu-50mg-uk.html'), /product\.html\?sku=UKXRB1/);
  assert.match(read('api/track-order.js'), /UKXRB1: '\.\/images\/product-photography\/ukmaxx-research-bundle-verification-card\.jpg'/);
});

test('bundle chips inherit the corresponding product colour families', () => {
  const cards = read('assets/js/modules/products.js');
  const detail = read('assets/js/modules/productDetail.js');

  assert.match(cards, /RT10X3: \{ chip: 'Triple receptor bundle', className: 'catalogue-chip--reta'/);
  assert.match(cards, /BC5X3: \{ chip: 'Body protection bundle', className: 'catalogue-chip--bpc'/);
  assert.match(cards, /GHKCUX3: \{ chip: 'Copper peptide bundle', className: 'catalogue-chip--ghk'/);
  assert.match(cards, /UKXRB1: \{ chip: 'Signature research bundle', className: 'catalogue-chip--bundle'/);
  assert.match(detail, /RT10X3: \{ label: 'Triple receptor bundle', className: 'positioning-badge--reta'/);
  assert.match(detail, /BC5X3: \{ label: 'Body protection bundle', className: 'positioning-badge--bpc'/);
  assert.match(detail, /GHKCUX3: \{ label: 'Copper peptide bundle', className: 'positioning-badge--ghk'/);
});
