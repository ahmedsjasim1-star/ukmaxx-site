const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('journey analytics waits for consent and then records first-touch context', async () => {
  const storage = new Map();
  global.localStorage = {
    getItem: (key) => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
  };
  const browserWindow = new EventTarget();
  browserWindow.location = {
    pathname: '/',
    search: '?utm_source=google&utm_medium=organic&utm_campaign=launch',
    hash: '',
  };
  browserWindow.innerWidth = 390;
  global.window = browserWindow;
  global.document = { title: 'UKMAXX', referrer: 'https://www.google.com/' };

  let beacons = 0;
  Object.defineProperty(global, 'navigator', {
    configurable: true,
    value: {
      language: 'en-GB',
      sendBeacon: () => { beacons += 1; return true; },
    },
  });

  const filename = path.join(__dirname, '..', 'assets', 'js', 'modules', 'analytics.js');
  const source = fs.readFileSync(filename, 'utf8');
  const analytics = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

  assert.deepEqual(analytics.getAnalyticsContext(), {});
  analytics.setupAnalytics();
  assert.equal(beacons, 0);

  storage.set('ukmaxx_cookies_v1', 'accepted');
  const consent = new Event('ukmaxx:cookie-consent');
  consent.detail = 'accepted';
  browserWindow.dispatchEvent(consent);

  assert.equal(beacons, 1);
  const context = analytics.getAnalyticsContext();
  assert.equal(context.firstSource, 'Google');
  assert.equal(context.firstLandingPage, '/?utm_source=google&utm_medium=organic&utm_campaign=launch');
  assert.equal(context.firstUtmCampaign, 'launch');
  assert.equal(context.deviceType, 'mobile');
  assert.ok(context.visitorId);
  assert.ok(context.sessionId);
});

