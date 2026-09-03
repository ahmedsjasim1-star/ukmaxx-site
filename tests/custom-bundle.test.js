const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('catalogue offers a three-vial custom bundle with a free BAC Water', () => {
  const catalogue = read('catalogue.html');
  const builder = read('assets/js/modules/customBundle.js');

  assert.match(catalogue, /Choose any three single vials/);
  assert.match(catalogue, /Free BAC Water/);
  assert.match(catalogue, /id="customBundleBackdrop"/);
  assert.match(builder, /get\('build_bundle'\) === '1'/);
  assert.match(builder, /selection\.length !== 3/);
  assert.match(builder, /addCustomBundle\(selection\)/);
});

test('custom bundle eligibility excludes BAC Water and pre-built bundles', () => {
  const products = read('assets/js/data/products.js');
  assert.match(products, /CUSTOM_BUNDLE_ELIGIBLE_SKUS = \['RT10', 'RT20', 'BC5', 'GHKCU', 'NJ500'\]/);
  assert.doesNotMatch(products.match(/CUSTOM_BUNDLE_ELIGIBLE_SKUS[^;]+/)?.[0] || '', /WA10|X3|UKXRB1/);
});

test('free BAC and automatic 5% saving are priced consistently in basket and Pay by Bank checkout', () => {
  const cart = read('assets/js/modules/cart.js');
  const fena = read('api/create-fena-payment.js');

  assert.match(cart, /Math\.min\(Math\.floor\(qualifyingVials \/ 3\), bacQuantity\)/);
  assert.match(cart, /Number\(item\.bundleQty \|\| 0\)/);
  assert.match(cart, /sub - bundleGiftDiscount - bundleDiscount - discount/);
  assert.match(cart, /Build-your-own bundle saving \(5%\)/);
  assert.match(cart, /Math\.round\(price \* 100 \* 0\.05\)/);
  assert.match(cart, /productSku: 'CUSTOM3'/);
  assert.match(fena, /const freeBacQty = customBundleGiftQuantity\(normalized\)/);
  assert.match(fena, /total \+ item\.bundleQty/);
  assert.match(fena, /item\.sku === 'WA10' \? Math\.max\(0, item\.qty - freeBacQty\) : item\.qty/);
  assert.match(fena, /free bundle gift/);
  assert.match(fena, /customBundleDiscount\(normalized, bySku\)/);
});

test('custom saving remains attached to builder-selected vials in mixed baskets', () => {
  const cart = read('assets/js/modules/cart.js');
  const fena = read('api/create-fena-payment.js');
  const stripe = read('api/create-checkout-session.js');

  assert.match(cart, /item\.bundleQty = Number\(item\.bundleQty \|\| 0\) \+ selectedQty/);
  assert.match(cart, /length: Number\(item\.bundleQty \|\| 0\)/);
  assert.match(fena, /length: item\.bundleQty/);
  assert.match(stripe, /length: item\.bundleQty/);
});

test('NAD has permanent pricing and MAXX10 stacks after the custom bundle saving', () => {
  const products = read('assets/js/data/products.js');
  const cart = read('assets/js/modules/cart.js');
  const fena = read('api/create-fena-payment.js');
  assert.match(products, /Object\.assign\(PRODUCTS\.NJ500, \{ price: 39\.99 \}\)/);
  assert.doesNotMatch(products.match(/NJ500:\{[^\n]+/)?.[0] || '', /originalPrice|launchPrice|promoExcluded/);
  assert.doesNotMatch(fena, /PROMO_EXCLUDED_SKUS/);
  assert.match(cart, /promoEligibility\(c\)\.eligibleSubtotal - bundleDiscount/);
});
