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

const ACTIONS = ['dispatch', 'deliver', 'cancel', 'refund', 'send-review-request'];

function isAuthorized(req) {
  const expected = process.env.ADMIN_API_KEY || '';
  const supplied = String(req.headers['x-admin-key'] || '');
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
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
    return handleReviewRequest(ctx, { orderNumber });
  } catch (err) {
    console.error(`order-admin-${action}-error`, { message: err?.message, stack: err?.stack });
    return res.status(500).json({ error: `Failed to ${action} order` });
  }
};

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
    'id, order_number, email, total, status, stripe_session_id',
  );
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!['pending', 'paid', 'processing', 'dispatched'].includes(order.status)) {
    return res.status(400).json({ error: `Cannot cancel order with status "${order.status}".` });
  }

  const items = await getItems(supabase, order.id);
  const wasPaid = ['paid', 'processing', 'dispatched'].includes(order.status);
  const shouldRefund = wasPaid && refund !== false;
  let stripeRefund = null;
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
    'id, order_number, email, total, status, stripe_session_id',
  );
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status === 'refunded') return res.status(409).json({ error: 'Order has already been refunded' });
  if (!['paid', 'processing', 'dispatched', 'delivered', 'cancelled'].includes(order.status)) {
    return res.status(400).json({ error: `Cannot refund order with status "${order.status}".` });
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
