const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('RT20 guide publishes accurate batch evidence and internal links', () => {
  const guide = read('retatrutide-20mg-uk.html');
  assert.match(guide, /<link rel="canonical" href="https:\/\/www\.ukmaxx\.co\.uk\/retatrutide-20mg-uk\.html">/);
  assert.match(guide, /RT20-2026-08-A/);
  assert.match(guide, /23\.20mg/);
  assert.match(guide, /99\.607%/);
  assert.match(guide, /report #225850/i);
  assert.match(guide, /Common GLP-1 peptide blind test analysed by HPLC/);
  assert.match(guide, /\/coa\.html\?batch=RT20-2026-08-A/);
  assert.match(guide, /"@type":"Article"/);
  assert.match(guide, /"@type":"FAQPage"/);
});

test('UK Peptides page leads with RT20 and presents RT10 honestly', () => {
  const page = read('uk-peptides.html');
  const rt20 = page.indexOf('<h3>Retatrutide 20mg / RT20</h3>');
  const rt10 = page.indexOf('<h3>Retatrutide 10mg / RT10</h3>');
  assert.ok(rt20 >= 0 && rt10 > rt20);
  assert.match(page, /Sold out · previous batch verified/);
  assert.match(page, /retatrutide-20mg-uk\.html/);
  for (const sku of ['RT20', 'RT20X3', 'GHKCU', 'GHKCUX3', 'BC5', 'BC5X3', 'RT10', 'RT10X3', 'NJ500', 'WA10']) {
    assert.match(page, new RegExp(`product\\.html\\?sku=${sku}`));
  }
});

test('catalogue initial HTML has crawlable products, bundles and complete ItemList', () => {
  const page = read('catalogue.html');
  assert.match(page, /data-catalogue-fallback/);
  assert.match(page, /retatrutide-20mg-uk\.html/);
  for (const sku of ['RT20', 'GHKCU', 'BC5', 'NJ500', 'WA10', 'RT10', 'RT20X3', 'BC5X3', 'GHKCUX3', 'UKXRB1', 'RT10X3']) {
    assert.match(page, new RegExp(`product\\.html\\?sku=${sku}`));
  }
  assert.match(page, /RETA 10MG \/ RT10 — sold out/);
});

test('RT20 guide is discoverable from the library, product data and sitemap', () => {
  assert.match(read('research-library.html'), /href="\/retatrutide-20mg-uk\.html"/);
  assert.match(read('assets/js/data/products.js'), /UKMAXX Retatrutide 20mg RT20 assay guide/);
  assert.match(read('sitemap.xml'), /https:\/\/www\.ukmaxx\.co\.uk\/retatrutide-20mg-uk\.html/);
});

test('RT10 guide no longer presents sold-through stock as current', () => {
  const page = read('retatrutide-10mg-uk.html');
  assert.match(page, /sold-through UKMAXX batch RT10-2026-06-A/i);
  assert.match(page, /Sold-through status and the next release/);
  assert.doesNotMatch(page, /View RT10 stock|current UKMAXX RT10 stock|remain available/);
});
