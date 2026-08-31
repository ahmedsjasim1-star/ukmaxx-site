const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('RT10-dependent fallback products render sold out before live stock loads', () => {
  const products = read('assets/js/data/products.js');
  for (const sku of ['RT10', 'RT10X3', 'UKXRB1']) {
    const definition = products.match(new RegExp(`${sku}:\\{[^\\n]+`))?.[0] || '';
    assert.match(definition, /stock:'out_of_stock'/);
    assert.match(definition, /stockCount:0/);
    assert.match(definition, /releaseLabel:'Sold out'/);
  }
});

test('product quantities are capped by live stock and sold-out controls become restock actions', () => {
  const detail = read('assets/js/modules/productDetail.js');
  const productPage = read('product.html');

  assert.match(detail, /const stockLimit = Math\.max\(1, Number\(p\.stockCount \|\| 1\)\)/);
  assert.match(detail, /Math\.min\(stockLimit, Number\(value\) \|\| 1\)/);
  assert.match(detail, /parentElement\.hidden = !purchasable/);
  assert.match(detail, /Join restock alerts/);
  assert.match(detail, /Current stock has sold through/);
  assert.match(productPage, /window\.__html\.exitIntent/);
});

test('basket feedback reports accepted quantity and suppresses false add confirmation', () => {
  const cart = read('assets/js/modules/cart.js');

  assert.match(cart, /const added = Math\.max\(0, nextQty - currentQty\)/);
  assert.match(cart, /Only \$\{maxQty\} \$\{unit\} available — \$\{added\} added to your basket/);
  assert.match(cart, /if \(!result\?\.ok\) return/);
  assert.match(cart, /quantity: added/);
  assert.doesNotMatch(cart, /`\$\{num\}× \$\{p\.name\} added\.`/);
});
