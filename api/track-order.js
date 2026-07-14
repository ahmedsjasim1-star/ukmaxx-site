const crypto = require('crypto');
const { getSupabaseAdmin } = require('./_lib/supabase');
const { sendTelegramAdminAlert } = require('./_lib/notify');

module.exports = async (req, res) => {
  if (req.method === 'GET' && req.query?.type === 'reviews') return handleReviewsList(req, res);
  if (req.method === 'POST' && req.body?.type === 'submit-review') return handleReviewSubmit(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { reference } = req.body || {};
    const normRef = String(reference || '').trim().toUpperCase();
    if (!normRef) return res.status(400).json({ error: 'Missing reference' });

    const authorization = String(req.headers.authorization || '');
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const supabase = getSupabaseAdmin();
    let normEmail = null;

    if (token) {
      const { data: authData, error: authError } = await supabase.auth.getUser(token);
      if (!authError && authData?.user?.email) {
        normEmail = authData.user.email.toLowerCase();
      }
    }

    let query = supabase
      .from('orders')
      .select('id,order_number,email,status,created_at,subtotal,shipping,total,currency,full_name,shipping_address_line1,shipping_address_line2,shipping_city,shipping_postcode,shipping_country,tracking_number,tracking_url,dispatched_at,delivered_at')
      .eq('order_number', normRef);

    const { data: order, error } = await query.maybeSingle();

    if (error) {
      console.error('track-order-db-error', { reference: normRef, error: error?.message });
      return res.status(500).json({ error: 'Database error' });
    }
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const { data: items } = await supabase
      .from('order_items')
      .select('sku,product_name,qty,line_total')
      .eq('order_id', order.id);

    const enriched = await Promise.all((items || []).map(async (i) => {
      const { data: prod } = await supabase
        .from('products')
        .select('image_url')
        .eq('sku', i.sku)
        .maybeSingle();
      return { ...i, image_url: prod?.image_url || null };
    }));

    const canShowPrivateDetails = !!normEmail && String(order.email || '').toLowerCase() === normEmail;

    return res.json({
      order: {
        order_number: order.order_number,
        status: order.status,
        created_at: order.created_at,
        subtotal: order.subtotal,
        shipping: order.shipping,
        total: order.total,
        currency: order.currency,
        full_name: canShowPrivateDetails ? order.full_name : null,
        shipping_address_line1: canShowPrivateDetails ? order.shipping_address_line1 : null,
        shipping_address_line2: canShowPrivateDetails ? order.shipping_address_line2 : null,
        shipping_city: canShowPrivateDetails ? order.shipping_city : null,
        shipping_postcode: canShowPrivateDetails ? order.shipping_postcode : null,
        shipping_country: canShowPrivateDetails ? order.shipping_country : null,
        carrier: 'Royal Mail · Tracked 24',
        tracking_number: order.tracking_number,
        tracking_url: order.tracking_url,
        estimated_delivery: null,
        dispatched_at: order.dispatched_at,
        delivered_at: order.delivered_at,
        items: enriched,
      }
    });
  } catch (e) {
    console.error('track-order-error', { message: e?.message, stack: e?.stack });
    return res.status(500).json({ error: 'Server error' });
  }
};

async function handleReviewsList(req, res) {
  try {
    const product = String(req.query?.product || '').trim().toUpperCase();
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('reviews_public')
      .select('initials,product,rating,review_text,review_date,created_at')
      .order('review_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(24);

    if (product) query = query.eq('product', product);

    const { data, error } = await query;
    if (error) {
      console.error('reviews-list-db-error', { error: error?.message });
      return res.status(500).json({ error: 'Database error' });
    }
    return res.status(200).json({ reviews: data || [] });
  } catch (e) {
    console.error('reviews-list-error', { message: e?.message, stack: e?.stack });
    return res.status(500).json({ error: 'Server error' });
  }
}

async function handleReviewSubmit(req, res) {
  try {
    const { initials, reviewerName, product, rating, reviewText, orderNumber, email, hp } = req.body || {};
    if (hp) return res.status(200).json({ ok: true });

    const cleanInitials = String(initials || '').trim().replace(/[^a-z0-9. -]/gi, '').slice(0, 16);
    const cleanProduct = String(product || '').trim().toUpperCase().slice(0, 32);
    const cleanText = String(reviewText || '').trim().replace(/\s+/g, ' ').slice(0, 500);
    const cleanRating = Number(rating);
    const cleanOrderNumber = String(orderNumber || '').trim().toUpperCase().slice(0, 32);
    const cleanEmail = String(email || '').trim().toLowerCase().slice(0, 180);
    const cleanReviewerName = String(reviewerName || '').trim().replace(/[^a-z0-9.' -]/gi, '').replace(/\s+/g, ' ').slice(0, 80);

    if (!cleanInitials || !cleanReviewerName || !cleanProduct || !cleanText || !cleanOrderNumber || !cleanEmail) {
      return res.status(400).json({ error: 'missing_fields' });
    }
    if (!Number.isInteger(cleanRating) || cleanRating < 1 || cleanRating > 5) {
      return res.status(400).json({ error: 'invalid_rating' });
    }
    if (cleanText.length < 12) return res.status(400).json({ error: 'review_too_short' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return res.status(400).json({ error: 'invalid_email' });

    const supabase = getSupabaseAdmin();
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, email, status')
      .eq('order_number', cleanOrderNumber)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order || String(order.email || '').toLowerCase() !== cleanEmail) {
      return res.status(404).json({ error: 'order_not_found' });
    }
    if (order.status !== 'delivered') {
      return res.status(409).json({ error: 'order_not_delivered' });
    }

    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('sku')
      .eq('order_id', order.id);
    if (itemsError) throw itemsError;
    const orderedSkus = new Set((items || []).map((i) => String(i.sku || '').trim().toUpperCase()));
    if (!orderedSkus.has(cleanProduct) && !(cleanProduct === 'RT10' && orderedSkus.has('RT10X3'))) {
      return res.status(403).json({ error: 'product_not_in_order' });
    }

    const emailHash = crypto.createHash('sha256').update(cleanEmail).digest('hex');
    const insert = {
      initials: cleanInitials,
      product: cleanProduct,
      rating: cleanRating,
      review_text: cleanText,
      status: 'pending',
      reviewer_name: cleanReviewerName,
      order_number: order.order_number,
      email_hash: emailHash,
      source: 'onsite_verified_order',
    };

    const { error } = await supabase.from('reviews_pending').insert(insert);
    if (error) throw error;

    sendTelegramAdminAlert(
      `<b>New UKMAXX review pending</b>\n\nOrder: <code>${escapeTelegram(order.order_number)}</code>\nProduct: <b>${escapeTelegram(cleanProduct)}</b>\nRating: ${'★'.repeat(cleanRating)}${'☆'.repeat(5 - cleanRating)}\nName: ${escapeTelegram(cleanReviewerName)}\nPublic initials: ${escapeTelegram(cleanInitials)}\n\n${escapeTelegram(cleanText)}\n\nApprove or reject it in Supabase → reviews_pending.`
    ).catch((err) => console.error('review-telegram-alert-failed', { message: err?.message }));

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('submit-review-error', { message: e?.message, stack: e?.stack });
    return res.status(500).json({ error: 'Server error' });
  }
}

function escapeTelegram(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
