const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('RT10 and RT20 present the Janoshik blind test and HPLC method accurately', () => {
  const products = read('assets/js/data/products.js');
  const guide = read('retatrutide-10mg-uk.html');

  for (const sku of ['RT10', 'RT10X3', 'RT20', 'RT20X3']) {
    const line = products.split('\n').find((entry) => entry.includes(`  ${sku}:{`)) || '';
    assert.match(line, /method:'HPLC blind test'/, sku);
  }

  assert.match(products, /Test: Common GLP-1 peptide blind test\\nMethod: HPLC/);
  assert.match(guide, /Common GLP-1 peptide blind test, analysed by HPLC/);
  assert.doesNotMatch(guide, /UPLC\/MS/);
});

test('Retatrutide method migration only updates descriptive batch metadata', () => {
  const migration = read('supabase/migrations/20260901_correct_retatrutide_test_methods.sql');

  assert.match(migration, /set method = 'HPLC blind test'/);
  assert.match(migration, /'RT10-2026-06-A', 'RT20-2026-08-A'/);
  assert.doesNotMatch(migration, /stock|sold_count|batch_size|order|payment/i);
});
