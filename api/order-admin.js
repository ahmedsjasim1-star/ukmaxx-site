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
};

function isAuthorized(req) {
  const expected = process.env.ADMIN_API_KEY || '';
  const supplied = String(req.headers['x-admin-key'] || '');
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  if (req.method === 'GET' && req.query?.type === 'dashboard') return handleDashboard(req, res);
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

async function safeSelect(supabase, table, select, options = {}) {
  let query = supabase.from(table).select(select);
  if (options.order) query = query.order(options.order.column, { ascending: options.order.ascending });
  if (options.limit) query = query.limit(options.limit);
  const { data, error } = await query;
  if (error) {
    console.error('admin-dashboard-query-error', { table, message: error.message });
    return [];
  }
  return data || [];
}

function asNumber(value) {
  return Number(value || 0);
}

function money(value) {
  return Number(asNumber(value).toFixed(2));
}

function isSince(row, from) {
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

function recentOrders(orders) {
  return orders.slice(0, 10).map((order) => ({
    orderNumber: order.order_number,
    email: order.email,
    subtotal: asNumber(order.subtotal),
    discount: asNumber(order.discount),
    shipping: asNumber(order.shipping),
    total: asNumber(order.total),
    status: order.status,
    paymentProvider: order.payment_provider || 'fena',
    promoOptIn: Boolean(order.promo_opt_in),
    dispatchedAt: order.dispatched_at,
    deliveredAt: order.delivered_at,
    createdAt: order.created_at,
  }));
}

function analyticsSummary(events, paidOrders, products, today, sevenDaysAgo, thirtyDaysAgo) {
  const productNames = new Map(products.map((product) => [String(product.sku || '').toUpperCase(), product.name || product.sku]));
  const pageViews = events.filter((event) => event.event_type === 'page_view');
  const todayViews = pageViews.filter((event) => isSince(event, today));
  const sevenDayViews = pageViews.filter((event) => isSince(event, sevenDaysAgo));
  const thirtyDayViews = pageViews.filter((event) => isSince(event, thirtyDaysAgo));
  const sevenDayEvents = events.filter((event) => isSince(event, sevenDaysAgo));
  const todayPaidOrders = paidOrders.filter((order) => isSince(order, today));
  const sevenDayPaidOrders = paidOrders.filter((order) => isSince(order, sevenDaysAgo));

  const eventCount = (type) => sevenDayEvents.filter((event) => event.event_type === type).length;
  const sourceLabel = (event) => {
    if (event.utm_source) return event.utm_source;
    if (!event.referrer) return 'Direct';
    try {
      const host = new URL(event.referrer).hostname.replace(/^www\./, '');
      return host || 'Referral';
    } catch {
      return 'Referral';
    }
  };

  return {
    today: {
      visitors: uniqueBy(todayViews, 'session_id'),
      pageviews: todayViews.length,
      conversionRate: pct(todayPaidOrders.length, uniqueBy(todayViews, 'session_id')),
    },
    sevenDays: {
      visitors: uniqueBy(sevenDayViews, 'session_id'),
      pageviews: sevenDayViews.length,
      conversionRate: pct(sevenDayPaidOrders.length, uniqueBy(sevenDayViews, 'session_id')),
    },
    thirtyDays: {
      visitors: uniqueBy(thirtyDayViews, 'session_id'),
      pageviews: thirtyDayViews.length,
    },
    topPages: topCounts(sevenDayViews, (event) => cleanPath(event.page_path), 8),
    topProductViews: topCounts(sevenDayEvents.filter((event) => event.event_type === 'product_view'), (event) => {
      const sku = String(event.product_sku || '').toUpperCase();
      return productNames.get(sku) || sku || cleanPath(event.page_path);
    }, 8),
    devices: topCounts(sevenDayViews, (event) => event.device_type || 'unknown', 4),
    sources: topCounts(sevenDayViews, sourceLabel, 6),
    funnel: [
      { label: 'Product views', value: eventCount('product_view') },
      { label: 'Add to basket', value: eventCount('add_to_cart') },
      { label: 'Checkout opened', value: eventCount('checkout_opened') },
      { label: 'Payment started', value: eventCount('payment_started') },
      { label: 'Payment success', value: eventCount('payment_success') },
      { label: 'Payment failed', value: eventCount('payment_failed') },
    ],
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
    promoRedemptions,
    events,
  ] = await Promise.all([
    safeSelect(supabase, 'orders', 'id,order_number,email,total,subtotal,discount,shipping,status,created_at,delivered_at,dispatched_at,payment_provider,promo_opt_in', { order: { column: 'created_at', ascending: false }, limit: 1000 }),
    safeSelect(supabase, 'order_items', 'order_id,sku,product_name,qty,line_total', { limit: 5000 }),
    safeSelect(supabase, 'products', 'sku,name,price,stock_quantity,is_active', { limit: 200 }),
    safeSelect(supabase, 'payment_attempts', 'status,amount,email,created_at,payment_provider', { order: { column: 'created_at', ascending: false }, limit: 1000 }),
    safeSelect(supabase, 'reviews_pending', 'id,status,created_at', { limit: 1000 }),
    safeSelect(supabase, 'reviews_public', 'id,rating,created_at', { limit: 1000 }),
    safeSelect(supabase, 'subscribers', 'id,unsubscribed_at,created_at', { limit: 5000 }),
    safeSelect(supabase, 'promo_redemptions', 'id,promo_code,redeemed_at', { limit: 5000 }),
    safeSelect(supabase, 'site_events', 'event_type,session_id,page_path,page_title,product_sku,referrer,utm_source,utm_medium,utm_campaign,device_type,created_at', { order: { column: 'created_at', ascending: false }, limit: 5000 }),
  ]);

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const paidOrders = orders.filter((order) => PAID_STATUSES.has(order.status));
  const activeSubscribers = subscribers.filter((sub) => !sub.unsubscribed_at);
  const approvedRatings = publicReviews.map((review) => asNumber(review.rating)).filter(Boolean);

  return {
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
    orders: {
      byStatus: countBy(orders, 'status'),
      recent: recentOrders(orders),
      openFulfilment: orders.filter((order) => ['paid', 'processing', 'dispatched'].includes(order.status)).length,
      problemOrders: orders.filter((order) => FINAL_BAD_STATUSES.has(order.status)).length,
    },
    payments: paymentSummary(attempts),
    analytics: analyticsSummary(events, paidOrders, products, today, sevenDaysAgo, thirtyDaysAgo),
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
  const { error } = await supabase
    .from('orders')
    .update({ status: 'dispatched', tracking_number: details.trackingNumber || null, dispatched_at: now })
    .eq('id', order.id);
  if (error) throw error;

  await sendOrderDispatchedEmail({
    to: order.email,
    orderNumber: order.order_number,
    items,
    total: order.total,
    trackingNumber: details.trackingNumber || '—',
    expectedDate: details.expectedDate || '—',
    packedDate: details.packedDate || '—',
    dispatchedDate: details.dispatchedDate || new Date().toLocaleDateString('en-GB'),
  });
  await audit(supabase, 'order_dispatched', order.id, {
    order_number: order.order_number,
    tracking_number: details.trackingNumber || null,
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
  await sendReviewRequestEmail({ to: order.email, orderNumber: order.order_number, items });
  const now = new Date().toISOString();
  const { error } = await supabase.from('orders').update({ review_request_sent_at: now }).eq('id', order.id);
  if (error) throw error;
  await audit(supabase, 'review_request_sent', order.id, { order_number: order.order_number });
  return res.status(200).json({ success: true, orderNumber: order.order_number });
}
