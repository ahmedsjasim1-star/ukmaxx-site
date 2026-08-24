const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('dedicated review page is private to search and supports moderated identity and photos', () => {
  const html = read('review.html');
  assert.match(html, /noindex,nofollow/);
  assert.match(html, /reviewDisplayMode/);
  assert.match(html, /reviewImages/);
  assert.match(html, /reviewConsent/);
});

test('review API reuses track-order and enforces verified order and private image storage', () => {
  const api = read('api/track-order.js');
  assert.match(api, /review-order-options/);
  assert.match(api, /order\.status !== 'delivered'/);
  assert.match(api, /storage\.from\('review-images'\)/);
  assert.match(api, /review_already_exists/);
});

test('review approval publishes the selected identity and moderated image paths', () => {
  const bot = read('api/telegram-bot.js');
  assert.match(bot, /display_name: review\.display_name/);
  assert.match(bot, /image_paths: Array\.isArray\(review\.image_paths\)/);
  assert.match(bot, /source_review_id: review\.id/);
});

test('review emails link to the dedicated verified-review page', () => {
  const email = read('api/_lib/email.js');
  assert.doesNotMatch(email, /\?review=1&order=/);
  assert.match(email, /\/review\.html\?order=/);
});
