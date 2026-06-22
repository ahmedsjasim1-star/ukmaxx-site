const { getSupabaseAdmin } = require('./_lib/supabase');
const {
  sendOrderDispatchedEmail,
  sendOrderDeliveredEmail,
  sendOrderCancelledEmail,
  sendOrderRefundedEmail,
  sendReviewRequestEmail,
} = require('./_lib/email');

const TELEGRAM_API = 'https://api.telegram.org/bot';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !adminChatId) {
    console.error('telegram-bot-env-missing', { hasToken: !!token, hasChatId: !!adminChatId });
    return res.status(200).json({ ok: true });
  }

  const update = req.body;
  const msg = update?.message;
  const chatId = msg?.chat?.id?.toString();
  const text = (msg?.text || '').trim();

  if (!chatId || !text) return res.status(200).json({ ok: true });

  if (chatId !== adminChatId) {
    await sendTelegram(token, chatId, '⛔ Unauthorized. This bot is for admin use only.');
    return res.status(200).json({ ok: true });
  }

  const [cmd, ...args] = text.split(/\s+/);
  const normalizedCmd = cmd?.toLowerCase();

  try {
    switch (normalizedCmd) {
      case '/start':
      case '/help':
        await sendTelegram(token, chatId, HELP_TEXT);
        break;

      case '/dispatch':
        await handleDispatch(token, chatId, args);
        break;

      case '/deliver':
        await handleDeliver(token, chatId, args);
        break;

      case '/cancel':
        await handleCancel(token, chatId, args);
        break;

      case '/refund':
        await handleRefund(token, chatId, args);
        break;

      default:
        await sendTelegram(token, chatId, `Unknown command: ${cmd}\n\n${HELP_TEXT}`);
    }
  } catch (err) {
    console.error('telegram-bot-cmd-error', { cmd: normalizedCmd, error: err?.message });
    await sendTelegram(token, chatId, `❌ Error: ${err?.message || 'Unknown error'}`);
  }

  return res.status(200).json({ ok: true });
};

/* ---------- Help ---------- */

const HELP_TEXT = `<b>UKMAXX Admin Bot</b>

/dispatch &lt;orderNumber&gt; [trackingNumber]
   Mark order as dispatched

/deliver &lt;orderNumber&gt;
   Mark order as delivered

/cancel &lt;orderNumber&gt; [reason]
   Cancel order (auto-refunds if paid)

/refund &lt;orderNumber&gt; [reason]
   Process Stripe refund`;

/* ---------- Send Telegram helper ---------- */

async function sendTelegram(token, chatId, text) {
  const url = `${TELEGRAM_API}${token}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
}

/* ---------- Handler helpers ---------- */

async function findOrder(supabase, orderNumber) {
  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, email, total, status, stripe_session_id, delivered_at, review_request_sent_at')
    .eq('order_number', orderNumber)
    .maybeSingle();
  return order;
}

async function getItems(supabase, orderId) {
  const { data: items } = await supabase
    .from('order_items')
    .select('product_name, sku, qty, line_total')
    .eq('order_id', orderId);
  return items || [];
}

/* ---------- /dispatch ---------- */

async function handleDispatch(token, chatId, args) {
  const orderNumber = args[0];
  if (!orderNumber) return sendTelegram(token, chatId, 'Usage: /dispatch &lt;orderNumber&gt; [trackingNumber]');

  const trackingNumber = args.slice(1).join(' ') || null;
  const supabase = getSupabaseAdmin();
  const order = await findOrder(supabase, orderNumber);
  if (!order) return sendTelegram(token, chatId, '❌ Order not found.');
  if (order.status !== 'paid' && order.status !== 'processing') {
    return sendTelegram(token, chatId, `❌ Cannot dispatch order with status "${order.status}". Only "paid" or "processing" orders can be dispatched.`);
  }

  const items = await getItems(supabase, order.id);
  const now = new Date().toISOString();

  await supabase.from('orders').update({ status: 'dispatched', tracking_number: trackingNumber, dispatched_at: now }).eq('id', order.id);

  await sendOrderDispatchedEmail({
    to: order.email, orderNumber: order.order_number, items, total: order.total,
    trackingNumber: trackingNumber || '—', expectedDate: '—', packedDate: '—',
    dispatchedDate: new Date().toLocaleDateString('en-GB'),
  });

  await supabase.from('admin_audit_log').insert({
    action: 'order_dispatched', order_id: order.id,
    payload: { order_number: orderNumber, tracking_number: trackingNumber, source: 'telegram_bot' },
  });

  await sendTelegram(token, chatId, `✅ <b>Order dispatched</b>\nOrder: ${orderNumber}\nTracking: ${trackingNumber || '—'}\nEmail sent to ${order.email}`);
}

/* ---------- /deliver ---------- */

async function handleDeliver(token, chatId, args) {
  const orderNumber = args[0];
  if (!orderNumber) return sendTelegram(token, chatId, 'Usage: /deliver &lt;orderNumber&gt;');

  const supabase = getSupabaseAdmin();
  const order = await findOrder(supabase, orderNumber);
  if (!order) return sendTelegram(token, chatId, '❌ Order not found.');
  if (order.status !== 'dispatched') {
    return sendTelegram(token, chatId, `❌ Cannot deliver order with status "${order.status}". Only "dispatched" orders can be delivered.`);
  }

  const items = await getItems(supabase, order.id);
  const now = new Date().toISOString();

  await supabase.from('orders').update({ status: 'delivered', delivered_at: now }).eq('id', order.id);

  await sendOrderDeliveredEmail({
    to: order.email, orderNumber: order.order_number, items, total: order.total,
    deliveredTime: new Date().toLocaleString('en-GB'),
  });

  await supabase.from('admin_audit_log').insert({
    action: 'order_delivered', order_id: order.id,
    payload: { order_number: orderNumber, source: 'telegram_bot' },
  });

  await sendTelegram(token, chatId, `✅ <b>Order delivered</b>\nOrder: ${orderNumber}\nEmail sent to ${order.email}`);
}

/* ---------- /cancel ---------- */

async function handleCancel(token, chatId, args) {
  const orderNumber = args[0];
  if (!orderNumber) return sendTelegram(token, chatId, 'Usage: /cancel &lt;orderNumber&gt; [reason]');

  const reason = args.slice(1).join(' ') || null;
  const supabase = getSupabaseAdmin();
  const order = await findOrder(supabase, orderNumber);
  if (!order) return sendTelegram(token, chatId, '❌ Order not found.');

  const validStatuses = ['pending', 'paid', 'processing', 'dispatched'];
  if (!validStatuses.includes(order.status)) {
    return sendTelegram(token, chatId, `❌ Cannot cancel order with status "${order.status}".`);
  }

  const items = await getItems(supabase, order.id);
  const wasPaid = ['paid', 'processing', 'dispatched'].includes(order.status);

  await supabase.from('orders').update({ status: 'cancelled', cancellation_reason: reason }).eq('id', order.id);

  await sendOrderCancelledEmail({
    to: order.email, orderNumber: order.order_number, items, total: order.total, refundInitiated: wasPaid,
  });

  await supabase.from('admin_audit_log').insert({
    action: 'order_cancelled', order_id: order.id,
    payload: { order_number: orderNumber, reason, was_paid: wasPaid, source: 'telegram_bot' },
  });

  await sendTelegram(token, chatId, `✅ <b>Order cancelled</b>\nOrder: ${orderNumber}\nRefund initiated: ${wasPaid ? 'Yes' : 'No'}\nEmail sent to ${order.email}`);
}

/* ---------- /refund ---------- */

async function handleRefund(token, chatId, args) {
  const Stripe = require('stripe');

  const orderNumber = args[0];
  if (!orderNumber) return sendTelegram(token, chatId, 'Usage: /refund &lt;orderNumber&gt; [reason]');

  const reason = args.slice(1).join(' ') || null;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
  if (!process.env.STRIPE_SECRET_KEY) return sendTelegram(token, chatId, '❌ Missing Stripe config.');

  const supabase = getSupabaseAdmin();
  const order = await findOrder(supabase, orderNumber);
  if (!order) return sendTelegram(token, chatId, '❌ Order not found.');
  if (order.status === 'refunded') return sendTelegram(token, chatId, '❌ Order has already been refunded.');
  if (!order.stripe_session_id) return sendTelegram(token, chatId, '❌ No Stripe session found for this order.');

  const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
  const paymentIntentId = session.payment_intent;
  if (!paymentIntentId) return sendTelegram(token, chatId, '❌ No payment intent found.');

  const refundAmount = Math.round(Number(order.total) * 100);
  const stripeRefund = await stripe.refunds.create({
    payment_intent: paymentIntentId, amount: refundAmount,
    reason: reason ? 'requested_by_customer' : undefined,
    metadata: { order_number: orderNumber, reason: reason || 'admin_initiated' },
  });

  await supabase.from('orders').update({
    status: 'refunded', refunded_at: new Date().toISOString(), stripe_refund_id: stripeRefund.id,
  }).eq('id', order.id);

  await sendOrderRefundedEmail({
    to: order.email, orderNumber: order.order_number, total: order.total,
    refundDate: new Date().toLocaleDateString('en-GB'),
  });

  await supabase.from('admin_audit_log').insert({
    action: 'order_refunded', order_id: order.id,
    payload: { order_number: orderNumber, stripe_refund_id: stripeRefund.id, amount: refundAmount / 100, source: 'telegram_bot' },
  });

  await sendTelegram(token, chatId, `✅ <b>Refund processed</b>\nOrder: ${orderNumber}\nAmount: £${(refundAmount / 100).toFixed(2)}\nStripe refund: ${stripeRefund.id}\nEmail sent to ${order.email}`);
}


