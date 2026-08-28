const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const photographs = [
  'ukmaxx-retatrutide-10mg-product.jpg',
  'ukmaxx-bpc-157-5mg-product.jpg',
  'ukmaxx-ghk-cu-50mg-product.jpg',
  'ukmaxx-nad-plus-500mg-product.jpg',
  'ukmaxx-bacteriostatic-water-10ml-product.jpg',
  'ukmaxx-retatrutide-3-pack-bundle.jpg',
  'ukmaxx-retatrutide-3-pack-verification-card.jpg',
  'ukmaxx-bpc-157-3-pack-bundle.jpg',
  'ukmaxx-bpc-157-3-pack-verification-card.jpg',
  'ukmaxx-ghk-cu-3-pack-bundle.jpg',
  'ukmaxx-ghk-cu-3-pack-verification-card.jpg',
  'ukmaxx-research-bundle.jpg',
  'ukmaxx-research-bundle-verification-card.jpg',
];

test('all real product photographs are optimised, discoverable and mapped', () => {
  const products = read('assets/js/data/products.js');

  photographs.forEach((filename) => {
    const absolute = path.join(root, 'images', 'product-photography', filename);
    assert.equal(fs.existsSync(absolute), true, filename);
    assert.ok(fs.statSync(absolute).size < 800000, `${filename} should remain web optimised`);
    assert.match(products, new RegExp(filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
});

test('product SEO pages use the corresponding real photograph', () => {
  assert.match(read('retatrutide-10mg-uk.html'), /ukmaxx-retatrutide-10mg-product\.jpg/);
  assert.match(read('bpc-157-5mg-uk.html'), /ukmaxx-bpc-157-5mg-product\.jpg/);
  assert.match(read('ghk-cu-50mg-uk.html'), /ukmaxx-ghk-cu-50mg-product\.jpg/);
  assert.match(read('nad-500mg-uk.html'), /ukmaxx-nad-plus-500mg-product\.jpg/);
  assert.match(read('bacteriostatic-water-10ml-uk.html'), /ukmaxx-bacteriostatic-water-10ml-product\.jpg/);
});

test('bundle verification-card photographs are used as the primary images', () => {
  const products = read('assets/js/data/products.js');
  assert.match(products, /RT10X3: '\.\/images\/product-photography\/ukmaxx-retatrutide-3-pack-verification-card\.jpg'/);
  assert.match(products, /BC5X3: '\.\/images\/product-photography\/ukmaxx-bpc-157-3-pack-verification-card\.jpg'/);
  assert.match(products, /GHKCUX3: '\.\/images\/product-photography\/ukmaxx-ghk-cu-3-pack-verification-card\.jpg'/);
  assert.match(products, /UKXRB1: '\.\/images\/product-photography\/ukmaxx-research-bundle-verification-card\.jpg'/);
});
