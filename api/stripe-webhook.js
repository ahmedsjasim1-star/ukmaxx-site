const Stripe = require('stripe');
const { getSupabaseAdmin } = require('./_lib/supabase');
const { sendTelegramAdminAlert } = require('./_lib/notify');
const { sendOrderConfirmationEmail, sendAdminOrderAlertEmail } = require('./_lib/email');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const raw = Buffer.concat(chunks);
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET || '');
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const supabase = getSupabaseAdmin();
  const allowDuplicateReplay = String(process.env.WEBHOOK_ALLOW_DUPLICATE_REPLAY || '').toLowerCase() === 'true';
  const existing = await supabase.from('stripe_events').select('id').eq('stripe_event_id', event.id).maybeSingle();
  if (existing.data && !allowDuplicateReplay) {
    console.log('stripe-webhook-duplicate-event-skipped', { eventId: event.id, eventType: event.type });
    return res.status(200).json({ received: true, duplicate: true });
  }
  if (existing.data && allowDuplicateReplay) {
    console.log('stripe-webhook-duplicate-event-replay-allowed', { eventId: event.id, eventType: event.type });
  }

  const sendNotifications = async (order, orderItems, stripeSessionId) => {
    const alreadySent = await supabase.from('admin_audit_log').select('id').eq('action', 'notifications_sent').eq('order_id', order.id).maybeSingle();
    if (alreadySent.data && !allowDuplicateReplay) {
      console.log('stripe-webhook-notifications-already-sent-skipped', { orderId: order.id, stripeSessionId });
      return;
    }
    if (alreadySent.data && allowDuplicateReplay) {
      console.log('stripe-webhook-notifications-replay-allowed', { orderId: order.id, stripeSessionId });
    }

    try {
      await supabase.from('admin_audit_log').insert({ action: 'notifications_sent', order_id: order.id, payload: { stripe_session_id: stripeSessionId, replay: allowDuplicateReplay } });
    } catch (e) {
      console.error('audit-log-insert-failed', { orderId: order.id, error: e?.message });
    }

    const itemText = orderItems.map(i => `• ${i.product_name} x${i.qty}`).join('\n');
    const fullName = order.full_name || 'N/A';
    const phone = order.phone || 'N/A';
    const addressLines = [
      order.shipping_address_line1,
      order.shipping_address_line2,
      order.shipping_city,
      order.shipping_postcode,
      order.shipping_country,
    ].filter(Boolean);
    const fullAddress = addressLines.join(', ');

    try {
      await sendTelegramAdminAlert(`✅ <b>NEW ORDER</b>\nOrder: <b>${order.order_number}</b>\nTotal: <b>£${Number(order.total).toFixed(2)}</b>\nCustomer: ${order.email}\nName: ${fullName}\nPhone: ${phone}\n${itemText}\nAddress: ${fullAddress}\nSession: <code>${stripeSessionId}</code>`);
      console.log('telegram-alert-sent', { orderId: order.id, stripeSessionId });
    } catch (err) {
      console.error('telegram-alert-failed', {
        orderId: order.id,
        stripeSessionId,
        message: err?.message,
        stack: err?.stack,
      });
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
  };

  const processCheckoutSession = async (session) => {
    const stripeSessionId = session.id;
    const priorOrder = await supabase.from('orders').select('id,order_number,email,full_name,phone,total,shipping_postcode,shipping_country,shipping_address_line1,shipping_address_line2,shipping_city').eq('stripe_session_id', stripeSessionId).maybeSingle();
    if (priorOrder.data) {
      const { data: priorItems } = await supabase.from('order_items').select('product_name,qty,line_total').eq('order_id', priorOrder.data.id);
      await sendNotifications(priorOrder.data, priorItems || [], stripeSessionId);
      return;
    }

    let cart = [];
    try { cart = JSON.parse(session.metadata?.cart || '[]'); } catch (_) { cart = []; }

    if (!Array.isArray(cart) || !cart.length) {
      const li = await stripe.checkout.sessions.listLineItems(stripeSessionId, { limit: 100 });
      cart = (li.data || [])
        .map((x) => {
          const sku = x.price?.product_details?.metadata?.sku || x.price?.metadata?.sku || '';
          if (!sku || sku === 'SHIPPING') return null;
          return { sku, qty: Number(x.quantity || 0) };
        })
        .filter(Boolean);
    }

    if (!cart.length) throw new Error('empty_cart');

    const skus = [...new Set(cart.map(i => i.sku))];
    const { data: products } = await supabase.from('products').select('sku,name,price,stock_quantity').in('sku', skus);
    const bySku = new Map((products || []).map(p => [p.sku, p]));

    const orderItems = [];
    for (const i of cart) {
      const p = bySku.get(i.sku);
      if (!p) throw new Error(`missing_product_${i.sku}`);
      const lineTotal = Number(p.price) * Number(i.qty);
      orderItems.push({ sku: i.sku, product_name: p.name, qty: i.qty, price: p.price, line_total: lineTotal });
    }
    const subtotal = orderItems.reduce((a, b) => a + Number(b.line_total), 0);
    const shipping = 4.99;
    const total = subtotal + shipping;
    const orderNumber = `UKX-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random()*9000))}`;

    const { data: order, error: orderErr } = await supabase.from('orders').insert({
      order_number: orderNumber,
      stripe_session_id: stripeSessionId,
      email: (session.customer_details?.email || '').toLowerCase(),
      full_name: session.metadata?.full_name || session.customer_details?.name || 'Customer',
      phone: session.customer_details?.phone || null,
      shipping_address_line1: session.shipping_details?.address?.line1 || session.metadata?.address_line1 || '',
      shipping_address_line2: session.shipping_details?.address?.line2 || session.metadata?.address_line2 || null,
      shipping_city: session.shipping_details?.address?.city || session.metadata?.city || '',
      shipping_postcode: session.shipping_details?.address?.postal_code || session.metadata?.postcode || '',
      shipping_country: session.shipping_details?.address?.country || session.metadata?.country || 'GB',
      subtotal,
      discount: 0,
      shipping,
      total,
      currency: 'gbp',
      status: 'paid',
      promo_opt_in: session.metadata?.promo_opt_in === 'true',
    }).select('*').single();
    if (orderErr) throw new Error('order_create_failed');

    await supabase.from('order_items').insert(orderItems.map(i => ({ ...i, order_id: order.id })));
    for (const i of cart) {
      try {
        await supabase.rpc('decrement_stock', { p_sku: i.sku, p_qty: i.qty });
      } catch (_) {
        const p = bySku.get(i.sku);
        await supabase.from('products').update({ stock_quantity: Math.max(0, Number(p.stock_quantity) - Number(i.qty)) }).eq('sku', i.sku);
      }
    }

    if (order.promo_opt_in && order.email) {
      await supabase.from('subscribers').upsert({ email: order.email.toLowerCase(), source: 'checkout_optin', promo_opt_in: true, consent_timestamp: new Date().toISOString() }, { onConflict: 'email' });
    }

    const promoCode = String(session.metadata?.promo_code || '').toUpperCase();
    if (promoCode === 'MAXX15' && order.email) {
      await supabase.from('promo_redemptions').upsert({
        email: order.email.toLowerCase(),
        promo_code: 'MAXX15',
        stripe_session_id: stripeSessionId,
        order_id: order.id,
        redeemed_at: new Date().toISOString(),
      }, { onConflict: 'email,promo_code' });
    }

    await sendNotifications(order, orderItems, stripeSessionId);
  };

  try {
    if (event.type === 'checkout.session.completed') {
      await processCheckoutSession(event.data.object);
    }

    /* ---------- Failure / Cancellation events ---------- */

    if (event.type === 'checkout.session.expired') {
      const s = event.data.object;
      const email = s.customer_details?.email || s.customer_email || 'unknown';
      console.log('stripe-webhook-checkout-expired', { sessionId: s.id, email, metadata: s.metadata });
      if (email && email !== 'unknown') {
        try {
          await sendTelegramAdminAlert(`⚠️ <b>Checkout expired</b>\nEmail: ${email}\nSession: <code>${s.id}</code>`);
        } catch (_) {}
      }
    }

    if (event.type === 'checkout.session.async_payment_failed') {
      const s = event.data.object;
      const email = s.customer_details?.email || s.customer_email || 'unknown';
      console.error('stripe-webhook-async-payment-failed', { sessionId: s.id, email, metadata: s.metadata });
      try {
        await sendTelegramAdminAlert(`❌ <b>Async payment failed</b>\nEmail: ${email}\nSession: <code>${s.id}</code>`);
      } catch (_) {}
    }

    if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object;
      const email = pi.receipt_email || 'unknown';
      const lastError = pi.last_payment_error?.message || 'no details';
      console.error('stripe-webhook-payment-intent-failed', { paymentIntentId: pi.id, email, error: lastError });
      let sessionId = 'unknown';
      try {
        const list = await stripe.checkout.sessions.list({ payment_intent: pi.id, limit: 1 });
        sessionId = list.data?.[0]?.id || 'unknown';
      } catch (_) {}
      try {
        await sendTelegramAdminAlert(`❌ <b>Payment failed</b>\nEmail: ${email}\nSession: <code>${sessionId}</code>\nError: ${lastError}`);
      } catch (_) {}
    }
  } catch (err) {
    console.error('stripe-webhook-processing-error', { type: event.type, id: event.id, message: err?.message, stack: err?.stack });
    return res.status(500).json({ error: { code: '500', message: err?.message || 'A server error has occurred' } });
  }

  await supabase.from('stripe_events').insert({ stripe_event_id: event.id, event_type: event.type, payload: event });

  return res.status(200).json({ received: true });
};

module.exports.config = { api: { bodyParser: false } };