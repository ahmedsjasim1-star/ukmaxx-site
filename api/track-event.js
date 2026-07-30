const { getSupabaseAdmin } = require('./_lib/supabase');

const ALLOWED_EVENTS = new Set([
  'page_view',
  'product_view',
  'add_to_cart',
  'checkout_opened',
  'payment_started',
  'payment_success',
  'payment_failed',
  'review_opened',
]);

function clean(value, max = 240) {
  return String(value || '').trim().slice(0, max);
}

function cleanPath(value) {
  const raw = clean(value, 500);
  if (!raw || !raw.startsWith('/')) return '/';
  return raw.replace(/[^\w\-./?=&%#:+]/g, '').slice(0, 500);
}

function cleanSessionId(value) {
  return clean(value, 80).replace(/[^a-z0-9_-]/gi, '').slice(0, 80);
}

function detectDevice(userAgent = '') {
  const ua = String(userAgent || '').toLowerCase();
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobile|iphone|android/.test(ua)) return 'mobile';
  return 'desktop';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const eventType = clean(body.eventType, 40);
    if (!ALLOWED_EVENTS.has(eventType)) return res.status(400).json({ error: 'Invalid event type' });

    const sessionId = cleanSessionId(body.sessionId);
    if (!sessionId || sessionId.length < 10) return res.status(400).json({ error: 'Invalid session' });

    const userAgent = clean(req.headers['user-agent'], 320);
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('site_events').insert({
      event_type: eventType,
      session_id: sessionId,
      page_path: cleanPath(body.pagePath),
      page_title: clean(body.pageTitle, 180),
      product_sku: clean(body.productSku, 40).toUpperCase() || null,
      referrer: clean(body.referrer, 500) || null,
      utm_source: clean(body.utmSource, 80) || null,
      utm_medium: clean(body.utmMedium, 80) || null,
      utm_campaign: clean(body.utmCampaign, 120) || null,
      device_type: clean(body.deviceType, 30) || detectDevice(userAgent),
    });

    if (error) {
      console.error('site-event-insert-error', { message: error.message });
      return res.status(202).json({ ok: false });
    }

    return res.status(204).end();
  } catch (err) {
    console.error('site-event-error', { message: err?.message });
    return res.status(202).json({ ok: false });
  }
};
