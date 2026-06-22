const { getSupabaseAdmin } = require('./_lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { reference } = req.body || {};
    const normRef = String(reference || '').trim().toUpperCase();
    if (!normRef) return res.status(400).json({ error: 'Missing reference' });

    const supabase = getSupabaseAdmin();
    const authorization = String(req.headers.authorization || '');
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'Sign in required' });
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData?.user?.email) return res.status(401).json({ error: 'Invalid or expired session' });
    const normEmail = authData.user.email.toLowerCase();

    const { data: order, error } = await supabase
      .from('orders')
      .select('id,order_number,status,created_at,subtotal,shipping,total,currency,full_name,shipping_address_line1,shipping_address_line2,shipping_city,shipping_postcode,shipping_country,tracking_number,tracking_url,dispatched_at,delivered_at')
      .eq('order_number', normRef)
      .eq('email', normEmail)
      .maybeSingle();

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

    return res.json({
      order: {
        order_number: order.order_number,
        status: order.status,
        created_at: order.created_at,
        subtotal: order.subtotal,
        shipping: order.shipping,
        total: order.total,
        currency: order.currency,
        full_name: order.full_name,
        shipping_address_line1: order.shipping_address_line1,
        shipping_address_line2: order.shipping_address_line2,
        shipping_city: order.shipping_city,
        shipping_postcode: order.shipping_postcode,
        shipping_country: order.shipping_country,
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
