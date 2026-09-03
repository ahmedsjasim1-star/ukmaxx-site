const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('third-party testing page publishes current, archived and rejected evidence', () => {
  const page = read('uk-peptides-third-party-tested.html');
  for (const batch of ['RT20-2026-08-A', 'BPC-2026-05-A', 'GHK-2026-05-A', 'NAD-2026-05-A', 'RT10-2026-06-A', 'IPA-2026-05-A']) {
    assert.match(page, new RegExp(batch));
  }
  for (const report of ['225850', '208699', '208700', '208698', '193587', '208701']) {
    assert.match(page, new RegExp(report));
  }
  assert.match(page, /23\.20mg/);
  assert.match(page, /99\.607%/);
  assert.match(page, /3\.71mg/);
  assert.match(page, /QC rejected · not released/);
});

test('testing page exposes crawlable product, COA and supporting-article links', () => {
  const page = read('uk-peptides-third-party-tested.html');
  for (const sku of ['RT20', 'BC5', 'GHKCU', 'NJ500']) {
    assert.match(page, new RegExp(`product\\.html\\?sku=${sku}`));
  }
  for (const article of ['how-to-verify-research-peptides.html', 'coa-verified-peptides-uk.html', 'batch-transparency.html', 'research-peptide-packaging-coa-uk.html']) {
    assert.match(page, new RegExp(article));
  }
  assert.match(page, /"@type":"Article"/);
  assert.match(page, /"@type":"ItemList"/);
  assert.match(page, /"@type":"FAQPage"/);
});

test('evidence carousels are manual, accessible and backed by real assets', () => {
  const page = read('uk-peptides-third-party-tested.html');
  const script = read('assets/js/modules/evidenceCarousel.js');
  assert.match(page, /data-carousel-viewport tabindex="0"/);
  assert.match(page, /aria-label="Previous sample"/);
  assert.match(page, /aria-label="Next report"/);
  assert.match(page, /data-lightbox-src/);
  assert.doesNotMatch(script, /setInterval|setTimeout/);
  assert.match(script, /ArrowLeft/);
  assert.match(script, /ArrowRight/);

  for (const asset of [
    'ghkcu-coa-vial-2026-07.jpg',
    'bpc-coa-vial-2026-07.jpg',
    'retatrutide-20mg-janoshik-sample.jpg',
    'nad-coa-vial-2026-07.jpg',
    'ghkcu-coa-2026-07.png',
    'bpc-coa-2026-07.png',
    'retatrutide-20mg-coa-2026-08.png',
    'nad-coa-2026-07.png',
  ]) {
    assert.equal(fs.existsSync(path.join(root, 'images', asset)), true, asset);
  }
});
