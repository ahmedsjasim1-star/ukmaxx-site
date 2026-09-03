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
  assert.match(api, /order_reviews_complete/);
  assert.match(api, /submittedProducts/);
});

test('multi-product review flow offers the next unreviewed product without re-verification', () => {
  const html = read('review.html');
  const page = read('assets/js/pages/review-page.js');
  assert.match(html, /reviewAnotherProductBtn/);
  assert.match(page, /Review another product|reviewAnotherProduct/);
  assert.match(page, /still have.*product/);
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

test('automated reviews are cutoff-gated, delayed seven days and cron protected', () => {
  const admin = read('api/order-admin.js');
  const vercel = JSON.parse(read('vercel.json'));
  assert.match(admin, /2026-08-31T23:00:00\.000Z/);
  assert.match(admin, /7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(admin, /claim_automated_review_requests/);
  assert.match(admin, /CRON_SECRET/);
  assert.ok(vercel.crons.some((cron) => cron.path.includes('type=automated-reviews')));
});

test('review automation records provider ids and email failures', () => {
  const admin = read('api/order-admin.js');
  const email = read('api/_lib/email.js');
  const migration = read('supabase/migrations/20260903_automated_review_requests.sql');
  assert.match(email, /idempotencyKey/);
  assert.match(email, /Resend rejected email/);
  assert.match(admin, /review_request_email_id/);
  assert.match(admin, /review_request_last_error/);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /review_request_sent_at is null/i);
});

test('fulfilment emails use accurate review timing and tracking copy', () => {
  const dispatched = read('emails/dispatched.html');
  const delivered = read('emails/delivered.html');
  const review = read('emails/review-request.html');
  assert.match(dispatched, /Track with Royal Mail/);
  assert.doesNotMatch(dispatched, /Expected —/);
  assert.match(delivered, /check in after seven days/i);
  assert.doesNotMatch(delivered, /Available verified batches/);
  assert.match(review, /It has been seven days/);
  assert.match(review, /Photos are optional/);
  assert.match(review, /review each one separately/);
});
