const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('homepage features the current RT20 Janoshik result', () => {
  const homepage = read('index.html');
  const heroBatch = read('assets/js/modules/heroBatch.js');

  assert.match(homepage, /Janoshik report #225850/);
  assert.match(homepage, /RT20-2026-08-A/);
  assert.match(homepage, /99\.607%/);
  assert.match(homepage, /23\.20mg Retatrutide/);
  assert.match(homepage, /retatrutide-20mg-coa-2026-08\.png/);
  assert.match(homepage, /retatrutide-20mg-janoshik-sample\.jpg/);
  assert.match(homepage, /225850-RT20_QX5EZXK4B9YV/);
  assert.doesNotMatch(homepage.match(/<!-- COA \/ VERIFICATION -->([\s\S]*?)<section class="home-international-section"/)?.[1] || '', /GHK-2026-05-A|208700-GHKCu/);
  assert.match(heroBatch, /PRODUCTS\.RT20/);
});
