const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('MAXX10 identifies launch-only, mixed and fully eligible baskets clearly', () => {
  const cart = read('assets/js/modules/cart.js');

  assert.match(cart, /eligibleSubtotal <= 0/);
  assert.match(cart, /wasn’t applied\./);
  assert.match(cart, /'already has' : 'already have'/);
  assert.match(cart, /launch pricing, so additional discounts don’t apply/);
  assert.match(cart, /every item in this basket already has launch pricing/);
  assert.match(cart, /applied to eligible items — you saved/);
  assert.match(cart, /applied — you saved/);
  assert.match(cart, /Launch-priced .* excluded/);
  assert.match(cart, /msg\.classList\.add\('is-warning'\)/);
});

test('basket explanation distinguishes launch pricing from full-price eligibility', () => {
  const bundle = read('assets/html/bundle.js');
  const css = read('assets/css/components.css');

  assert.match(bundle, /MAXX10<\/strong> gives 10% off full-price items/);
  assert.match(bundle, /cannot be combined with another offer/);
  assert.match(css, /\.cart-promo-msg\.is-warning/);
});
