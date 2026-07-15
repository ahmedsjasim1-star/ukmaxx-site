const Stripe = require('stripe');
const { getSupabaseAdmin } = require('./_lib/supabase');
const { sendTelegramOrderAlert } = require('./_lib/notify');
const { sendOrderConfirmationEmail, sendAdminOrderAlertEmail } = require('./_lib/email');

function moneyFromPence(value) {
  return Number(value || 0) / 100;
}

function normalizeCart(raw) {
  const quantities = new Map();
  for (const item of Array.isArray(raw) ? raw : []) {
    const sku = String(item?.sku || '').trim().toUpperCase();
    const qty = Number(item?.qty);
    if (!sku || !Number.isSafeInteger(qty) || qty < 1 || qty > 50) continue;
    quantities.set(sku, (quantities.get(sku) || 0) + qty);
  }
  return [...quantities].map(([sku, qty]) => ({ sku, qty }));
}

function orderNumberFor(session) {
  return `UKX-${new Date().getFullYear()}-${session.id.slice(-8).toUpperCase()}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).send('Webhook is not configured');
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let event;
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const raw = Buffer.concat(chunks);
    event = stripe.webhooks.constructEvent(raw, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  const supabase = getSupabaseAdmin();
  const allowReplay = String(process.env.WEBHOOK_ALLOW_DUPLICATE_REPLAY || '').toLowerCase() === 'true';
  let claimed = false;

  if (!allowReplay) {
    const { error: claimError } = await supabase.from('stripe_events').insert({
      stripe_event_id: event.id,
      event_type: event.type,
      payload: event,
    });
    if (claimError?.code === '23505') return res.status(200).json({ received: true, duplicate: true });
    if (claimError) {
      console.error('stripe-webhook-claim-error', { eventId: event.id, error: claimError.message });
      return res.status(500).json({ error: 'Unable to claim event' });
    }
    claimed = true;
  }

  try {
    if (event.type === 'checkout.session.completed' && event.data.object.payment_status === 'paid') {
      await processCheckoutSession({ stripe, supabase, session: event.data.object });
    } else if (event.type === 'checkout.session.async_payment_succeeded') {
      await processCheckoutSession({ stripe, supabase, session: event.data.object });
    } else if (event.type === 'checkout.session.expired') {
      await notifyFailure('Checkout expired', event.data.object);
    } else if (event.type === 'checkout.session.async_payment_failed') {
      await notifyFailure('Async payment failed', event.data.object);
    } else if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object;
      await sendTelegramOrderAlert(
        `❌ <b>Payment failed</b>\nEmail: ${paymentIntent.receipt_email || 'unknown'}\n`
        + `Payment intent: <code>${paymentIntent.id}</code>\n`
        + `Error: ${paymentIntent.last_payment_error?.message || 'No details'}`,
      );
    }

    if (allowReplay) {
      await supabase.from('stripe_events').upsert({
        stripe_event_id: event.id,
        event_type: event.type,
        payload: event,
      }, { onConflict: 'stripe_event_id' });
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    if (claimed) {
      await supabase.from('stripe_events').delete().eq('stripe_event_id', event.id);
    }
    console.error('stripe-webhook-processing-error', {
      type: event.type,
      id: event.id,
      message: error?.message,
      stack: error?.stack,
    });
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};

async function notifyFailure(label, session) {
  try {
    await sendTelegramOrderAlert(
      `⚠️ <b>${label}</b>\nEmail: ${session.customer_details?.email || session.customer_email || 'unknown'}\n`
      + `Session: <code>${session.id}</code>`,
    );
  } catch (error) {
    console.error('stripe-failure-notification-error', { label, sessionId: session.id, error: error?.message });
  }
}

async function processCheckoutSession({ stripe, supabase, session }) {
  const prior = await supabase
    .from('orders')
    .select('*')
    .eq('stripe_session_id', session.id)
    .maybeSingle();
  if (prior.error) throw prior.error;
  if (prior.data) {
    const items = await getOrderItems(supabase, prior.data.id);
    await sendNotifications(supabase, prior.data, items, session.id);
    return;
  }

  let cart = [];
  try {
    cart = normalizeCart(JSON.parse(session.metadata?.cart || '[]'));
  } catch {
    cart = [];
  }
  if (!cart.length) {
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
      limit: 100,
      expand: ['data.price.product'],
    });
    cart = normalizeCart((lineItems.data || []).map((line) => ({
      sku: line.price?.product?.metadata?.sku || line.price?.metadata?.sku || '',
      qty: Number(line.quantity || 0),
    })));
  }
  if (!cart.length) throw new Error('empty_cart');

  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('sku,name,price,is_active')
    .in('sku', cart.map((item) => item.sku));
  if (productsError) throw productsError;
  const bySku = new Map((products || []).map((product) => [product.sku, product]));
  const orderItems = cart.map((item) => {
    const product = bySku.get(item.sku);
    if (!product || !product.is_active) throw new Error(`missing_or_inactive_product_${item.sku}`);
    return {
      sku: item.sku,
      product_name: product.name,
      qty: item.qty,
      price: Number(product.price),
      line_total: Number(product.price) * item.qty,
    };
  });

  const shippingDetails = session.collected_information?.shipping_details || session.shipping_details;
  const address = shippingDetails?.address || session.customer_details?.address || {};
  const totals = {
    subtotal: moneyFromPence(session.amount_subtotal),
    discount: moneyFromPence(session.total_details?.amount_discount),
    shipping: moneyFromPence(session.shipping_cost?.amount_total),
    total: moneyFromPence(session.amount_total),
  };
  if (totals.total <= 0) throw new Error('invalid_paid_total');

  const { data: order, error: orderError } = await supabase.rpc('create_paid_order', {
    p_order_number: orderNumberFor(session),
    p_stripe_session_id: session.id,
    p_email: String(session.customer_details?.email || session.customer_email || '').toLowerCase(),
    p_full_name: shippingDetails?.name || session.customer_details?.name || 'Customer',
    p_phone: session.customer_details?.phone || null,
    p_address_line1: address.line1 || '',
    p_address_line2: address.line2 || null,
    p_city: address.city || '',
    p_postcode: address.postal_code || '',
    p_country: address.country || 'GB',
    p_subtotal: totals.subtotal,
    p_discount: totals.discount,
    p_shipping: totals.shipping,
    p_total: totals.total,
    p_currency: session.currency || 'gbp',
    p_promo_opt_in: session.metadata?.promo_opt_in === 'true',
    p_items: orderItems,
  });
  if (orderError) throw orderError;

  if (order.promo_opt_in && order.email) {
    const { error } = await supabase.from('subscribers').upsert({
      email: order.email,
      source: 'checkout_optin',
      promo_opt_in: true,
      consent_timestamp: new Date().toISOString(),
    }, { onConflict: 'email' });
    if (error) console.error('checkout-optin-error', { orderId: order.id, error: error.message });
  }

  if (String(session.metadata?.promo_code || '').toUpperCase() === 'MAXX10' && order.email) {
    const { error } = await supabase.from('promo_redemptions').upsert({
      email: order.email,
      promo_code: 'MAXX10',
      stripe_session_id: session.id,
      order_id: order.id,
      redeemed_at: new Date().toISOString(),
    }, { onConflict: 'email,promo_code' });
    if (error) throw error;
  }

  await sendNotifications(supabase, order, orderItems, session.id);
}

async function getOrderItems(supabase, orderId) {
  const { data, error } = await supabase
    .from('order_items')
    .select('sku,product_name,qty,price,line_total')
    .eq('order_id', orderId);
  if (error) throw error;
  return data || [];
}

async function sendNotifications(supabase, order, orderItems, stripeSessionId) {
  const { data: sent } = await supabase
    .from('admin_audit_log')
    .select('id')
    .eq('action', 'notifications_sent')
    .eq('order_id', order.id)
    .maybeSingle();
  if (sent) return;

  const itemText = orderItems.map((item) => `• ${item.product_name} x${item.qty}`).join('\n');
  const address = [
    order.shipping_address_line1,
    order.shipping_address_line2,
    order.shipping_city,
    order.shipping_postcode,
    order.shipping_country,
  ].filter(Boolean).join(', ');

  try {
    await sendTelegramOrderAlert(
      `✅ <b>NEW ORDER</b>\nOrder: <b>${order.order_number}</b>\n`
      + `Total: <b>£${Number(order.total).toFixed(2)}</b>\nCustomer: ${order.email}\n`
      + `Name: ${order.full_name || 'N/A'}\nPhone: ${order.phone || 'N/A'}\n`
      + `${itemText}\nAddress: ${address}\nSession: <code>${stripeSessionId}</code>`,
    );
  } catch (error) {
    console.error('telegram-alert-failed', { orderId: order.id, error: error?.message });
  }

  await sendOrderConfirmationEmail({
    to: order.email,
    orderNumber: order.order_number,
    items: orderItems,
    total: order.total,
    shipping: {
      line1: order.shipping_address_line1,
      line2: order.shipping_address_line2,
      city: order.shipping_city,
      postcode: order.shipping_postcode,
      country: order.shipping_country,
    },
  });
  await sendAdminOrderAlertEmail({
    orderNumber: order.order_number,
    customerEmail: order.email,
    fullName: order.full_name,
    phone: order.phone,
    items: orderItems,
    total: order.total,
    shipping: {
      line1: order.shipping_address_line1,
      line2: order.shipping_address_line2,
      city: order.shipping_city,
      postcode: order.shipping_postcode,
      country: order.shipping_country,
    },
    stripeSessionId,
  });

  const { error } = await supabase.from('admin_audit_log').insert({
    action: 'notifications_sent',
    order_id: order.id,
    payload: { stripe_session_id: stripeSessionId },
  });
  if (error) throw error;
}

module.exports.config = { api: { bodyParser: false } };
