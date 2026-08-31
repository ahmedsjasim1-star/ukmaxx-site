const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('MAXX10 applies to permanent prices after automatic bundle savings', () => {
  const cart = read('assets/js/modules/cart.js');

  assert.match(cart, /eligibleSubtotal <= 0/);
  assert.match(cart, /applied — you saved/);
  assert.match(cart, /promoEligibility\(c\)\.eligibleSubtotal - bundleDiscount/);
  assert.match(cart, /msg\.classList\.add\('is-warning'\)/);
});

test('basket explanation states that MAXX10 stacks with the custom bundle saving', () => {
  const bundle = read('assets/html/bundle.js');
  const css = read('assets/css/components.css');

  assert.match(bundle, /MAXX10<\/strong> gives 10% off eligible products/);
  assert.match(bundle, /stacks with the automatic 5% build-your-own bundle saving/);
  assert.match(css, /\.cart-promo-msg\.is-warning/);
});
