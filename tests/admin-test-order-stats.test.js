const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('blocked storage keeps visitor and session stable during a page visit', async () => {
  global.localStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  global.window = { location: { pathname: '/', search: '', hash: '' }, innerWidth: 390 };
  global.document = { referrer: '', title: 'Test' };
  const src = fs.readFileSync(path.join(root, 'assets/js/modules/analytics.js'), 'utf8');
  const mod = await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
  const a = mod.getAnalyticsContext();
  const b = mod.getAnalyticsContext();
  assert.equal(a.visitorId, b.visitorId);
  assert.equal(a.sessionId, b.sessionId);
});

test('dashboard excludes tests without removing operational orders; journeys dedupe orders', async () => {
  const source = fs.readFileSync(path.join(root, 'api/order-admin.js'), 'utf8');
  const context = { require: () => ({}), module: { exports: {} }, process: { env: {} }, console, Date, Set, Map };
  vm.createContext(context);
  vm.runInContext(source + '\nthis.audit = { buildDashboard, visitorJourneys };', context);
  const orders = [
    { id: 'real', order_number: 'REAL', total: 100, status: 'delivered', email: 'real@example.com', created_at: '2026-09-01T12:00:00Z' },
    { id: 'test', order_number: 'TEST', total: 14, status: 'processing', email: 'test@example.com', created_at: '2026-08-01T12:00:00Z' },
  ];
  const events = [{ visitor_id: 'v', session_id: 's', event_type: 'page_view', page_path: '/', created_at: '2026-09-01T12:00:00Z' }];
  const attempts = [{ order_id: 'real', visitor_id: 'v', created_at: '2026-09-01T12:00:00Z' }, { order_id: 'real', visitor_id: 'v', created_at: '2026-09-01T12:00:00Z' }];
  const rows = context.audit.visitorJourneys(events, [], attempts, orders, [], null);
  assert.equal(rows[0].orderNumbers.length, 1);
  assert.equal(rows[0].revenue, 100);
  const tables = { orders, site_events: events, payment_attempts: attempts, admin_order_stat_exclusions: [{ order_id: 'test', reason: 'Test' }] };
  const db = { from(name) { const q = { select() { return q; }, order() { return q; }, range() { return q; }, limit() { return q; }, eq() { return q; }, then(resolve) { resolve({ data: tables[name] || [], error: null }); } }; return q; } };
  const data = await context.audit.buildDashboard(db);
  assert.equal(data.summary.allTimeRevenue, 100);
  assert.equal(data.orders.recent.length, 2);
  assert.equal(data.orders.recent.find(x => x.orderNumber === 'TEST').isTest, true);
  const all = Object.values(data.ranges).find(x => x.summary.orders === 1 && x.summary.revenue === 100);
  assert.ok(all);
  assert.ok(Object.values(data.rangesIncludingTests).some(x => x.summary.orders === 2 && x.summary.revenue === 114));
  assert.equal(data.testOrders.excludedRevenue, 14);
});
