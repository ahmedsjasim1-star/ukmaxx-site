const { getSupabaseAdmin } = require('./_lib/supabase');
const { getPaymentById } = require('./_lib/fena');
const { sendTelegramAdminAlert } = require('./_lib/notify');
const { sendOrderConfirmationEmail, sendAdminOrderAlertEmail } = require('./_lib/email');

function asMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  if (!process.env.FENA_TERMINAL_ID || !process.env.FENA_TERMINAL_SECRET) {
    return res.status(503).send('Fena webhook is not configured');
  }

  const payload = req.body || {};
  const paymentId = String(payload.id || payload.payment_id || '').trim();
  const reference = String(payload.reference || payload.order_id || '').trim().toUpperCase();
  const status = normalizeStatus(payload.status);
  const eventName = String(payload.eventName || 'status-update');

  if (!paymentId && !reference) return res.status(400).json({ error: 'Missing Fena payment reference' });

  const supabase = getSupabaseAdmin();
  try {
    await supabase.from('fena_events').insert({
      fena_payment_id: paymentId || null,
      payment_reference: reference || null,
      event_name: eventName,
      status: status || null,
      payload,
    });
  } catch (error) {
    if (error?.code !== '23505') {
      console.error('fena-event-log-error', { message: error?.message });
    }
  }

  try {
    const { attempt, verifiedPayment } = await getAttemptAndVerifiedPayment(supabase, { paymentId, reference });
    if (!attempt) return res.status(404).json({ error: 'Payment attempt not found' });

    const verifiedStatus = normalizeStatus(verifiedPayment.status || status);
    await supabase
      .from('payment_attempts')
      .update({
        provider_payment_id: verifiedPayment.id || paymentId || attempt.provider_payment_id,
        status: verifiedStatus || status || attempt.status,
        provider_payload: verifiedPayment,
      })
      .eq('id', attempt.id);

    if (verifiedStatus === 'paid') {
      await processPaidPayment({ supabase, attempt, verifiedPayment });
    } else if (['rejected', 'cancelled', 'overdue', 'refund rejected'].includes(verifiedStatus)) {
      await notifyNonPaidStatus(attempt, verifiedStatus, verifiedPayment);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('fena-webhook-processing-error', {
      paymentId,
      reference,
      status,
      message: error?.message,
      stack: error?.stack,
      data: error?.data,
    });
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};

async function getAttemptAndVerifiedPayment(supabase, { paymentId, reference }) {
  let query = supabase.from('payment_attempts').select('*').eq('payment_provider', 'fena');
  if (paymentId) query = query.eq('provider_payment_id', paymentId);
  else query = query.eq('payment_reference', reference);

  let { data: attempt, error } = await query.maybeSingle();
  if (error) throw error;

  if (!attempt && reference) {
    const fallback = await supabase
      .from('payment_attempts')
      .select('*')
      .eq('payment_provider', 'fena')
      .eq('payment_reference', reference)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    attempt = fallback.data;
  }

  const idToVerify = paymentId || attempt?.provider_payment_id;
  if (!idToVerify) return { attempt, verifiedPayment: {} };

  const response = await getPaymentById(idToVerify);
  return { attempt, verifiedPayment: response?.data || response?.result || response || {} };
}

async function processPaidPayment({ supabase, attempt, verifiedPayment }) {
  const payload = attempt.payload || {};
  const reference = String(attempt.payment_reference || payload.orderNumber || '').toUpperCase();

  const existing = await supabase
    .from('orders')
    .select('*')
    .eq('payment_provider', 'fena')
    .eq('payment_reference', reference)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    const items = await getOrderItems(supabase, existing.data.id);
    await sendNotifications(supabase, existing.data, items, verifiedPayment.id || attempt.provider_payment_id);
    return;
  }

  if (asMoney(verifiedPayment.amount) !== asMoney(payload.total)) {
    throw new Error(`amount_mismatch_${verifiedPayment.amount}_${payload.total}`);
  }

  const { data: order, error: orderError } = await supabase.rpc('create_paid_order_v2', {
    p_order_number: payload.orderNumber || reference,
    p_payment_provider: 'fena',
    p_payment_reference: reference,
    p_fena_payment_id: verifiedPayment.id || attempt.provider_payment_id || null,
    p_stripe_session_id: null,
    p_email: String(payload.email || '').toLowerCase(),
    p_full_name: payload.fullName || 'Customer',
    p_phone: payload.phone || null,
    p_address_line1: payload.shipping?.line1 || '',
    p_address_line2: payload.shipping?.line2 || null,
    p_city: payload.shipping?.city || '',
    p_postcode: payload.shipping?.postcode || '',
    p_country: payload.shipping?.country || 'GB',
    p_subtotal: payload.subtotal,
    p_discount: payload.discount,
    p_shipping: payload.shippingCost,
    p_total: payload.total,
    p_currency: payload.currency || 'gbp',
    p_promo_opt_in: !!payload.promo_opt_in,
    p_items: payload.items || [],
  });
  if (orderError) throw orderError;

  await supabase
    .from('payment_attempts')
    .update({ status: 'paid', order_id: order.id, provider_payload: verifiedPayment })
    .eq('id', attempt.id);

  if (order.promo_opt_in && order.email) {
    const { error } = await supabase.from('subscribers').upsert({
      email: order.email,
      source: 'checkout_optin',
      promo_opt_in: true,
      consent_timestamp: new Date().toISOString(),
    }, { onConflict: 'email' });
    if (error) console.error('fena-checkout-optin-error', { orderId: order.id, error: error.message });
  }

  if (String(payload.promo_code || '').toUpperCase() === 'MAXX10' && order.email) {
    const { error } = await supabase.from('promo_redemptions').upsert({
      email: order.email,
      promo_code: 'MAXX10',
      stripe_session_id: null,
      payment_provider: 'fena',
      payment_reference: reference,
      fena_payment_id: verifiedPayment.id || attempt.provider_payment_id || null,
      order_id: order.id,
      redeemed_at: new Date().toISOString(),
    }, { onConflict: 'email,promo_code' });
    if (error) throw error;
  }

  await sendNotifications(supabase, order, payload.items || [], verifiedPayment.id || attempt.provider_payment_id);
}

async function notifyNonPaidStatus(attempt, status, verifiedPayment) {
  try {
    await sendTelegramAdminAlert(
      `⚠️ <b>Fena payment ${status}</b>\n`
      + `Order: <code>${attempt.payment_reference}</code>\n`
      + `Payment: <code>${verifiedPayment.id || attempt.provider_payment_id || 'unknown'}</code>`,
    );
  } catch (error) {
    console.error('fena-nonpaid-notification-error', { attemptId: attempt.id, error: error?.message });
  }
}

async function getOrderItems(supabase, orderId) {
  const { data, error } = await supabase
    .from('order_items')
    .select('sku,product_name,qty,price,line_total')
    .eq('order_id', orderId);
  if (error) throw error;
  return data || [];
}

async function sendNotifications(supabase, order, orderItems, fenaPaymentId) {
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
    await sendTelegramAdminAlert(
      `✅ <b>NEW PAY BY BANK ORDER</b>\nOrder: <b>${order.order_number}</b>\n`
      + `Total: <b>£${Number(order.total).toFixed(2)}</b>\nCustomer: ${order.email}\n`
      + `Name: ${order.full_name || 'N/A'}\nPhone: ${order.phone || 'N/A'}\n`
      + `${itemText}\nAddress: ${address}\nFena payment: <code>${fenaPaymentId || 'N/A'}</code>`,
    );
  } catch (error) {
    console.error('fena-telegram-alert-failed', { orderId: order.id, error: error?.message });
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
    stripeSessionId: `Fena: ${fenaPaymentId || 'N/A'}`,
  });

  const { error } = await supabase.from('admin_audit_log').insert({
    action: 'notifications_sent',
    order_id: order.id,
    payload: { payment_provider: 'fena', fena_payment_id: fenaPaymentId || null },
  });
  if (error) throw error;
}
