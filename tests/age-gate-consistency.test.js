const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const guidePages = [
  'uk-peptides-third-party-tested.html',
  'pay-by-bank-uk.html',
  'bpc-157-5mg-uk.html',
  'ghk-cu-50mg-uk.html',
  'nad-500mg-uk.html',
  'bacteriostatic-water-10ml-uk.html',
];

test('guide pages use the age gate controls wired by the shared site module', () => {
  const ageGateModule = read('assets/js/modules/ageGate.js');
  assert.match(ageGateModule, /byId\('ageEnterBtn'\)/);
  assert.match(ageGateModule, /byId\('ageExitBtn'\)/);

  guidePages.forEach((file) => {
    const page = read(file);
    assert.match(page, /id="ageEnterBtn"/, file);
    assert.match(page, /id="ageExitBtn"/, file);
    assert.match(page, /aria-describedby="ageGateDesc"/, file);
    assert.doesNotMatch(page, /id="ageGateAccept"/, file);
  });
});
