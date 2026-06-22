const test = require('node:test');
const assert = require('node:assert/strict');

function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
}

test('direct order administration rejects requests without an admin key', async () => {
  process.env.ADMIN_API_KEY = 'test-admin-secret';
  const handler = require('../api/order-admin');
  const res = response();
  await handler({ method: 'POST', headers: {}, body: { action: 'refund', orderNumber: 'UKX-TEST' } }, res);
  assert.equal(res.statusCode, 401);
});

test('direct order administration validates actions before touching the database', async () => {
  process.env.ADMIN_API_KEY = 'test-admin-secret';
  const handler = require('../api/order-admin');
  const res = response();
  await handler({
    method: 'POST',
    headers: { 'x-admin-key': 'test-admin-secret' },
    body: { action: 'not-real', orderNumber: 'UKX-TEST' },
  }, res);
  assert.equal(res.statusCode, 400);
});

test('checkout refuses to operate without Stripe configuration', async () => {
  delete process.env.STRIPE_SECRET_KEY;
  const handler = require('../api/create-checkout-session');
  const res = response();
  await handler({ method: 'POST', headers: {}, body: {} }, res);
  assert.equal(res.statusCode, 503);
});

test('tracking requires an authenticated Supabase session', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  const handler = require('../api/track-order');
  const res = response();
  await handler({ method: 'POST', headers: {}, body: { reference: 'UKX-TEST' } }, res);
  assert.equal(res.statusCode, 401);
});

test('Telegram endpoint is unavailable until its webhook secret is configured', async () => {
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_CHAT_ID = '123';
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  const handler = require('../api/telegram-bot');
  const res = response();
  await handler({ method: 'POST', headers: {}, body: {} }, res);
  assert.equal(res.statusCode, 503);
});

test('Stripe webhook is unavailable until both Stripe secrets are configured', async () => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  const handler = require('../api/stripe-webhook');
  const res = response();
  await handler({ method: 'POST', headers: {} }, res);
  assert.equal(res.statusCode, 503);
});
