const SESSION_KEY = 'ukmaxx_analytics_session';
const ENDPOINT = '/api/track-order';

function uuid() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function sessionId() {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
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
    const payload = {
      type: 'track-event',
      eventType,
      sessionId: sessionId(),
      pagePath: window.location.pathname + window.location.search + window.location.hash,
      pageTitle: document.title,
      referrer: document.referrer || '',
      utmSource: utm('utm_source'),
      utmMedium: utm('utm_medium'),
      utmCampaign: utm('utm_campaign'),
      deviceType: deviceType(),
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
