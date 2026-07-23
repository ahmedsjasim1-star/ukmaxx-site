const crypto = require('crypto');
const { getSupabaseAdmin } = require('./_lib/supabase');
const {
  sendOrderDispatchedEmail,
  sendOrderDeliveredEmail,
  sendOrderCancelledEmail,
  sendOrderRefundedEmail,
  sendReviewRequestEmail,
} = require('./_lib/email');
const { syncRoyalMailOrderToSupabase } = require('./_lib/royalmail');

const TELEGRAM_API = 'https://api.telegram.org/bot';

const PRODUCT_LABELS = {
  RT10: 'RETA 10mg',
  RT10X3: 'RETA 3-Pack',
  BC5: 'BPC 157',
  IP5: 'IPAM 5mg',
  NJ500: 'NAD+ 500mg',
  WA10: 'BAC Water',
  GHKCU: 'GHK-Cu 50mg',
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const token = process.env.TELEGRAM_ADMIN_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  const suppliedSecret = String(req.headers['x-telegram-bot-api-secret-token'] || '');
  if (!token || !adminChatId || !expectedSecret) {
    console.error('telegram-bot-env-missing', {
      hasToken: !!token,
      hasChatId: !!adminChatId,
      hasWebhookSecret: !!expectedSecret,
    });
    return res.status(503).json({ ok: false });
  }
  const expected = Buffer.from(expectedSecret);
  const supplied = Buffer.from(suppliedSecret);
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
    return res.status(401).json({ ok: false });
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

      case '/label':
      case '/retrylabel':
        await handleLabel(token, chatId, args);
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

      case '/review':
        await handleReview(token, chatId, args);
        break;

      case '/approvereview':
        await handleApproveReview(token, chatId, args);
        break;

      case '/rejectreview':
        await handleRejectReview(token, chatId, args);
        break;

      case '/stock':
        await handleStock(token, chatId);
        break;

      case '/setstock':
        await handleSetStock(token, chatId, args);
        break;

      case '/addstock':
        await handleAddStock(token, chatId, args);
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

/dispatch &lt;orderNumber&gt; &lt;trackingNumber&gt;
   Mark order as dispatched and email tracking
   Example: /dispatch UKM-12345 RM123456789GB

/label &lt;orderNumber&gt;
   Create/retry Royal Mail Click & Drop label

/deliver &lt;orderNumber&gt;
   Mark order as delivered

/cancel &lt;orderNumber&gt; [reason]
   Cancel order (auto-refunds if paid)

/refund &lt;orderNumber&gt; [reason]
   Process Stripe refund

/review &lt;orderNumber&gt;
   Send the post-delivery feedback request email

/approvereview &lt;reviewCode&gt;
   Publish a pending onsite review

/rejectreview &lt;reviewCode&gt; [reason]
   Reject a pending onsite review

/stock
   Show live stock

/setstock &lt;sku&gt; &lt;quantity&gt;
   Set base stock. Example: /setstock RT10 19

/addstock &lt;sku&gt; &lt;quantity&gt;
   Add stock. Example: /addstock WA10 20`;

/* ---------- Send Telegram helper ---------- */

async function sendTelegram(token, chatId, text) {
  const url = `${TELEGRAM_API}${token}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
}

function escapeTelegram(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ---------- Handler helpers ---------- */

function normalizeOrderNumber(orderNumber) {
  return String(orderNumber || '').trim().toUpperCase();
}

async function findOrder(supabase, orderNumber) {
  const normalizedOrderNumber = normalizeOrderNumber(orderNumber);
  if (!normalizedOrderNumber) return null;

  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, email, full_name, phone, subtotal, shipping, total, status, created_at, stripe_session_id, payment_provider, payment_reference, fena_payment_id, delivered_at, review_request_sent_at, shipping_address_line1, shipping_address_line2, shipping_city, shipping_postcode, shipping_country, tracking_number, tracking_url, royalmail_order_identifier, royalmail_tracking_number')
    .eq('order_number', normalizedOrderNumber)
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

const BUNDLE_COMPONENTS = {
  RT10X3: { RT10: 3, WA10: 1 },
};

function calculateBundleStock(productsBySku, sku) {
  const components = BUNDLE_COMPONENTS[sku];
  if (!components) return Number(productsBySku.get(sku)?.stock_quantity || 0);
  return Math.max(0, Math.min(...Object.entries(components).map(([componentSku, qty]) => {
    return Math.floor(Number(productsBySku.get(componentSku)?.stock_quantity || 0) / qty);
  })));
}

async function getStockProducts(supabase) {
  const { data, error } = await supabase
    .from('products')
    .select('sku,name,stock_quantity,is_active')
    .in('sku', ['RT10', 'WA10', 'RT10X3', 'BC5', 'IP5', 'NJ500'])
    .order('sku', { ascending: true });
  if (error) throw error;
  return data || [];
}

/* ---------- /stock ---------- */

async function handleStock(token, chatId) {
  const supabase = getSupabaseAdmin();
  const products = await getStockProducts(supabase);
  const bySku = new Map(products.map((product) => [product.sku, product]));
  const bundleStock = calculateBundleStock(bySku, 'RT10X3');
  const lines = [
    '<b>UKMAXX Live Stock</b>',
    '',
    `RETA 10MG (RT10): <b>${Number(bySku.get('RT10')?.stock_quantity || 0)}</b>`,
    `BAC Water (WA10): <b>${Number(bySku.get('WA10')?.stock_quantity || 0)}</b>`,
    `RETA 3-Pack (RT10X3): <b>${bundleStock}</b> bundles available`,
    '',
    'Bundle stock is calculated from 3x RT10 + 1x WA10.',
  ];
  await sendTelegram(token, chatId, lines.join('\n'));
}

/* ---------- /setstock ---------- */

async function handleSetStock(token, chatId, args) {
  const sku = String(args[0] || '').trim().toUpperCase();
  const qty = Number(args[1]);
  if (!sku || !Number.isSafeInteger(qty) || qty < 0 || qty > 10000) {
    return sendTelegram(token, chatId, 'Usage: /setstock &lt;sku&gt; &lt;quantity&gt;\nExample: /setstock RT10 19');
  }
  if (BUNDLE_COMPONENTS[sku]) {
    return sendTelegram(token, chatId, '❌ Bundle stock is calculated automatically. Set RT10 and WA10 instead.');
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('products')
    .update({ stock_quantity: qty, updated_at: new Date().toISOString() })
    .eq('sku', sku)
    .select('sku,name,stock_quantity')
    .maybeSingle();
  if (error) throw error;
  if (!data) return sendTelegram(token, chatId, `❌ Unknown SKU: ${sku}`);

  await sendTelegram(token, chatId, `✅ <b>Stock updated</b>\n${data.name} (${data.sku}): ${data.stock_quantity}`);
  await handleStock(token, chatId);
}

/* ---------- /addstock ---------- */

async function handleAddStock(token, chatId, args) {
  const sku = String(args[0] || '').trim().toUpperCase();
  const addQty = Number(args[1]);
  if (!sku || !Number.isSafeInteger(addQty) || addQty <= 0 || addQty > 10000) {
    return sendTelegram(token, chatId, 'Usage: /addstock &lt;sku&gt; &lt;quantity&gt;\nExample: /addstock WA10 20');
  }
  if (BUNDLE_COMPONENTS[sku]) {
    return sendTelegram(token, chatId, '❌ Bundle stock is calculated automatically. Add RT10 and WA10 instead.');
  }

  const supabase = getSupabaseAdmin();
  const { data: current, error: currentError } = await supabase
    .from('products')
    .select('sku,name,stock_quantity')
    .eq('sku', sku)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) return sendTelegram(token, chatId, `❌ Unknown SKU: ${sku}`);

  const nextQty = Number(current.stock_quantity || 0) + addQty;
  const { data, error } = await supabase
    .from('products')
    .update({ stock_quantity: nextQty, updated_at: new Date().toISOString() })
    .eq('sku', sku)
    .select('sku,name,stock_quantity')
    .maybeSingle();
  if (error) throw error;

  await sendTelegram(token, chatId, `✅ <b>Stock added</b>\n${data.name} (${data.sku}): ${current.stock_quantity} → ${data.stock_quantity}`);
  await handleStock(token, chatId);
}

/* ---------- /dispatch ---------- */

async function handleDispatch(token, chatId, args) {
  const orderNumber = normalizeOrderNumber(args[0]);
  if (!orderNumber) return sendTelegram(token, chatId, 'Usage: /dispatch &lt;orderNumber&gt; &lt;trackingNumber&gt;\nExample: /dispatch UKM-12345 RM123456789GB');

  const trackingNumber = args.slice(1).join(' ').trim().replace(/\s+/g, '').toUpperCase();
  if (!trackingNumber) {
    return sendTelegram(token, chatId, `❌ Tracking number required.\n\nUse:\n/dispatch ${orderNumber} RM123456789GB\n\nNo dispatch email has been sent.`);
  }

  const supabase = getSupabaseAdmin();
  const order = await findOrder(supabase, orderNumber);
  if (!order) return sendTelegram(token, chatId, '❌ Order not found.');
  if (order.status !== 'paid' && order.status !== 'processing') {
    return sendTelegram(token, chatId, `❌ Cannot dispatch order with status "${order.status}". Only "paid" or "processing" orders can be dispatched.`);
  }

  const items = await getItems(supabase, order.id);
  const now = new Date().toISOString();
  const trackingUrl = royalMailTrackingUrl(trackingNumber);

  await supabase.from('orders').update({
    status: 'dispatched',
    tracking_number: trackingNumber,
    tracking_url: trackingUrl,
    dispatched_at: now,
  }).eq('id', order.id);

  await sendOrderDispatchedEmail({
    to: order.email, orderNumber: order.order_number, items, total: order.total,
    trackingNumber, expectedDate: '—', packedDate: '—',
    dispatchedDate: new Date().toLocaleDateString('en-GB'),
  });

  await supabase.from('admin_audit_log').insert({
    action: 'order_dispatched', order_id: order.id,
    payload: { order_number: orderNumber, tracking_number: trackingNumber, tracking_url: trackingUrl, source: 'telegram_bot' },
  });

  await sendTelegram(token, chatId, `✅ <b>Order dispatched</b>\nOrder: ${orderNumber}\nTracking: ${trackingNumber}\nEmail sent to ${order.email}`);
}

function royalMailTrackingUrl(trackingNumber) {
  return `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(trackingNumber)}`;
}

/* ---------- /label ---------- */

async function handleLabel(token, chatId, args) {
  const orderNumber = normalizeOrderNumber(args[0]);
  if (!orderNumber) return sendTelegram(token, chatId, 'Usage: /label &lt;orderNumber&gt;\nExample: /label UKX26F7RH9K');

  const supabase = getSupabaseAdmin();
  const order = await findOrder(supabase, orderNumber);
  if (!order) return sendTelegram(token, chatId, 'âŒ Order not found.');
  if (!['paid', 'processing'].includes(order.status)) {
    return sendTelegram(token, chatId, `âŒ Cannot create label for status "${order.status}". Use paid/processing orders only.`);
  }

  const items = await getItems(supabase, order.id);
  const result = await syncRoyalMailOrderToSupabase(supabase, order, items);
  const trackingNumber = result.trackingNumber || order.tracking_number || null;

  if (result.skipped && result.reason === 'already_synced') {
    return sendTelegram(token, chatId, `âœ… <b>Royal Mail already synced</b>\nOrder: ${orderNumber}\nTracking: <code>${escapeTelegram(trackingNumber || 'N/A')}</code>`);
  }

  await sendTelegram(
    token,
    chatId,
    `âœ… <b>Royal Mail label created</b>\nOrder: ${orderNumber}\nTracking: <code>${escapeTelegram(trackingNumber || 'pending')}</code>\nLabel status: ${result.labelReturned ? 'label returned by API' : 'created in Click & Drop'}`,
  );
}

/* ---------- /deliver ---------- */

async function handleDeliver(token, chatId, args) {
  const orderNumber = normalizeOrderNumber(args[0]);
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

/* ---------- /review ---------- */

async function handleReview(token, chatId, args) {
  const orderNumber = normalizeOrderNumber(args[0]);
  if (!orderNumber) return sendTelegram(token, chatId, 'Usage: /review &lt;orderNumber&gt;');

  const supabase = getSupabaseAdmin();
  const order = await findOrder(supabase, orderNumber);
  if (!order) return sendTelegram(token, chatId, '❌ Order not found.');
  if (order.status !== 'delivered') {
    return sendTelegram(token, chatId, `❌ Cannot send review request for status "${order.status}". Mark the order delivered first.`);
  }
  if (order.review_request_sent_at) {
    return sendTelegram(token, chatId, `❌ Review request was already sent for ${orderNumber}.`);
  }

  const items = await getItems(supabase, order.id);
  const now = new Date().toISOString();

  await sendReviewRequestEmail({
    to: order.email,
    orderNumber: order.order_number,
    items,
  });

  await supabase.from('orders').update({ review_request_sent_at: now }).eq('id', order.id);

  await supabase.from('admin_audit_log').insert({
    action: 'review_request_sent', order_id: order.id,
    payload: { order_number: orderNumber, source: 'telegram_bot' },
  });

  await sendTelegram(token, chatId, `✅ <b>Review request sent</b>\nOrder: ${orderNumber}\nEmail sent to ${order.email}`);
}

/* ---------- /approvereview + /rejectreview ---------- */

async function findPendingReviewByCode(supabase, code) {
  const cleanCode = String(code || '').trim().toLowerCase();
  if (!cleanCode || cleanCode.length < 6 || !/^[a-f0-9-]+$/.test(cleanCode)) {
    return { error: 'invalid_code' };
  }

  const { data, error } = await supabase
    .from('reviews_pending')
    .select('id, initials, product, rating, review_text, status, reviewer_name, order_number, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;

  const matches = (data || []).filter((review) => String(review.id || '').toLowerCase().startsWith(cleanCode));
  if (matches.length === 0) return { error: 'not_found' };
  if (matches.length > 1) return { error: 'ambiguous' };
  return { review: matches[0] };
}

async function handleApproveReview(token, chatId, args) {
  const reviewCode = String(args[0] || '').trim();
  if (!reviewCode) return sendTelegram(token, chatId, 'Usage: /approvereview &lt;reviewCode&gt;');

  const supabase = getSupabaseAdmin();
  const found = await findPendingReviewByCode(supabase, reviewCode);
  if (found.error === 'invalid_code') return sendTelegram(token, chatId, 'Invalid review code. Use the code from the pending review alert.');
  if (found.error === 'not_found') return sendTelegram(token, chatId, `Review not found for code: ${escapeTelegram(reviewCode)}`);
  if (found.error === 'ambiguous') return sendTelegram(token, chatId, `More than one review matches ${escapeTelegram(reviewCode)}. Use a longer code.`);

  const review = found.review;
  if (review.status !== 'pending') {
    return sendTelegram(token, chatId, `Review ${escapeTelegram(reviewCode)} is already ${escapeTelegram(review.status)}.`);
  }

  const { error: insertError } = await supabase.from('reviews_public').insert({
    initials: review.initials,
    product: review.product,
    rating: review.rating,
    review_text: review.review_text,
    review_date: new Date().toISOString().slice(0, 10),
  });
  if (insertError) throw insertError;

  const { error: updateError } = await supabase
    .from('reviews_pending')
    .update({ status: 'approved' })
    .eq('id', review.id);
  if (updateError) throw updateError;

  const productLabel = PRODUCT_LABELS[review.product] || review.product;
  await sendTelegram(
    token,
    chatId,
    `OK <b>Review approved and published</b>\nCode: <code>${escapeTelegram(String(review.id).slice(0, 8))}</code>\nProduct: ${escapeTelegram(productLabel)}\nRating: ${review.rating}/5`
  );
}

async function handleRejectReview(token, chatId, args) {
  const reviewCode = String(args[0] || '').trim();
  const reason = args.slice(1).join(' ').trim();
  if (!reviewCode) return sendTelegram(token, chatId, 'Usage: /rejectreview &lt;reviewCode&gt; [reason]');

  const supabase = getSupabaseAdmin();
  const found = await findPendingReviewByCode(supabase, reviewCode);
  if (found.error === 'invalid_code') return sendTelegram(token, chatId, 'Invalid review code. Use the code from the pending review alert.');
  if (found.error === 'not_found') return sendTelegram(token, chatId, `Review not found for code: ${escapeTelegram(reviewCode)}`);
  if (found.error === 'ambiguous') return sendTelegram(token, chatId, `More than one review matches ${escapeTelegram(reviewCode)}. Use a longer code.`);

  const review = found.review;
  if (review.status !== 'pending') {
    return sendTelegram(token, chatId, `Review ${escapeTelegram(reviewCode)} is already ${escapeTelegram(review.status)}.`);
  }

  const { error } = await supabase
    .from('reviews_pending')
    .update({ status: 'rejected' })
    .eq('id', review.id);
  if (error) throw error;

  const productLabel = PRODUCT_LABELS[review.product] || review.product;
  await sendTelegram(
    token,
    chatId,
    `OK <b>Review rejected</b>\nCode: <code>${escapeTelegram(String(review.id).slice(0, 8))}</code>\nProduct: ${escapeTelegram(productLabel)}${reason ? `\nReason: ${escapeTelegram(reason)}` : ''}`
  );
}

/* ---------- /cancel ---------- */

async function handleCancel(token, chatId, args) {
  const Stripe = require('stripe');
  const orderNumber = normalizeOrderNumber(args[0]);
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
  let stripeRefund = null;
  if (wasPaid) {
    if (order.payment_provider === 'fena') {
      return sendTelegram(token, chatId, '⚠️ This is a Fena Pay by Bank order. Create the reverse payment/refund in Fena first, then cancel the order without an automatic Stripe refund.');
    }
    if (!process.env.STRIPE_SECRET_KEY) return sendTelegram(token, chatId, '❌ Missing Stripe config.');
    if (!order.stripe_session_id) return sendTelegram(token, chatId, '❌ No Stripe session found for this order.');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
    if (!session.payment_intent) return sendTelegram(token, chatId, '❌ No payment intent found for this order.');
    stripeRefund = await stripe.refunds.create({
      payment_intent: session.payment_intent,
      reason: reason ? 'requested_by_customer' : undefined,
      metadata: { order_number: orderNumber, reason: reason || 'telegram_cancel' },
    }, {
      idempotencyKey: `refund-${order.id}`,
    });
  }

  await supabase.from('orders').update({
    status: stripeRefund ? 'refunded' : 'cancelled',
    cancellation_reason: reason,
    refunded_at: stripeRefund ? new Date().toISOString() : null,
    stripe_refund_id: stripeRefund?.id || null,
  }).eq('id', order.id);

  await sendOrderCancelledEmail({
    to: order.email, orderNumber: order.order_number, items, total: order.total, refundInitiated: !!stripeRefund,
  });

  await supabase.from('admin_audit_log').insert({
    action: 'order_cancelled', order_id: order.id,
    payload: {
      order_number: orderNumber,
      reason,
      was_paid: wasPaid,
      stripe_refund_id: stripeRefund?.id || null,
      source: 'telegram_bot',
    },
  });

  await sendTelegram(token, chatId, `✅ <b>Order cancelled</b>\nOrder: ${orderNumber}\nRefund processed: ${stripeRefund ? 'Yes' : 'No'}\nEmail sent to ${order.email}`);
}

/* ---------- /refund ---------- */

async function handleRefund(token, chatId, args) {
  const Stripe = require('stripe');

  const orderNumber = normalizeOrderNumber(args[0]);
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
