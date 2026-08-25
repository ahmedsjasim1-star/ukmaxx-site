const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('visitor context exposes only the Vercel country code', async () => {
  const handler = require('../api/track-order');
  let statusCode = 0;
  let payload;
  const res = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; },
  };
  await handler({ method: 'GET', query: { type: 'visitor-context' }, headers: { 'x-vercel-ip-country': 'NL' } }, res);
  assert.equal(statusCode, 200);
  assert.deepEqual(payload, { country: 'NL' });
});

test('checkout has a country-gated international WhatsApp notice', () => {
  const bundle = fs.readFileSync(path.join(root, 'assets/html/bundle.js'), 'utf8');
  const cart = fs.readFileSync(path.join(root, 'assets/js/modules/cart.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'assets/css/components.css'), 'utf8');
  assert.match(bundle, /checkoutInternationalNotice/);
  assert.match(cart, /countryCode === 'GB'/);
  assert.match(cart, /international_checkout/);
  assert.match(cart, /Basket value:/);
  assert.match(cart, /shipping cost and expected timeframe/);
  assert.doesNotMatch(cart, /future availability/);
  assert.match(css, /checkout-international-notice/);
});
