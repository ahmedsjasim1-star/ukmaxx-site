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

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, orderNumber, trackingNumber, expectedDate, packedDate, dispatchedDate, deliveredTime, reason, refund } = req.body || {};
  if (!action || !ACTIONS.includes(action)) return res.status(400).json({ error: `Invalid action. Must be one of: ${ACTIONS.join(', ')}` });
  if (!orderNumber) return res.status(400).json({ error: 'orderNumber is required' });

  try {
    const supabase = getSupabaseAdmin();

    if (action === 'dispatch') return await handleDispatch(supabase, { orderNumber, trackingNumber, expectedDate, packedDate, dispatchedDate });
    if (action === 'deliver') return await handleDeliver(supabase, { orderNumber, deliveredTime });
    if (action === 'cancel') return await handleCancel(supabase, { orderNumber, reason, refund });
    if (action === 'refund') return await handleRefund(supabase, { orderNumber, reason });
    if (action === 'send-review-request') return await handleReviewRequest(supabase, { orderNumber });
  } catch (err) {
    console.error(`order-admin-${action}-error`, { message: err?.message, stack: err?.stack });
    return res.status(500).json({ error: `Failed to ${action} order` });
  }
};

/* ---------- Dispatch ---------- */

async function handleDispatch(supabase, { orderNumber, trackingNumber, expectedDate, packedDate, dispatchedDate }) {
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, order_number, email, total, status')
    .eq('order_number', orderNumber)
    .maybeSingle();
  if (orderErr) throw orderErr;
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'paid' && order.status !== 'processing') {
    return res.status(400).json({ error: `Cannot dispatch order with status "${order.status}". Only "paid" or "processing" orders can be dispatched.` });
  }

  const { data: items } = await supabase
    .from('order_items')
    .select('product_name, sku, qty, line_total')
    .eq('order_id', order.id);

  const now = new Date().toISOString();
  await supabase
    .from('orders')
    .update({ status: 'dispatched', tracking_number: trackingNumber || null, dispatched_at: now })
    .eq('id', order.id);

  await sendOrderDispatchedEmail({
    to: order.email, orderNumber: order.order_number, items: items || [], total: order.total,
    trackingNumber: trackingNumber || '—', expectedDate: expectedDate || '—', packedDate: packedDate || '—',
    dispatchedDate: dispatchedDate || new Date().toLocaleDateString('en-GB'),
  });

  await supabase.from('admin_audit_log').insert({
    action: 'order_dispatched', order_id: order.id,
    payload: { order_number: orderNumber, tracking_number: trackingNumber, expected_date: expectedDate },
  });

  return res.status(200).json({ success: true, orderNumber });
}

/* ---------- Deliver ---------- */

async function handleDeliver(supabase, { orderNumber, deliveredTime }) {
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, order_number, email, total, status')
    .eq('order_number', orderNumber)
    .maybeSingle();
  if (orderErr) throw orderErr;
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'dispatched') {
    return res.status(400).json({ error: `Cannot deliver order with status "${order.status}". Only "dispatched" orders can be delivered.` });
  }

  const { data: items } = await supabase
    .from('order_items')
    .select('product_name, sku, qty, line_total')
    .eq('order_id', order.id);

  const now = new Date().toISOString();
  await supabase
    .from('orders')
    .update({ status: 'delivered', delivered_at: now })
    .eq('id', order.id);

  await sendOrderDeliveredEmail({
    to: order.email, orderNumber: order.order_number, items: items || [], total: order.total,
    deliveredTime: deliveredTime || new Date().toLocaleString('en-GB'),
  });

  await supabase.from('admin_audit_log').insert({
    action: 'order_delivered', order_id: order.id,
    payload: { order_number: orderNumber, delivered_time: deliveredTime, review_request_pending: true },
  });

  return res.status(200).json({ success: true, orderNumber });
}

/* ---------- Cancel ---------- */

const VALID_CANCEL_STATUSES = ['pending', 'paid', 'processing', 'dispatched'];

async function handleCancel(supabase, { orderNumber, reason, refund }) {
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, order_number, email, total, status, stripe_session_id')
    .eq('order_number', orderNumber)
    .maybeSingle();
  if (orderErr) throw orderErr;
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!VALID_CANCEL_STATUSES.includes(order.status)) {
    return res.status(400).json({ error: `Cannot cancel order with status "${order.status}".` });
  }

  const { data: items } = await supabase
    .from('order_items')
    .select('product_name, sku, qty, line_total')
    .eq('order_id', order.id);

  const wasPaid = ['paid', 'processing', 'dispatched'].includes(order.status);
  const shouldRefund = wasPaid && refund !== false;

  await supabase
    .from('orders')
    .update({ status: 'cancelled', cancellation_reason: reason || null })
    .eq('id', order.id);

  await sendOrderCancelledEmail({
    to: order.email, orderNumber: order.order_number, items: items || [], total: order.total, refundInitiated: shouldRefund,
  });

  await supabase.from('admin_audit_log').insert({
    action: 'order_cancelled', order_id: order.id,
    payload: { order_number: orderNumber, reason: reason || null, was_paid: wasPaid, refund_initiated: shouldRefund },
  });

  return res.status(200).json({ success: true, orderNumber, wasPaid, refundInitiated: shouldRefund });
}

/* ---------- Refund ---------- */

async function handleRefund(supabase, { orderNumber, reason }) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Missing Stripe config' });

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, order_number, email, total, status, stripe_session_id')
    .eq('order_number', orderNumber)
    .maybeSingle();
  if (orderErr) throw orderErr;
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status === 'refunded') return res.status(400).json({ error: 'Order has already been refunded' });
  if (!order.stripe_session_id) return res.status(400).json({ error: 'No Stripe session found for this order' });

  const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
  const paymentIntentId = session.payment_intent;
  if (!paymentIntentId) return res.status(400).json({ error: 'No payment intent found for this session' });

  const refundAmount = Math.round(Number(order.total) * 100);
  const stripeRefund = await stripe.refunds.create({
    payment_intent: paymentIntentId, amount: refundAmount,
    reason: reason ? 'requested_by_customer' : undefined,
    metadata: { order_number: orderNumber, reason: reason || 'admin_initiated' },
  });

  await supabase
    .from('orders')
    .update({ status: 'refunded', refunded_at: new Date().toISOString(), stripe_refund_id: stripeRefund.id })
    .eq('id', order.id);

  await sendOrderRefundedEmail({
    to: order.email, orderNumber: order.order_number, total: order.total,
    refundDate: new Date().toLocaleDateString('en-GB'),
  });

  await supabase.from('admin_audit_log').insert({
    action: 'order_refunded', order_id: order.id,
    payload: { order_number: orderNumber, stripe_refund_id: stripeRefund.id, amount: refundAmount / 100, reason: reason || null },
  });

  return res.status(200).json({ success: true, orderNumber, stripeRefundId: stripeRefund.id, amount: refundAmount / 100 });
}

/* ---------- Review Request ---------- */

async function handleReviewRequest(supabase, { orderNumber }) {
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, order_number, email, total, status, delivered_at, review_request_sent_at')
    .eq('order_number', orderNumber)
    .maybeSingle();
  if (orderErr) throw orderErr;
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'delivered') {
    return res.status(400).json({ error: `Cannot send review request for order with status "${order.status}". Only "delivered" orders qualify.` });
  }
  if (order.review_request_sent_at) {
    return res.status(400).json({ error: 'Review request has already been sent for this order' });
  }

  const { data: items } = await supabase
    .from('order_items')
    .select('product_name, sku, qty, line_total')
    .eq('order_id', order.id);

  await sendReviewRequestEmail({ to: order.email, orderNumber: order.order_number, items: items || [] });

  const now = new Date().toISOString();
  await supabase.from('orders').update({ review_request_sent_at: now }).eq('id', order.id);

  await supabase.from('admin_audit_log').insert({
    action: 'review_request_sent', order_id: order.id,
    payload: { order_number: orderNumber },
  });

  return res.status(200).json({ success: true, orderNumber });
}
