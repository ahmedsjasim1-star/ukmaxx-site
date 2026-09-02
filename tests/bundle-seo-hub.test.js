const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('bundle hub has a stable canonical URL and crawlable bundle links', () => {
  const page = read('research-peptide-bundles-uk.html');
  assert.match(page, /<title>Research Peptide Bundles UK \| Build Your Own \| UKMAXX<\/title>/);
  assert.match(page, /rel="canonical" href="https:\/\/www\.ukmaxx\.co\.uk\/research-peptide-bundles-uk\.html"/);
  for (const sku of ['RT20X3', 'BC5X3', 'GHKCUX3', 'RT10X3', 'UKXRB1']) {
    assert.match(page, new RegExp(`product\\.html\\?sku=${sku}`));
  }
  assert.match(page, /id="build-your-own"/);
  assert.match(page, /Choose any three available single vials/);
  assert.match(page, /5% bundle saving/);
  assert.match(page, /BAC Water 10ml is included free/);
});

test('temporarily unavailable UKMAXX bundle keeps an honest restock path', () => {
  const page = read('research-peptide-bundles-uk.html');
  assert.match(page, /temporarily unavailable because RT10 has sold out/i);
  assert.match(page, /only after the next RT10 batch completes testing and release checks/i);
  assert.match(page, /date is an estimate, not a guarantee/i);
  assert.match(page, /data-restock-alert="UKXRB1"/);
  assert.match(page, /data-restock-alert="RT10X3"/);
});

test('bundle hub is discoverable across important site paths', () => {
  const url = /\/research-peptide-bundles-uk\.html/;
  for (const file of [
    'assets/html/bundle.js',
    'catalogue.html',
    'product.html',
    'research-library.html',
    'retatrutide-20mg-uk.html',
    'uk-peptides.html',
    'sitemap.xml'
  ]) {
    assert.match(read(file), url, `${file} should link to the bundle hub`);
  }
});
