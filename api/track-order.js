const { getSupabaseAdmin } = require('./_lib/supabase');

module.exports = async (req, res) => {
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
