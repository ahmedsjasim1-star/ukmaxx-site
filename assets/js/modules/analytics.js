const VISITOR_KEY = 'ukmaxx_analytics_visitor';
const SESSION_KEY = 'ukmaxx_analytics_session';
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

function sessionId() {
  const now = Date.now();
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.id && Number(parsed.lastSeen || 0) > now - SESSION_TIMEOUT_MS) {
      parsed.lastSeen = now;
      localStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
      return parsed.id;
    }
    const next = { id: uuid(), lastSeen: now };
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    return next.id;
  } catch {
    return uuid();
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

export function trackEvent(eventType, extra = {}) {
  try {
    const path = window.location.pathname || '/';
    const ignored = storageGet(IGNORE_KEY) === 'true';
    if (ignored || path.endsWith('/admin.html')) return;

    const payload = {
      type: 'track-event',
      eventType,
      visitorId: visitorId(),
      sessionId: sessionId(),
      pagePath: path + window.location.search + window.location.hash,
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

}
