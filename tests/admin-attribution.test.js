const test = require('node:test');
const assert = require('node:assert/strict');

const { __test } = require('../api/order-admin');

test('Fena is classified as a payment return rather than acquisition traffic', () => {
  assert.equal(__test.sourceLabel({ source_group: 'payment.fena.co' }), 'Payment return');
  assert.equal(__test.sourceLabel({ referrer: 'https://payment.fena.co/return' }), 'Payment return');
});

test('acquisition sources count unique visitors and preserve the original source', () => {
  const allPageViews = [
    { visitor_id: 'google-visitor', session_id: 'g1', source_group: 'Google', created_at: '2026-08-20T10:00:00Z' },
    { visitor_id: 'google-visitor', session_id: 'g2', source_group: 'payment.fena.co', created_at: '2026-08-20T10:20:00Z' },
    { visitor_id: 'direct-visitor', session_id: 'd1', source_group: 'Direct', created_at: '2026-08-20T11:00:00Z' },
  ];

  assert.deepEqual(__test.topVisitorSources(allPageViews, allPageViews), [
    { label: 'Direct', value: 1 },
    { label: 'Google', value: 1 },
  ]);
});

test('paid payment attempts are excluded from dropped checkouts', () => {
  const events = [
    {
      event_type: 'checkout_opened',
      session_id: 'paid-session',
      visitor_id: 'paid-visitor',
      created_at: '2026-08-20T10:00:00Z',
      page_path: '/catalogue.html',
      source_group: 'Google',
      cart_items: [{ sku: 'RT10', name: 'RETA 10MG', qty: 1, lineTotal: 44.99 }],
      cart_value: 44.99,
    },
    {
      event_type: 'payment_started',
      session_id: 'paid-session',
      visitor_id: 'paid-visitor',
      created_at: '2026-08-20T10:02:00Z',
      page_path: '/catalogue.html',
      source_group: 'Internal navigation',
    },
    {
      event_type: 'checkout_opened',
      session_id: 'open-session',
      visitor_id: 'open-visitor',
      created_at: '2026-08-20T11:00:00Z',
      page_path: '/catalogue.html',
      source_group: 'Direct',
      cart_items: [{ sku: 'BC5', name: 'BPC 157', qty: 1, lineTotal: 39.99 }],
      cart_value: 39.99,
    },
  ];
  const attempts = [{
    status: 'paid',
    order_id: 'order-1',
    session_id: 'paid-session',
    created_at: '2026-08-20T10:02:00Z',
  }];

  const rows = __test.checkoutDropoffs(
    events,
    [{ sku: 'RT10', name: 'RETA 10MG' }, { sku: 'BC5', name: 'BPC 157' }],
    attempts,
    new Date('2026-08-20T00:00:00Z'),
    new Date('2026-08-20T12:00:00Z'),
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].sessionId, 'open-session');
});
