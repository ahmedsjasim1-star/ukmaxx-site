const crypto = require('crypto');
const Stripe = require('stripe');
const { getSupabaseAdmin } = require('./_lib/supabase');
const {
  sendOrderDispatchedEmail,
  sendOrderDeliveredEmail,
  sendOrderCancelledEmail,
  sendOrderRefundedEmail,
  sendReviewRequestEmail,
} = require('./_lib/email');
const { syncRoyalMailOrderToSupabase } = require('./_lib/royalmail');

const ACTIONS = ['dispatch', 'deliver', 'cancel', 'refund', 'send-review-request', 'create-label'];
const PAID_STATUSES = new Set(['paid', 'processing', 'dispatched', 'delivered']);
const FINAL_BAD_STATUSES = new Set(['cancelled', 'refunded']);
const BUNDLE_COMPONENTS = {
  RT10X3: { RT10: 3, WA10: 1 },
  RT20X3: { RT20: 3, WA10: 1 },
  BC5X3: { BC5: 3, WA10: 1 },
  GHKCUX3: { GHKCU: 3, WA10: 1 },
  UKXRB1: { RT10: 1, BC5: 1, GHKCU: 1, WA10: 1 },
};
const RANGE_DEFINITIONS = [
  { key: '1h', label: 'Last hour', ms: 60 * 60 * 1000 },
  { key: '24h', label: 'Last 24 hours', ms: 24 * 60 * 60 * 1000 },
  { key: '72h', label: 'Last 72 hours', ms: 72 * 60 * 60 * 1000 },
  { key: '7d', label: 'Last 7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', label: 'Last 30 days', ms: 30 * 24 * 60 * 60 * 1000 },
  { key: '1y', label: 'Last year', ms: 365 * 24 * 60 * 60 * 1000 },
  { key: 'all', label: 'All time', ms: null },
];
const AUTOMATED_REVIEW_ORDER_CUTOFF = '2026-08-31T23:00:00.000Z';
const REVIEW_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

function isAuthorized(req) {
  const expected = process.env.ADMIN_API_KEY || '';
  const supplied = String(req.headers['x-admin-key'] || '');
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isCronAuthorized(req) {
  const secret = process.env.CRON_SECRET || '';
  const supplied = String(req.headers.authorization || '');
  if (!secret || !supplied) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

module.exports = async (req, res) => {
  if (req.method === 'GET' && req.query?.type === 'automated-reviews') return handleAutomatedReviews(req, res);
  if (req.method === 'GET' && req.query?.type === 'dashboard') return handleDashboard(req, res);
  if (req.method === 'POST' && req.query?.type === 'link-account') return handleAccountAnalyticsLink(req, res);
  if (req.method === 'POST' && req.query?.type === 'release-loyalty-reward') return handleReleaseLoyaltyReward(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const {
    action, orderNumber, trackingNumber, expectedDate, packedDate,
    dispatchedDate, deliveredTime, reason, refund,
  } = req.body || {};
  if (!action || !ACTIONS.includes(action)) {
    return res.status(400).json({ error: `Invalid action. Must be one of: ${ACTIONS.join(', ')}` });
  }
  if (!orderNumber) return res.status(400).json({ error: 'orderNumber is required' });

  try {
    const supabase = getSupabaseAdmin();
    const ctx = { req, res, supabase };

    if (action === 'dispatch') return handleDispatch(ctx, { orderNumber, trackingNumber, expectedDate, packedDate, dispatchedDate });
    if (action === 'deliver') return handleDeliver(ctx, { orderNumber, deliveredTime });
    if (action === 'cancel') return handleCancel(ctx, { orderNumber, reason, refund });
    if (action === 'refund') return handleRefund(ctx, { orderNumber, reason });
    if (action === 'create-label') return handleCreateLabel(ctx, { orderNumber });
    return handleReviewRequest(ctx, { orderNumber });
  } catch (err) {
    console.error(`order-admin-${action}-error`, { message: err?.message, stack: err?.stack });
    return res.status(500).json({ error: `Failed to ${action} order` });
  }
};

function cleanAnalyticsValue(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function cleanAnalyticsId(value) {
  return cleanAnalyticsValue(value, 80).replace(/[^a-z0-9_-]/gi, '').slice(0, 80);
}

function cleanAnalyticsPath(value) {
  const path = cleanAnalyticsValue(value, 500);
  if (!path || !path.startsWith('/')) return '/';
  return path.replace(/[^\w\-./?=&%#:+]/g, '').slice(0, 500);
}

async function handleAccountAnalyticsLink(req, res) {
  try {
    const authorization = String(req.headers.authorization || '');
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'Sign in required' });

    const supabase = getSupabaseAdmin();
    const authResult = await supabase.auth.getUser(token);
    const user = authResult.data?.user;
    if (authResult.error || !user?.id) return res.status(401).json({ error: 'Invalid session' });

    const context = req.body?.analyticsContext || {};
    const visitorId = cleanAnalyticsId(context.visitorId);
    const sessionId = cleanAnalyticsId(context.sessionId);
    if (!visitorId || !sessionId) return res.status(204).end();

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    const update = {
      analytics_visitor_id: visitorId,
      analytics_session_id: sessionId,
      first_source: profile?.first_source || cleanAnalyticsValue(context.firstSource, 120) || 'Direct',
      first_referrer: profile?.first_referrer || cleanAnalyticsValue(context.firstReferrer, 500) || null,
      first_landing_page: profile?.first_landing_page || cleanAnalyticsPath(context.firstLandingPage),
      first_seen_at: profile?.first_seen_at || cleanAnalyticsValue(context.firstSeenAt, 40) || new Date().toISOString(),
      first_utm_source: profile?.first_utm_source || cleanAnalyticsValue(context.firstUtmSource, 80) || null,
      first_utm_medium: profile?.first_utm_medium || cleanAnalyticsValue(context.firstUtmMedium, 80) || null,
      first_utm_campaign: profile?.first_utm_campaign || cleanAnalyticsValue(context.firstUtmCampaign, 120) || null,
      last_linked_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('profiles').update(update).eq('id', user.id);
    if (error && !/column .* does not exist|schema cache/i.test(String(error.message || ''))) throw error;
    return res.status(204).end();
  } catch (error) {
    console.error('link-account-analytics-error', { message: error?.message });
    return res.status(202).json({ ok: false });
  }
}

function allowedAdminEmails() {
  return String(process.env.ADMIN_EMAILS || 'support@ukmaxx.co.uk')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function requireAdminUser(req) {
  const authorization = String(req.headers.authorization || '');
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return { error: 'missing_token' };

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.email) return { error: 'invalid_token' };

  const email = String(data.user.email || '').toLowerCase();
  if (!allowedAdminEmails().includes(email)) return { error: 'forbidden', email };
  return { supabase, user: data.user, email };
}

async function handleDashboard(req, res) {
  try {
    const auth = await requireAdminUser(req);
    if (auth.error === 'missing_token' || auth.error === 'invalid_token') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (auth.error === 'forbidden') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const data = await buildDashboard(auth.supabase);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      adminEmail: auth.email,
      generatedAt: new Date().toISOString(),
      ...data,
    });
  } catch (err) {
    console.error('admin-dashboard-error', { message: err?.message, stack: err?.stack });
    return res.status(500).json({ error: 'Failed to load dashboard' });
  }
}

async function handleReleaseLoyaltyReward(req, res) {
  try {
    const auth = await requireAdminUser(req);
    if (auth.error === 'missing_token' || auth.error === 'invalid_token') return res.status(401).json({ error: 'Unauthorized' });
    if (auth.error === 'forbidden') return res.status(403).json({ error: 'Forbidden' });

    const rewardId = String(req.body?.rewardId || '').trim();
    if (!rewardId || req.body?.confirmAbandoned !== true) return res.status(400).json({ error: 'Confirmed reward reservation is required.' });

    const { data: reward, error: rewardError } = await auth.supabase
      .from('loyalty_rewards')
      .select('id,member_id,reward_code,status,reserved_reference,reserved_at')
      .eq('id', rewardId)
      .maybeSingle();
    if (rewardError) throw rewardError;
    if (!reward) return res.status(404).json({ error: 'Reward reservation not found.' });
    if (reward.status !== 'reserved') return res.status(409).json({ error: 'This reward is no longer reserved.' });

    const reservedAt = new Date(reward.reserved_at || 0).getTime();
    if (!reservedAt || Date.now() - reservedAt < 2 * 60 * 60 * 1000) {
      return res.status(409).json({ error: 'Wait at least two hours before releasing a payment reservation.' });
    }

    const { data: attempt, error: attemptError } = await auth.supabase
      .from('payment_attempts')
      .select('id,status,order_id,provider_payment_id,payment_reference')
      .eq('payment_provider', 'fena')
      .eq('payment_reference', reward.reserved_reference)
      .maybeSingle();
    if (attemptError) throw attemptError;
    const paymentStatus = String(attempt?.status || '').toLowerCase();
    if (attempt?.order_id || ['paid', 'completed', 'success', 'succeeded'].includes(paymentStatus)) {
      return res.status(409).json({ error: 'This payment completed; the reward cannot be released.' });
    }

    const { data: released, error: releaseError } = await auth.supabase
      .from('loyalty_rewards')
      .update({ status: 'available', reserved_reference: null, reserved_at: null })
      .eq('id', reward.id)
      .eq('status', 'reserved')
      .select('id')
      .maybeSingle();
    if (releaseError) throw releaseError;
    if (!released) return res.status(409).json({ error: 'The reward changed before it could be released.' });

    await audit(auth.supabase, 'loyalty_reward_released', null, {
      reward_id: reward.id,
      reward_code: reward.reward_code,
      payment_reference: reward.reserved_reference,
      payment_status: paymentStatus || 'unknown',
      released_by: auth.email,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('release-loyalty-reward-error', { message: err?.message, stack: err?.stack });
    return res.status(500).json({ error: 'Unable to release this reward reservation.' });
  }
}

async function safeSelect(supabase, table, select, options = {}) {
  const requestedLimit = Math.max(1, Math.min(Number(options.limit || 1000), 20000));
  const pageSize = Math.min(1000, requestedLimit);
  const rows = [];

  for (let offset = 0; offset < requestedLimit; offset += pageSize) {
    let query = supabase.from(table).select(select);
    if (options.order) query = query.order(options.order.column, { ascending: options.order.ascending });
    query = query.range(offset, Math.min(offset + pageSize - 1, requestedLimit - 1));
    const { data, error } = await query;
    if (error) {
      console.error('admin-dashboard-query-error', { table, message: error.message });
      return rows;
    }
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function asNumber(value) {
  return Number(value || 0);
}

function money(value) {
  return Number(asNumber(value).toFixed(2));
}

function isSince(row, from) {
  if (!from) return true;
  return new Date(row.created_at || 0).getTime() >= from.getTime();
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = String(row[key] || 'unknown').toLowerCase();
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function uniqueBy(rows, key) {
  return new Set(rows.map((row) => row[key]).filter(Boolean)).size;
}

function uniqueVisitorCount(rows) {
  return new Set(rows.map((row) => row.visitor_id || row.session_id).filter(Boolean)).size;
}

function uniqueSessionCount(rows) {
  return uniqueBy(rows, 'session_id');
}

function cleanPath(path = '') {
  const raw = String(path || '/');
  return raw.split('#')[0].split('?')[0] || '/';
}

function topCounts(rows, getLabel, limit = 6) {
  const map = new Map();
  for (const row of rows) {
    const label = getLabel(row);
    if (!label) continue;
    map.set(label, (map.get(label) || 0) + 1);
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function sourceLabel(event) {
  const grouped = String(event.source_group || '').trim();
  if (/^(payment\.)?fena\.co$/i.test(grouped)) return 'Payment return';
  if (grouped) return grouped;
  if (event.utm_source) {
    const source = String(event.utm_source).trim();
    if (/^(payment\.)?fena\.co$/i.test(source)) return 'Payment return';
    return source;
  }
  if (!event.referrer) return 'Direct';
  try {
    const host = new URL(event.referrer).hostname.replace(/^www\./, '').toLowerCase();
    if (!host) return 'Referral';
    if (/ukmaxx\.co\.uk$/.test(host)) return 'Internal navigation';
    if (/^(payment\.)?fena\.co$/.test(host)) return 'Payment return';
    if (['t.co', 'x.com', 'twitter.com'].includes(host)) return 'X / Twitter';
    if (['t.me', 'telegram.org'].includes(host)) return 'Telegram';
    if (host.includes('google') || host.includes('googlequicksearchbox')) return 'Google';
    if (host.includes('bing')) return 'Bing';
    return host;
  } catch {
    return 'Referral';
  }
}

function topVisitorSources(allPageViews, scopedPageViews, limit = 6) {
  const activeVisitors = new Set(scopedPageViews.map((event) => event.visitor_id || event.session_id).filter(Boolean));
  const byVisitor = new Map();
  const sorted = [...allPageViews].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  for (const event of sorted) {
    const visitor = event.visitor_id || event.session_id;
    if (!visitor || !activeVisitors.has(visitor) || byVisitor.has(visitor)) continue;
    const label = sourceLabel(event);
    if (label === 'Internal navigation' || label === 'Payment return') continue;
    byVisitor.set(visitor, label);
  }
  const rows = [...activeVisitors]
    .map((visitor) => byVisitor.get(visitor))
    .filter(Boolean)
    .map((label) => ({ label }));
  return topCounts(rows, (row) => row.label, limit);
}

function topUniqueLabels(rows, getLabel, getIdentity, limit = 8) {
  const seen = new Set();
  const counts = new Map();
  for (const row of rows) {
    const label = getLabel(row);
    const identity = getIdentity(row);
    if (!label || !identity) continue;
    const key = `${label}::${identity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function locationLabel(event) {
  const city = String(event.city || '').trim();
  const region = String(event.region || '').trim();
  const country = String(event.country || '').trim().toUpperCase();
  if (city && country) return `${city}, ${country}`;
  if (region && country) return `${region}, ${country}`;
  if (country) return country;
  return 'Unknown';
}

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function sumRevenue(rows) {
  return money(rows.reduce((sum, order) => sum + asNumber(order.total), 0));
}

function averageOrderValue(rows) {
  return rows.length ? money(sumRevenue(rows) / rows.length) : 0;
}

function periodSummary(orders, from) {
  const rows = orders.filter((order) => PAID_STATUSES.has(order.status) && isSince(order, from));
  return {
    orders: rows.length,
    revenue: sumRevenue(rows),
    averageOrderValue: averageOrderValue(rows),
  };
}

function topProducts(orders, items) {
  const paidOrderIds = new Set(orders.filter((order) => PAID_STATUSES.has(order.status)).map((order) => order.id));
  const map = new Map();
  for (const item of items) {
    if (!paidOrderIds.has(item.order_id)) continue;
    const sku = item.sku || 'UNKNOWN';
    const current = map.get(sku) || { sku, name: item.product_name || sku, quantity: 0, revenue: 0 };
    current.quantity += asNumber(item.qty);
    current.revenue = money(current.revenue + asNumber(item.line_total));
    map.set(sku, current);
  }
  return [...map.values()]
    .sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity)
    .slice(0, 6);
}

function revenueByProduct(orders, items) {
  return topProducts(orders, items).map((product) => ({
    label: product.name,
    value: product.revenue,
  }));
}

function customerStats(orders) {
  const paid = orders.filter((order) => PAID_STATUSES.has(order.status));
  const customers = new Map();
  for (const order of paid) {
    const email = String(order.email || '').toLowerCase();
    if (!email) continue;
    const current = customers.get(email) || { orders: 0, revenue: 0 };
    current.orders += 1;
    current.revenue += asNumber(order.total);
    customers.set(email, current);
  }
  const repeat = [...customers.values()].filter((customer) => customer.orders > 1);
  return {
    uniqueCustomers: customers.size,
    repeatCustomers: repeat.length,
    repeatRate: customers.size ? Math.round((repeat.length / customers.size) * 100) : 0,
  };
}

function subscriberStats(rows, from) {
  const active = rows.filter((subscriber) => String(subscriber.status || '').toLowerCase() === 'active');
  const unsubscribed = rows.filter((subscriber) => String(subscriber.status || '').toLowerCase() === 'unsubscribed');
  const scoped = rows.filter((subscriber) => isSince(subscriber, from));
  const scopedActive = scoped.filter((subscriber) => String(subscriber.status || '').toLowerCase() === 'active');

  return {
    active: active.length,
    unsubscribed: unsubscribed.length,
    newInRange: scopedActive.length,
    recent: scoped
      .slice()
      .sort((a, b) => new Date(b.created_at || b.updated_at || 0) - new Date(a.created_at || a.updated_at || 0))
      .slice(0, 100)
      .map((subscriber) => ({
        email: subscriber.email,
        topics: Array.isArray(subscriber.topics) ? subscriber.topics : [],
        status: subscriber.status || 'active',
        createdAt: subscriber.created_at,
        updatedAt: subscriber.updated_at,
      })),
  };
}

function stockSummary(products) {
  const bySku = new Map(products.map((product) => [product.sku, product]));
  const rows = products.map((product) => ({
    sku: product.sku,
    name: product.name,
    stock: asNumber(product.stock_quantity),
    price: asNumber(product.price),
    active: Boolean(product.is_active),
  }));
  for (const [bundleSku, components] of Object.entries(BUNDLE_COMPONENTS)) {
    const bundle = bySku.get(bundleSku);
    if (!bundle) continue;
    const available = Math.max(0, Math.min(...Object.entries(components).map(([sku, qty]) => {
      return Math.floor(asNumber(bySku.get(sku)?.stock_quantity) / qty);
    })));
    const existing = rows.find((row) => row.sku === bundleSku);
    if (existing) existing.stock = available;
  }
  const lowStock = rows.filter((product) => product.active && product.stock <= 5);
  return {
    products: rows.sort((a, b) => a.sku.localeCompare(b.sku)),
    lowStock,
  };
}

function paymentSummary(attempts) {
  const counts = countBy(attempts, 'status');
  const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
  const abandoned = attempts.filter((attempt) => {
    const status = String(attempt.status || '').toLowerCase();
    return ['created', 'pending'].includes(status) && new Date(attempt.created_at || 0).getTime() < thirtyMinutesAgo;
  }).length;
  return {
    totalAttempts: attempts.length,
    counts,
    abandoned,
    rejectedOrCancelled: attempts.filter((attempt) => ['rejected', 'cancelled', 'overdue'].includes(String(attempt.status || '').toLowerCase())).length,
  };
}

function attemptContext(attempt = {}) {
  const analytics = attempt.payload?.analytics || {};
  return {
    visitorId: attempt.visitor_id || analytics.visitorId || '',
    sessionId: attempt.session_id || analytics.sessionId || '',
    accountUserId: attempt.account_user_id || attempt.payload?.user_id || '',
    checkoutType: attempt.checkout_type || attempt.payload?.checkout_type || 'guest',
    firstSource: attempt.first_source || analytics.firstSource || '',
    firstReferrer: attempt.first_referrer || analytics.firstReferrer || '',
    firstLandingPage: attempt.first_landing_page || analytics.firstLandingPage || '',
    firstSeenAt: attempt.first_seen_at || analytics.firstSeenAt || '',
    firstUtmSource: attempt.first_utm_source || analytics.firstUtmSource || '',
    firstUtmMedium: attempt.first_utm_medium || analytics.firstUtmMedium || '',
    firstUtmCampaign: attempt.first_utm_campaign || analytics.firstUtmCampaign || '',
    conversionSource: attempt.conversion_source || analytics.conversionSource || '',
    conversionReferrer: attempt.conversion_referrer || analytics.conversionReferrer || '',
    conversionLandingPage: attempt.conversion_landing_page || analytics.conversionLandingPage || '',
    conversionUtmSource: attempt.conversion_utm_source || analytics.conversionUtmSource || '',
    conversionUtmMedium: attempt.conversion_utm_medium || analytics.conversionUtmMedium || '',
    conversionUtmCampaign: attempt.conversion_utm_campaign || analytics.conversionUtmCampaign || '',
    device: attempt.device_type || analytics.deviceType || '',
    country: attempt.visitor_country || analytics.country || '',
    region: attempt.visitor_region || analytics.region || '',
    city: attempt.visitor_city || analytics.city || '',
  };
}

function eventLabel(event = {}) {
  const labels = {
    page_view: 'Page viewed',
    product_view: 'Product viewed',
    add_to_cart: 'Added to basket',
    checkout_opened: 'Checkout opened',
    payment_started: 'Pay by Bank started',
    payment_success: 'Payment return confirmed',
    payment_failed: 'Payment failed / returned',
    review_opened: 'Review form opened',
    whatsapp_support_click: 'WhatsApp support opened',
  };
  return labels[event.event_type] || String(event.event_type || 'Activity').replace(/_/g, ' ');
}

function eventJourney(events, productNames, orderCreatedAt = null) {
  const cutoff = orderCreatedAt ? new Date(orderCreatedAt).getTime() + (30 * 60 * 1000) : Number.POSITIVE_INFINITY;
  const eligible = events
    .filter((event) => eventTime(event) <= cutoff)
    .sort((a, b) => eventTime(a) - eventTime(b));
  const selected = eligible.length > 20
    ? [eligible[0], ...eligible.slice(-19)]
    : eligible;
  return selected.map((event) => {
    const sku = String(event.product_sku || '').toUpperCase();
    return {
      time: event.created_at,
      label: eventLabel(event),
      detail: productNames.get(sku) || sku || cleanPath(event.page_path),
      page: cleanPath(event.page_path),
    };
  });
}

function recentOrders(orders, items, attempts, events, profiles, audits, products) {
  const productNames = new Map(products.map((product) => [String(product.sku || '').toUpperCase(), product.name || product.sku]));
  const itemsByOrder = new Map();
  items.forEach((item) => {
    if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
    itemsByOrder.get(item.order_id).push({
      sku: item.sku,
      name: item.product_name || productNames.get(String(item.sku || '').toUpperCase()) || item.sku,
      qty: asNumber(item.qty),
      lineTotal: money(item.line_total),
    });
  });
  const attemptsByOrder = new Map();
  attempts.forEach((attempt) => {
    if (attempt.order_id) attemptsByOrder.set(attempt.order_id, attempt);
    if (attempt.payment_reference) attemptsByOrder.set(String(attempt.payment_reference).toUpperCase(), attempt);
  });
  const profilesByEmail = new Map(profiles.map((profile) => [String(profile.email || '').toLowerCase(), profile]));
  const auditsByOrder = new Map();
  audits.forEach((entry) => {
    if (!entry.order_id) return;
    if (!auditsByOrder.has(entry.order_id)) auditsByOrder.set(entry.order_id, []);
    auditsByOrder.get(entry.order_id).push(entry);
  });
  const ordersByEmail = new Map();
  orders.filter((order) => PAID_STATUSES.has(order.status)).forEach((order) => {
    const email = String(order.email || '').toLowerCase();
    if (!ordersByEmail.has(email)) ordersByEmail.set(email, []);
    ordersByEmail.get(email).push(order);
  });

  return orders.slice(0, 25).map((order) => {
    const attempt = attemptsByOrder.get(order.id) || attemptsByOrder.get(String(order.order_number || '').toUpperCase()) || {};
    const context = attemptContext(attempt);
    const visitorEvents = context.visitorId
      ? events.filter((event) => event.visitor_id === context.visitorId)
      : context.sessionId
        ? events.filter((event) => event.session_id === context.sessionId)
        : [];
    const preOrderEvents = visitorEvents
      .filter((event) => eventTime(event) <= new Date(order.created_at || 0).getTime())
      .sort((a, b) => eventTime(a) - eventTime(b));
    const visitsBeforeOrder = new Set(preOrderEvents.map((event) => event.session_id).filter(Boolean)).size;
    const earliestPageView = preOrderEvents.find((event) => event.event_type === 'page_view') || preOrderEvents[0];
    const conversionSessionEvent = preOrderEvents.find((event) => event.session_id === context.sessionId && event.event_type === 'page_view');
    const profile = profilesByEmail.get(String(order.email || '').toLowerCase());
    const customerOrders = ordersByEmail.get(String(order.email || '').toLowerCase()) || [];
    const timeline = eventJourney(visitorEvents, productNames, order.created_at);

    if (attempt.created_at) timeline.push({ time: attempt.created_at, label: 'Payment attempt created', detail: attempt.payment_provider || 'Pay by Bank' });
    timeline.push({ time: order.created_at, label: 'Payment confirmed', detail: order.order_number });
    const orderAudits = auditsByOrder.get(order.id) || [];
    const auditActions = new Set(orderAudits.map((entry) => entry.action));
    orderAudits.forEach((entry) => timeline.push({
      time: entry.created_at,
      label: String(entry.action || 'Order update').replace(/_/g, ' '),
      detail: entry.payload?.tracking_number || entry.payload?.source || '',
    }));
    if (order.dispatched_at && !auditActions.has('order_dispatched')) timeline.push({ time: order.dispatched_at, label: 'Order dispatched', detail: order.tracking_number || order.royalmail_tracking_number || '' });
    if (order.delivered_at && !auditActions.has('order_delivered')) timeline.push({ time: order.delivered_at, label: 'Order delivered', detail: '' });
    if (order.review_request_sent_at && !auditActions.has('review_request_sent')) timeline.push({ time: order.review_request_sent_at, label: 'Review request sent', detail: '' });
    timeline.sort((a, b) => new Date(a.time || 0) - new Date(b.time || 0));

    const location = [context.city, context.region, context.country].filter(Boolean).join(', ')
      || (earliestPageView ? locationLabel(earliestPageView) : 'Unknown');
    return {
      orderNumber: order.order_number,
      email: order.email,
      fullName: order.full_name,
      phone: order.phone,
      address: [order.shipping_address_line1, order.shipping_address_line2, order.shipping_city, order.shipping_postcode, order.shipping_country].filter(Boolean).join(', '),
      subtotal: asNumber(order.subtotal),
      discount: asNumber(order.discount),
      shipping: asNumber(order.shipping),
      total: asNumber(order.total),
      status: order.status,
      paymentProvider: order.payment_provider || 'fena',
      promoOptIn: Boolean(order.promo_opt_in),
      promoCode: attempt.payload?.promo_code || '',
      dispatchedAt: order.dispatched_at,
      deliveredAt: order.delivered_at,
      reviewRequestSentAt: order.review_request_sent_at,
      reviewRequestStatus: order.review_request_status || (order.review_request_sent_at ? 'sent' : 'not due'),
      reviewRequestAttempts: Number(order.review_request_attempts || 0),
      reviewRequestLastError: order.review_request_last_error || '',
      createdAt: order.created_at,
      trackingNumber: order.tracking_number || order.royalmail_tracking_number || '',
      trackingUrl: order.tracking_url || '',
      items: itemsByOrder.get(order.id) || [],
      visitorId: context.visitorId,
      sessionId: context.sessionId,
      checkoutType: context.checkoutType,
      accountCreatedAt: profile?.created_at || '',
      signupProvider: profile?.signup_provider || '',
      firstSource: context.firstSource || (earliestPageView ? sourceLabel(earliestPageView) : 'Unknown'),
      conversionSource: context.conversionSource || (conversionSessionEvent ? sourceLabel(conversionSessionEvent) : 'Unknown'),
      firstLandingPage: context.firstLandingPage || cleanPath(earliestPageView?.page_path),
      conversionLandingPage: context.conversionLandingPage || cleanPath(conversionSessionEvent?.page_path),
      firstCampaign: [context.firstUtmSource, context.firstUtmMedium, context.firstUtmCampaign].filter(Boolean).join(' / '),
      conversionCampaign: [context.conversionUtmSource, context.conversionUtmMedium, context.conversionUtmCampaign].filter(Boolean).join(' / '),
      firstSeenAt: context.firstSeenAt || earliestPageView?.created_at || '',
      location,
      device: context.device || conversionSessionEvent?.device_type || earliestPageView?.device_type || 'unknown',
      visitsBeforeOrder,
      returningVisitor: visitsBeforeOrder > 1,
      customerOrderCount: customerOrders.length,
      customerLifetimeValue: money(customerOrders.reduce((sum, customerOrder) => sum + asNumber(customerOrder.total), 0)),
      timeline,
    };
  });
}

function visitorRetention(events, from) {
  const pageViews = events
    .filter((event) => !event.is_internal && event.event_type === 'page_view' && (event.visitor_id || event.session_id))
    .sort((a, b) => eventTime(a) - eventTime(b));
  const byVisitor = new Map();
  pageViews.forEach((event) => {
    const id = event.visitor_id || event.session_id;
    const row = byVisitor.get(id) || { events: [], sessions: new Set() };
    row.events.push(event);
    if (event.session_id) row.sessions.add(event.session_id);
    byVisitor.set(id, row);
  });

  let newVisitors = 0;
  let returningVisitors = 0;
  for (const row of byVisitor.values()) {
    const scoped = from ? row.events.filter((event) => isSince(event, from)) : row.events;
    if (!scoped.length) continue;
    const existedBeforeRange = from && eventTime(row.events[0]) < from.getTime();
    const isReturning = existedBeforeRange || row.sessions.size > 1;
    if (isReturning) returningVisitors += 1;
    else newVisitors += 1;
  }
  return { newVisitors, returningVisitors };
}

function accountStats(profiles, from) {
  const scoped = profiles.filter((profile) => isSince(profile, from));
  return {
    total: profiles.length,
    newInRange: scoped.length,
    recent: scoped.slice(0, 100).map((profile) => ({
      id: profile.id,
      email: profile.email,
      name: [profile.first_name, profile.last_name].filter(Boolean).join(' ') || '—',
      provider: profile.signup_provider || 'account',
      createdAt: profile.created_at,
      firstSource: profile.first_source || 'Unknown',
      firstLandingPage: profile.first_landing_page || '',
      firstSeenAt: profile.first_seen_at || '',
      lastLinkedAt: profile.last_linked_at || '',
      visitorId: profile.analytics_visitor_id || '',
    })),
  };
}

function visitorJourneys(events, profiles, attempts, orders, products, from) {
  const productNames = new Map(products.map((product) => [String(product.sku || '').toUpperCase(), product.name || product.sku]));
  const profileByVisitor = new Map(profiles.filter((profile) => profile.analytics_visitor_id).map((profile) => [profile.analytics_visitor_id, profile]));
  const attemptsByVisitor = new Map();
  attempts.forEach((attempt) => {
    const context = attemptContext(attempt);
    if (!context.visitorId) return;
    if (!attemptsByVisitor.has(context.visitorId)) attemptsByVisitor.set(context.visitorId, []);
    attemptsByVisitor.get(context.visitorId).push(attempt);
  });
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const grouped = new Map();
  events.filter((event) => !event.is_internal && (event.visitor_id || event.session_id)).forEach((event) => {
    const id = event.visitor_id || event.session_id;
    const row = grouped.get(id) || { visitorId: id, events: [] };
    row.events.push(event);
    grouped.set(id, row);
  });

  return [...grouped.values()].map((row) => {
    row.events.sort((a, b) => eventTime(a) - eventTime(b));
    const first = row.events[0];
    const last = row.events.at(-1);
    if (from && !row.events.some((event) => isSince(event, from))) return null;
    const sessions = new Set(row.events.map((event) => event.session_id).filter(Boolean));
    const pageViews = row.events.filter((event) => event.event_type === 'page_view');
    const latestSessionFirstPage = pageViews.find((event) => event.session_id === last.session_id) || [...pageViews].reverse()[0] || last;
    const productsViewed = [...new Set(row.events
      .filter((event) => event.event_type === 'product_view' && event.product_sku)
      .map((event) => productNames.get(String(event.product_sku).toUpperCase()) || event.product_sku))];
    const visitorAttempts = attemptsByVisitor.get(row.visitorId) || [];
    const visitorOrders = visitorAttempts.map((attempt) => orderById.get(attempt.order_id)).filter(Boolean);
    const profile = profileByVisitor.get(row.visitorId);
    const latestCheckout = [...row.events].reverse().find((event) => ['payment_success', 'payment_failed', 'payment_started', 'checkout_opened', 'add_to_cart'].includes(event.event_type));
    return {
      visitorId: row.visitorId,
      firstSeen: first.created_at,
      lastSeen: last.created_at,
      sessions: sessions.size,
      pageviews: pageViews.length,
      returning: sessions.size > 1,
      firstSource: profile?.first_source || sourceLabel(pageViews[0] || first),
      latestSource: sourceLabel(latestSessionFirstPage),
      firstLandingPage: profile?.first_landing_page || cleanPath((pageViews[0] || first).page_path),
      lastPage: cleanPath(last.page_path),
      location: locationLabel(last),
      device: last.device_type || 'unknown',
      productsViewed,
      checkoutStage: latestCheckout ? eventLabel(latestCheckout) : 'Browsing',
      accountEmail: profile?.email || '',
      accountCreatedAt: profile?.created_at || '',
      orderNumbers: visitorOrders.map((order) => order.order_number),
      revenue: money(visitorOrders.reduce((sum, order) => sum + asNumber(order.total), 0)),
      journey: eventJourney(row.events, productNames),
    };
  }).filter(Boolean)
    .sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0))
    .slice(0, 50);
}

function analyticsForRange(events, paidOrders, attempts, products, from) {
  const productNames = new Map(products.map((product) => [String(product.sku || '').toUpperCase(), product.name || product.sku]));
  const allPageViews = events.filter((event) => !event.is_internal && event.event_type === 'page_view');
  const scopedEvents = events.filter((event) => isSince(event, from));
  const realEvents = scopedEvents.filter((event) => !event.is_internal);
  const internalEvents = scopedEvents.filter((event) => event.is_internal);
  const pageViews = realEvents.filter((event) => event.event_type === 'page_view');
  const scopedPaidOrders = paidOrders.filter((order) => isSince(order, from));
  const scopedAttempts = attempts.filter((attempt) => isSince(attempt, from));
  const visitors = uniqueVisitorCount(pageViews);

  const eventCount = (type) => realEvents.filter((event) => event.event_type === type).length;
  const paymentAttemptStarted = scopedAttempts.filter((attempt) => !['rejected', 'cancelled', 'overdue'].includes(String(attempt.status || '').toLowerCase())).length;
  const paymentAttemptFailed = scopedAttempts.filter((attempt) => ['rejected', 'cancelled', 'overdue'].includes(String(attempt.status || '').toLowerCase())).length;

  return {
    visitors,
    sessions: uniqueSessionCount(pageViews),
    pageviews: pageViews.length,
    conversionRate: pct(scopedPaidOrders.length, visitors),
    internalIgnored: internalEvents.length,
    ...visitorRetention(events, from),
    topPages: topCounts(pageViews, (event) => cleanPath(event.page_path), 8),
    topProductViews: topCounts(realEvents.filter((event) => event.event_type === 'product_view'), (event) => {
      const sku = String(event.product_sku || '').toUpperCase();
      return productNames.get(sku) || sku || cleanPath(event.page_path);
    }, 8),
    devices: topCounts(pageViews, (event) => event.device_type || 'unknown', 4),
    sources: topVisitorSources(allPageViews, pageViews, 6),
    locations: topUniqueLabels(pageViews, locationLabel, (event) => event.visitor_id || event.session_id, 8),
    funnel: [
      { label: 'Product views', value: eventCount('product_view') },
      { label: 'Add to basket', value: eventCount('add_to_cart') },
      { label: 'Checkout opened', value: eventCount('checkout_opened') },
      { label: 'Payment started', value: Math.max(eventCount('payment_started'), paymentAttemptStarted) },
      { label: 'Payment success', value: Math.max(eventCount('payment_success'), scopedPaidOrders.length) },
      { label: 'Payment failed', value: Math.max(eventCount('payment_failed'), paymentAttemptFailed) },
    ],
  };
}

function eventTime(event) {
  return new Date(event.created_at || 0).getTime();
}

function cartItemsFromEvent(event, productNames = new Map()) {
  if (Array.isArray(event.cart_items) && event.cart_items.length) {
    return event.cart_items.slice(0, 8).map((item) => {
      const sku = String(item?.sku || '').toUpperCase();
      return {
        sku,
        name: String(item?.name || productNames.get(sku) || sku || 'Product'),
        qty: Math.max(1, asNumber(item?.qty) || 1),
        lineTotal: money(item?.lineTotal || item?.line_total || 0),
      };
    }).filter((item) => item.sku);
  }
  const sku = String(event.product_sku || '').toUpperCase();
  if (!sku) return [];
  return [{ sku, name: productNames.get(sku) || sku, qty: 1, lineTotal: 0 }];
}

function cartLabel(items) {
  if (!items?.length) return 'Basket details unavailable';
  return items.map((item) => `${item.name} x${item.qty}`).join(', ');
}

function checkoutDropoffs(events, products, attempts, from, now = new Date()) {
  const productNames = new Map(products.map((product) => [String(product.sku || '').toUpperCase(), product.name || product.sku]));
  const checkoutTypes = new Set(['add_to_cart', 'checkout_opened', 'payment_started', 'payment_failed', 'payment_success', 'product_view']);
  const realEvents = events
    .filter((event) => !event.is_internal && isSince(event, from) && checkoutTypes.has(event.event_type))
    .sort((a, b) => eventTime(a) - eventTime(b));
  const bySession = new Map();
  const attemptsBySession = new Map();

  attempts.forEach((attempt) => {
    const context = attemptContext(attempt);
    if (!context.sessionId) return;
    const existing = attemptsBySession.get(context.sessionId);
    if (!existing || new Date(attempt.created_at || 0) > new Date(existing.created_at || 0)) {
      attemptsBySession.set(context.sessionId, attempt);
    }
  });

  for (const event of realEvents) {
    const session = event.session_id;
    if (!session) continue;
    const row = bySession.get(session) || { sessionId: session, events: [] };
    row.events.push(event);
    bySession.set(session, row);
  }

  const activeCutoff = now.getTime() - (5 * 60 * 1000);
  return [...bySession.values()].map((session) => {
    const eventsForSession = session.events;
    const hasCheckoutOpened = eventsForSession.some((event) => event.event_type === 'checkout_opened');
    const hasPaymentStarted = eventsForSession.some((event) => event.event_type === 'payment_started');
    const hasPaymentFailed = eventsForSession.some((event) => event.event_type === 'payment_failed');
    const hasPaymentSuccess = eventsForSession.some((event) => event.event_type === 'payment_success');
    const paymentAttempt = attemptsBySession.get(session.sessionId);
    const paymentStatus = String(paymentAttempt?.status || '').toLowerCase();
    const paymentCompleted = Boolean(paymentAttempt?.order_id) || paymentStatus === 'paid';
    const paymentFinishedUnsuccessfully = ['rejected', 'cancelled', 'overdue'].includes(paymentStatus);
    if ((!hasCheckoutOpened && !hasPaymentStarted) || hasPaymentSuccess || paymentCompleted || paymentFinishedUnsuccessfully) return null;

    const last = eventsForSession.at(-1);
    if (eventTime(last) > activeCutoff && !hasPaymentFailed) return null;

    const cartEvent = [...eventsForSession].reverse().find((event) => Array.isArray(event.cart_items) && event.cart_items.length) || [...eventsForSession].reverse().find((event) => event.product_sku) || last;
    const items = cartItemsFromEvent(cartEvent, productNames);
    const location = locationLabel(last);
    const stage = hasPaymentFailed
      ? 'Payment failed / returned'
      : hasPaymentStarted
        ? 'Started Pay by Bank'
        : 'Opened checkout';

    return {
      sessionId: session.sessionId,
      visitorId: last.visitor_id || '',
      lastSeen: last.created_at,
      firstSeen: eventsForSession[0]?.created_at,
      source: sourceLabel(last),
      location,
      device: last.device_type || 'unknown',
      stage,
      cartValue: money(cartEvent.cart_value || 0),
      promoCode: cartEvent.promo_code || '',
      items,
      itemSummary: cartLabel(items),
      lastPage: cleanPath(last.page_path),
      journey: eventsForSession.slice(-10).map((event) => ({
        time: event.created_at,
        type: event.event_type,
        page: cleanPath(event.page_path),
        product: productNames.get(String(event.product_sku || '').toUpperCase()) || event.product_sku || '',
      })),
    };
  }).filter(Boolean)
    .sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0))
    .slice(0, 12);
}

function rangeStart(now, definition) {
  if (!definition.ms) return null;
  return new Date(now.getTime() - definition.ms);
}

function rangeDashboard(definition, from, { orders, items, products, attempts, pendingReviews, publicReviews, subscribers, notifySubscribers, promoRedemptions, events, profiles, now }) {
  const scopedOrders = orders.filter((order) => isSince(order, from));
  const scopedPaidOrders = scopedOrders.filter((order) => PAID_STATUSES.has(order.status));
  const scopedAttempts = attempts.filter((attempt) => isSince(attempt, from));
  const scopedPendingReviews = pendingReviews.filter((review) => isSince(review, from));
  const scopedPublicReviews = publicReviews.filter((review) => isSince(review, from));
  const scopedSubscribers = subscribers.filter((sub) => !sub.unsubscribed_at && isSince(sub, from));
  const scopedPromoRedemptions = promoRedemptions.filter((redemption) => isSince({ created_at: redemption.redeemed_at }, from));
  const approvedRatings = scopedPublicReviews.map((review) => asNumber(review.rating)).filter(Boolean);

  return {
    key: definition.key,
    label: definition.label,
    summary: {
      ...periodSummary(orders, from),
      allTimeRevenue: sumRevenue(scopedPaidOrders),
      allTimeOrders: scopedPaidOrders.length,
      averageOrderValue: averageOrderValue(scopedPaidOrders),
      promoRedemptions: scopedPromoRedemptions.length,
      subscribers: scopedSubscribers.length,
    },
    customers: customerStats(scopedOrders),
    accounts: accountStats(profiles, from),
    orders: {
      byStatus: countBy(scopedOrders, 'status'),
      openFulfilment: scopedOrders.filter((order) => ['paid', 'processing', 'dispatched'].includes(order.status)).length,
      problemOrders: scopedOrders.filter((order) => FINAL_BAD_STATUSES.has(order.status)).length,
    },
    payments: paymentSummary(scopedAttempts),
    analytics: analyticsForRange(events, scopedPaidOrders, attempts, products, from),
    checkoutDropoffs: checkoutDropoffs(events, products, attempts, from, now),
    visitorJourneys: visitorJourneys(events, profiles, attempts, orders, products, from),
    products: {
      top: topProducts(scopedOrders, items),
      revenue: revenueByProduct(scopedOrders, items),
    },
    reviews: {
      pending: scopedPendingReviews.filter((review) => review.status === 'pending').length,
      approved: scopedPublicReviews.length,
      averageRating: approvedRatings.length ? Number((approvedRatings.reduce((sum, rating) => sum + rating, 0) / approvedRatings.length).toFixed(1)) : 0,
    },
    emailSubscribers: subscriberStats(notifySubscribers, from),
  };
}

async function buildDashboard(supabase) {
  const [
    orders,
    items,
    products,
    attempts,
    pendingReviews,
    publicReviews,
    subscribers,
    notifySubscribers,
    promoRedemptions,
    events,
    profiles,
    audits,
    loyaltyRewards,
    loyaltyMembers,
  ] = await Promise.all([
    safeSelect(supabase, 'orders', 'id,order_number,email,full_name,phone,total,subtotal,discount,shipping,status,created_at,delivered_at,dispatched_at,review_request_sent_at,review_request_status,review_request_attempts,review_request_last_error,payment_provider,promo_opt_in,shipping_address_line1,shipping_address_line2,shipping_city,shipping_postcode,shipping_country,tracking_number,tracking_url,royalmail_order_identifier,royalmail_tracking_number', { order: { column: 'created_at', ascending: false }, limit: 1000 }),
    safeSelect(supabase, 'order_items', 'order_id,sku,product_name,qty,line_total', { limit: 5000 }),
    safeSelect(supabase, 'products', 'sku,name,price,stock_quantity,is_active', { limit: 200 }),
    safeSelect(supabase, 'payment_attempts', '*', { order: { column: 'created_at', ascending: false }, limit: 1000 }),
    safeSelect(supabase, 'reviews_pending', 'id,status,created_at', { limit: 1000 }),
    safeSelect(supabase, 'reviews_public', 'id,rating,created_at', { limit: 1000 }),
    safeSelect(supabase, 'subscribers', 'id,unsubscribed_at,created_at', { limit: 5000 }),
    safeSelect(supabase, 'notify_subscribers', 'email,topics,status,created_at,updated_at', { order: { column: 'created_at', ascending: false }, limit: 5000 }),
    safeSelect(supabase, 'promo_redemptions', 'id,promo_code,redeemed_at', { limit: 5000 }),
    safeSelect(supabase, 'site_events', '*', { order: { column: 'created_at', ascending: false }, limit: 20000 }),
    safeSelect(supabase, 'profiles', '*', { order: { column: 'created_at', ascending: false }, limit: 5000 }),
    safeSelect(supabase, 'admin_audit_log', 'order_id,action,payload,created_at', { order: { column: 'created_at', ascending: true }, limit: 10000 }),
    safeSelect(supabase, 'loyalty_rewards', 'id,member_id,reward_code,status,reserved_reference,reserved_at,created_at', { order: { column: 'reserved_at', ascending: false }, limit: 1000 }),
    safeSelect(supabase, 'loyalty_members', 'id,email', { limit: 5000 }),
  ]);

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const paidOrders = orders.filter((order) => PAID_STATUSES.has(order.status));
  const activeSubscribers = subscribers.filter((sub) => !sub.unsubscribed_at);
  const approvedRatings = publicReviews.map((review) => asNumber(review.rating)).filter(Boolean);
  const rangeContext = { orders, items, products, attempts, pendingReviews, publicReviews, subscribers, notifySubscribers, promoRedemptions, events, profiles, now };
  const ranges = Object.fromEntries(RANGE_DEFINITIONS.map((definition) => [
    definition.key,
    rangeDashboard(definition, rangeStart(now, definition), rangeContext),
  ]));
  const loyaltyEmailByMember = new Map(loyaltyMembers.map((member) => [member.id, member.email]));
  const attemptByReference = new Map(attempts.map((attempt) => [String(attempt.payment_reference || '').toUpperCase(), attempt]));
  const reservedRewards = loyaltyRewards.filter((reward) => reward.status === 'reserved').map((reward) => {
    const attempt = attemptByReference.get(String(reward.reserved_reference || '').toUpperCase());
    return {
      id: reward.id,
      email: loyaltyEmailByMember.get(reward.member_id) || 'Unknown member',
      code: reward.reward_code,
      reference: reward.reserved_reference || '',
      reservedAt: reward.reserved_at,
      paymentStatus: String(attempt?.status || 'unknown').toLowerCase(),
      releasable: Boolean(reward.reserved_at)
        && Date.now() - new Date(reward.reserved_at).getTime() >= 2 * 60 * 60 * 1000
        && !attempt?.order_id
        && !['paid', 'completed', 'success', 'succeeded'].includes(String(attempt?.status || '').toLowerCase()),
    };
  });

  return {
    ranges,
    summary: {
      today: periodSummary(orders, today),
      sevenDays: periodSummary(orders, sevenDaysAgo),
      thirtyDays: periodSummary(orders, thirtyDaysAgo),
      allTimeRevenue: sumRevenue(paidOrders),
      allTimeOrders: paidOrders.length,
      averageOrderValue: averageOrderValue(paidOrders),
      promoRedemptions: promoRedemptions.length,
      subscribers: activeSubscribers.length,
    },
    customers: customerStats(orders),
    accounts: accountStats(profiles, null),
    orders: {
      byStatus: countBy(orders, 'status'),
      recent: recentOrders(orders, items, attempts, events, profiles, audits, products),
      openFulfilment: orders.filter((order) => ['paid', 'processing', 'dispatched'].includes(order.status)).length,
      problemOrders: orders.filter((order) => FINAL_BAD_STATUSES.has(order.status)).length,
    },
    payments: paymentSummary(attempts),
    analytics: {
      today: ranges['24h'].analytics,
      sevenDays: ranges['7d'].analytics,
      thirtyDays: ranges['30d'].analytics,
      internalIgnored: ranges['7d'].analytics.internalIgnored,
      topPages: ranges['7d'].analytics.topPages,
      topProductViews: ranges['7d'].analytics.topProductViews,
      devices: ranges['7d'].analytics.devices,
      sources: ranges['7d'].analytics.sources,
      locations: ranges['7d'].analytics.locations,
      funnel: ranges['7d'].analytics.funnel,
    },
    products: {
      top: topProducts(orders, items),
      revenue: revenueByProduct(orders, items),
      stock: stockSummary(products),
    },
    reviews: {
      pending: pendingReviews.filter((review) => review.status === 'pending').length,
      approved: publicReviews.length,
      averageRating: approvedRatings.length ? Number((approvedRatings.reduce((sum, rating) => sum + rating, 0) / approvedRatings.length).toFixed(1)) : 0,
    },
    emailSubscribers: subscriberStats(notifySubscribers, null),
    loyalty: { reservedRewards },
  };
}

async function getOrder(supabase, orderNumber, fields) {
  const { data, error } = await supabase
    .from('orders')
    .select(fields)
    .eq('order_number', String(orderNumber).trim().toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getItems(supabase, orderId) {
  const { data, error } = await supabase
    .from('order_items')
    .select('product_name, sku, qty, line_total')
    .eq('order_id', orderId);
  if (error) throw error;
  return data || [];
}

async function audit(supabase, action, orderId, payload) {
  const { error } = await supabase.from('admin_audit_log').insert({
    action,
    order_id: orderId,
    payload,
  });
  if (error) throw error;
}

async function handleDispatch({ res, supabase }, details) {
  const order = await getOrder(supabase, details.orderNumber, 'id, order_number, email, total, status');
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!['paid', 'processing'].includes(order.status)) {
    return res.status(400).json({ error: `Cannot dispatch order with status "${order.status}".` });
  }

  const items = await getItems(supabase, order.id);
  const now = new Date().toISOString();
  const trackingNumber = details.trackingNumber || null;
  const trackingUrl = trackingNumber
    ? `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(trackingNumber)}`
    : null;
  const { error } = await supabase
    .from('orders')
    .update({ status: 'dispatched', tracking_number: trackingNumber, tracking_url: trackingUrl, dispatched_at: now })
    .eq('id', order.id);
  if (error) throw error;

  await sendOrderDispatchedEmail({
    to: order.email,
    orderNumber: order.order_number,
    items,
    total: order.total,
    trackingNumber: trackingNumber || 'Not supplied',
    trackingUrl,
    expectedDate: details.expectedDate || 'Usually the next working day',
    packedDate: details.packedDate || new Date().toLocaleDateString('en-GB'),
    dispatchedDate: details.dispatchedDate || new Date().toLocaleDateString('en-GB'),
  });
  await audit(supabase, 'order_dispatched', order.id, {
    order_number: order.order_number,
    tracking_number: trackingNumber,
    tracking_url: trackingUrl,
  });
  return res.status(200).json({ success: true, orderNumber: order.order_number });
}

async function handleCreateLabel({ res, supabase }, { orderNumber }) {
  const order = await getOrder(
    supabase,
    orderNumber,
    'id, order_number, email, full_name, phone, subtotal, shipping, total, status, created_at, shipping_address_line1, shipping_address_line2, shipping_city, shipping_postcode, shipping_country, tracking_number, tracking_url, royalmail_order_identifier, royalmail_tracking_number',
  );
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!['paid', 'processing'].includes(order.status)) {
    return res.status(400).json({ error: `Cannot create label for order with status "${order.status}".` });
  }

  const items = await getItems(supabase, order.id);
  const result = await syncRoyalMailOrderToSupabase(supabase, order, items);
  return res.status(200).json({
    success: true,
    orderNumber: order.order_number,
    trackingNumber: result.trackingNumber || order.tracking_number || null,
    royalmailOrderIdentifier: result.orderIdentifier || order.royalmail_order_identifier || null,
    skipped: result.skipped || false,
    reason: result.reason || null,
  });
}

async function handleDeliver({ res, supabase }, { orderNumber, deliveredTime }) {
  const order = await getOrder(supabase, orderNumber, 'id, order_number, email, total, status');
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'dispatched') {
    return res.status(400).json({ error: `Cannot deliver order with status "${order.status}".` });
  }

  const items = await getItems(supabase, order.id);
  const now = new Date().toISOString();
  const { error } = await supabase.from('orders').update({ status: 'delivered', delivered_at: now }).eq('id', order.id);
  if (error) throw error;

  await sendOrderDeliveredEmail({
    to: order.email,
    orderNumber: order.order_number,
    items,
    total: order.total,
    deliveredTime: deliveredTime || new Date().toLocaleString('en-GB'),
  });
  await audit(supabase, 'order_delivered', order.id, { order_number: order.order_number });
  return res.status(200).json({ success: true, orderNumber: order.order_number });
}

async function createStripeRefund(order, reason) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Missing Stripe config');
  if (!order.stripe_session_id) throw new Error('No Stripe session found for this order');

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
  if (!session.payment_intent) throw new Error('No payment intent found for this session');

  return stripe.refunds.create({
    payment_intent: session.payment_intent,
    reason: reason ? 'requested_by_customer' : undefined,
    metadata: { order_number: order.order_number, reason: reason || 'admin_initiated' },
  }, {
    idempotencyKey: `refund-${order.id}`,
  });
}

async function handleCancel({ res, supabase }, { orderNumber, reason, refund }) {
  const order = await getOrder(
    supabase,
    orderNumber,
    'id, order_number, email, total, status, stripe_session_id, payment_provider, payment_reference, fena_payment_id',
  );
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!['pending', 'paid', 'processing', 'dispatched'].includes(order.status)) {
    return res.status(400).json({ error: `Cannot cancel order with status "${order.status}".` });
  }

  const items = await getItems(supabase, order.id);
  const wasPaid = ['paid', 'processing', 'dispatched'].includes(order.status);
  const shouldRefund = wasPaid && refund !== false;
  let stripeRefund = null;
  if (shouldRefund && order.payment_provider === 'fena') {
    return res.status(400).json({ error: 'Fena Pay by Bank refunds must be handled in Fena as a reverse payment/manual refund flow.' });
  }
  if (shouldRefund) stripeRefund = await createStripeRefund(order, reason);

  const update = {
    status: stripeRefund ? 'refunded' : 'cancelled',
    cancellation_reason: reason || null,
  };
  if (stripeRefund) {
    update.refunded_at = new Date().toISOString();
    update.stripe_refund_id = stripeRefund.id;
  }
  const { error } = await supabase.from('orders').update(update).eq('id', order.id);
  if (error) throw error;

  await sendOrderCancelledEmail({
    to: order.email,
    orderNumber: order.order_number,
    items,
    total: order.total,
    refundInitiated: !!stripeRefund,
  });
  await audit(supabase, 'order_cancelled', order.id, {
    order_number: order.order_number,
    reason: reason || null,
    stripe_refund_id: stripeRefund?.id || null,
  });
  return res.status(200).json({
    success: true,
    orderNumber: order.order_number,
    refundInitiated: !!stripeRefund,
  });
}

async function handleRefund({ res, supabase }, { orderNumber, reason }) {
  const order = await getOrder(
    supabase,
    orderNumber,
    'id, order_number, email, total, status, stripe_session_id, payment_provider, payment_reference, fena_payment_id',
  );
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status === 'refunded') return res.status(409).json({ error: 'Order has already been refunded' });
  if (!['paid', 'processing', 'dispatched', 'delivered', 'cancelled'].includes(order.status)) {
    return res.status(400).json({ error: `Cannot refund order with status "${order.status}".` });
  }
  if (order.payment_provider === 'fena') {
    return res.status(400).json({ error: 'Fena Pay by Bank refunds must be handled in Fena as a reverse payment/manual refund flow.' });
  }

  const stripeRefund = await createStripeRefund(order, reason);
  const { error } = await supabase.from('orders').update({
    status: 'refunded',
    refunded_at: new Date().toISOString(),
    stripe_refund_id: stripeRefund.id,
  }).eq('id', order.id);
  if (error) throw error;

  await sendOrderRefundedEmail({
    to: order.email,
    orderNumber: order.order_number,
    total: order.total,
    refundDate: new Date().toLocaleDateString('en-GB'),
  });
  await audit(supabase, 'order_refunded', order.id, {
    order_number: order.order_number,
    stripe_refund_id: stripeRefund.id,
    reason: reason || null,
  });
  return res.status(200).json({ success: true, orderNumber: order.order_number, stripeRefundId: stripeRefund.id });
}

async function handleReviewRequest({ res, supabase }, { orderNumber }) {
  const order = await getOrder(
    supabase,
    orderNumber,
    'id, order_number, email, status, review_request_sent_at',
  );
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'delivered') {
    return res.status(400).json({ error: `Cannot send review request for order with status "${order.status}".` });
  }
  if (order.review_request_sent_at) {
    return res.status(409).json({ error: 'Review request has already been sent' });
  }

  const items = await getItems(supabase, order.id);
  const emailResult = await sendReviewRequestEmail({
    to: order.email,
    orderNumber: order.order_number,
    items,
    idempotencyKey: `review-order-${order.id}`,
  });
  const now = new Date().toISOString();
  const { error } = await supabase.from('orders').update({
    review_request_sent_at: now,
    review_request_status: 'sent',
    review_request_email_id: emailResult.id,
    review_request_last_error: null,
  }).eq('id', order.id);
  if (error) throw error;
  await audit(supabase, 'review_request_sent', order.id, { order_number: order.order_number });
  return res.status(200).json({ success: true, orderNumber: order.order_number });
}

async function handleAutomatedReviews(req, res) {
  if (!isCronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getSupabaseAdmin();
  const dueBefore = new Date(Date.now() - REVIEW_DELAY_MS).toISOString();
  const { data: claimed, error: claimError } = await supabase.rpc('claim_automated_review_requests', {
    p_order_cutoff: AUTOMATED_REVIEW_ORDER_CUTOFF,
    p_due_before: dueBefore,
    p_limit: 20,
  });
  if (claimError) {
    console.error('automated-review-claim-error', claimError);
    return res.status(500).json({ error: 'Unable to claim review requests' });
  }

  const results = [];
  for (const order of claimed || []) {
    try {
      const items = await getItems(supabase, order.id);
      const emailResult = await sendReviewRequestEmail({
        to: order.email,
        orderNumber: order.order_number,
        items,
        idempotencyKey: `review-order-${order.id}`,
      });
      const sentAt = new Date().toISOString();
      const { error: updateError } = await supabase.from('orders').update({
        review_request_sent_at: sentAt,
        review_request_status: 'sent',
        review_request_email_id: emailResult.id,
        review_request_last_error: null,
      }).eq('id', order.id).eq('review_request_status', 'sending');
      if (updateError) throw updateError;
      await audit(supabase, 'review_request_sent', order.id, {
        order_number: order.order_number,
        source: 'automated_review_cron',
        resend_email_id: emailResult.id,
      });
      results.push({ orderNumber: order.order_number, status: 'sent' });
    } catch (error) {
      const message = String(error?.message || error).slice(0, 500);
      await supabase.from('orders').update({
        review_request_status: 'failed',
        review_request_last_error: message,
      }).eq('id', order.id).eq('review_request_status', 'sending');
      console.error('automated-review-send-error', { orderNumber: order.order_number, message });
      results.push({ orderNumber: order.order_number, status: 'failed' });
    }
  }

  return res.status(200).json({
    success: true,
    cutoff: AUTOMATED_REVIEW_ORDER_CUTOFF,
    dueBefore,
    claimed: results.length,
    sent: results.filter((result) => result.status === 'sent').length,
    failed: results.filter((result) => result.status === 'failed').length,
    results,
  });
}

module.exports.__test = {
  checkoutDropoffs,
  sourceLabel,
  topVisitorSources,
};
