const VISITOR_KEY = 'ukmaxx_analytics_visitor';
const SESSION_KEY = 'ukmaxx_analytics_session';
const FIRST_TOUCH_KEY = 'ukmaxx_analytics_first_touch';
const ACCOUNT_LINK_KEY = 'ukmaxx_analytics_account_link';
const COOKIE_KEY = 'ukmaxx_cookies_v1';
const IGNORE_KEY = 'ukmaxx_analytics_ignore';
const ENDPOINT = '/api/track-order';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

function uuid() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return '';
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function visitorId() {
  let id = storageGet(VISITOR_KEY);
  if (!id) {
    id = uuid();
    storageSet(VISITOR_KEY, id);
  }
  return id;
}

function currentPath() {
  return (window.location.pathname || '/') + window.location.search + window.location.hash;
}

function sourceFrom(referrer = '', utmSource = '') {
  const source = String(utmSource || '').trim().toLowerCase();
  let host = '';
  try {
    host = new URL(referrer).hostname.replace(/^www\./, '').toLowerCase();
  } catch {}
  const value = source || host;
  if (!value) return 'Direct';
  if (/ukmaxx\.co\.uk$/.test(value)) return 'Internal navigation';
  if (/(^|\.)(t\.co|x\.com|twitter\.com)$/.test(value) || value.includes('twitter') || value === 'x') return 'X / Twitter';
  if (/(^|\.)(t\.me|telegram\.org)$/.test(value) || value.includes('telegram')) return 'Telegram';
  if (value.includes('google')) return 'Google';
  if (value.includes('bing')) return 'Bing';
  if (value.includes('facebook') || value.includes('instagram') || value.includes('meta')) return 'Meta';
  if (value.includes('whatsapp')) return 'WhatsApp';
  return host || source || 'Referral';
}

function touchNow() {
  const referrer = document.referrer || '';
  const utmSource = utm('utm_source');
  return {
    source: sourceFrom(referrer, utmSource),
    referrer,
    landingPage: currentPath(),
    utmSource,
    utmMedium: utm('utm_medium'),
    utmCampaign: utm('utm_campaign'),
    seenAt: new Date().toISOString(),
  };
}

function firstTouch() {
  try {
    const stored = JSON.parse(storageGet(FIRST_TOUCH_KEY) || 'null');
    if (stored?.landingPage) return stored;
  } catch {}
  const touch = touchNow();
  storageSet(FIRST_TOUCH_KEY, JSON.stringify(touch));
  return touch;
}

function sessionState() {
  const now = Date.now();
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.id && Number(parsed.lastSeen || 0) > now - SESSION_TIMEOUT_MS) {
      parsed.lastSeen = now;
      if (!parsed.touch?.landingPage) parsed.touch = touchNow();
      localStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
      return parsed;
    }
    const next = { id: uuid(), startedAt: now, lastSeen: now, touch: touchNow() };
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    return next;
  } catch {
    return { id: uuid(), startedAt: now, lastSeen: now, touch: touchNow() };
  }
}

function deviceType() {
  const width = window.innerWidth || 1280;
  if (width < 760) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

function utm(name) {
  return new URLSearchParams(window.location.search).get(name) || '';
}

export function getAnalyticsContext() {
  if (storageGet(COOKIE_KEY) !== 'accepted') return {};
  const session = sessionState();
  const first = firstTouch();
  return {
    visitorId: visitorId(),
    sessionId: session.id,
    firstSource: first.source || 'Direct',
    firstReferrer: first.referrer || '',
    firstLandingPage: first.landingPage || '/',
    firstSeenAt: first.seenAt || '',
    firstUtmSource: first.utmSource || '',
    firstUtmMedium: first.utmMedium || '',
    firstUtmCampaign: first.utmCampaign || '',
    conversionSource: session.touch?.source || 'Direct',
    conversionReferrer: session.touch?.referrer || '',
    conversionLandingPage: session.touch?.landingPage || '/',
    conversionUtmSource: session.touch?.utmSource || '',
    conversionUtmMedium: session.touch?.utmMedium || '',
    conversionUtmCampaign: session.touch?.utmCampaign || '',
    deviceType: deviceType(),
  };
}

export async function linkAccountAnalytics(accessToken, userId = '') {
  if (!accessToken || storageGet(IGNORE_KEY) === 'true' || storageGet(COOKIE_KEY) !== 'accepted') return;
  try {
    const context = getAnalyticsContext();
    const linkKey = `${userId || 'account'}:${context.sessionId}`;
    if (storageGet(ACCOUNT_LINK_KEY) === linkKey) return;
    const response = await fetch('/api/order-admin?type=link-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ analyticsContext: context }),
      keepalive: true,
    });
    if (response.status === 204) storageSet(ACCOUNT_LINK_KEY, linkKey);
  } catch {}
}

export function trackEvent(eventType, extra = {}) {
  try {
    const path = window.location.pathname || '/';
    const ignored = storageGet(IGNORE_KEY) === 'true';
    if (ignored || path.endsWith('/admin.html') || storageGet(COOKIE_KEY) !== 'accepted') return;

    const analytics = getAnalyticsContext();
    const payload = {
      type: 'track-event',
      eventType,
      visitorId: analytics.visitorId,
      sessionId: analytics.sessionId,
      pagePath: currentPath(),
      pageTitle: document.title,
      referrer: document.referrer || '',
      utmSource: utm('utm_source'),
      utmMedium: utm('utm_medium'),
      utmCampaign: utm('utm_campaign'),
      deviceType: deviceType(),
      isInternal: false,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      language: navigator.language || '',
      ...extra,
    };
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(ENDPOINT, blob);
      return;
    }
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

window.ukmaxxAnalytics = window.ukmaxxAnalytics || {};
window.ukmaxxAnalytics.ignoreThisBrowser = () => storageSet(IGNORE_KEY, 'true');
window.ukmaxxAnalytics.trackThisBrowser = () => storageSet(IGNORE_KEY, 'false');
window.ukmaxxAnalytics.isIgnored = () => storageGet(IGNORE_KEY) === 'true';

export function setupAnalytics() {
  let started = false;
  const start = () => {
    if (started || storageGet(COOKIE_KEY) !== 'accepted') return;
    started = true;
    trackEvent('page_view');

    const params = new URLSearchParams(window.location.search);
    const sku = params.get('sku');
    if (window.location.pathname.endsWith('/product.html') && sku) {
      trackEvent('product_view', { productSku: sku });
    }

    const paymentReturn = params.get('payment');
    const status = String(params.get('status') || '').toLowerCase();
    if (paymentReturn === 'success' || (paymentReturn === 'fena-return' && status === 'paid')) {
      trackEvent('payment_success');
    } else if (paymentReturn === 'cancelled' || (paymentReturn === 'fena-return' && ['rejected', 'cancelled', 'overdue', 'refund rejected'].includes(status))) {
      trackEvent('payment_failed');
    }
  };

  start();
  window.addEventListener('ukmaxx:cookie-consent', (event) => {
    if (event.detail === 'accepted') start();
  }, { once: true });
}
