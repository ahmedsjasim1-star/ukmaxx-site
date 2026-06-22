const Stripe = require('stripe');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseQuery(table, query) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${table} query failed: ${res.status} ${body}`);
  }
  return res.json();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
    if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Missing Stripe config' });

    const { cartItems, email, fullName, address, promoOptIn, promoCode } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!Array.isArray(cartItems) || !cartItems.length) return res.status(400).json({ error: 'Cart is empty' });

    const normalized = cartItems.map(i => ({ sku: String(i.sku || '').trim(), qty: Number(i.qty || 0) })).filter(i => i.sku && i.qty > 0);
    if (!normalized.length) return res.status(400).json({ error: 'Invalid cart items' });

    const skus = [...new Set(normalized.map(i => i.sku))];
    const skuFilter = skus.map(s => `"${s}"`).join(',');
    const products = await supabaseQuery('products', `select=sku,name,price,stock_quantity,is_active&sku=in.(${skuFilter})`);

    const bySku = new Map((products || []).map(p => [p.sku, p]));
    const line_items = [];
    let subtotal = 0;
    for (const item of normalized) {
      const p = bySku.get(item.sku);
      if (!p || !p.is_active) return res.status(400).json({ error: `Unavailable SKU: ${item.sku}` });
      if (Number(p.stock_quantity) < item.qty) return res.status(400).json({ error: `Insufficient stock for ${item.sku}` });
      const unit = Math.round(Number(p.price) * 100);
      subtotal += unit * item.qty;
      line_items.push({ price_data: { currency: 'gbp', product_data: { name: p.name, metadata: { sku: p.sku } }, unit_amount: unit }, quantity: item.qty });
    }
    const requestedPromo = String(promoCode || '').toUpperCase();
    let validPromo = requestedPromo === 'MAXX15';
    if (validPromo && normalizedEmail) {
      const prior = await supabaseQuery('promo_redemptions', `select=id&email=eq.${encodeURIComponent(normalizedEmail)}&promo_code=eq.MAXX15&limit=1`);
      if (prior.length > 0) return res.status(400).json({ error: 'Promo code MAXX15 has already been used for this email.' });
    }
    const discountAmount = validPromo ? Math.round(subtotal * 0.15) : 0;
    const discountedSubtotal = subtotal - discountAmount;
    const shipping = discountedSubtotal >= 10000 ? 0 : 499;
    if (shipping > 0) line_items.push({ price_data: { currency: 'gbp', product_data: { name: 'UK TRACKED SHIPPING', metadata: { sku: 'SHIPPING' } }, unit_amount: shipping }, quantity: 1 });

    const origin = process.env.SITE_URL || 'https://ukmaxx-site-5tc7.vercel.app';

    let discounts;
    if (validPromo) {
      let couponId = process.env.STRIPE_MAXX15_COUPON_ID;
      if (!couponId) {
        const fallbackId = 'MAXX15_AUTO';
        try {
          const existing = await stripe.coupons.retrieve(fallbackId);
          if (existing && !existing.deleted) couponId = fallbackId;
        } catch (_) {
          const created = await stripe.coupons.create({ id: fallbackId, percent_off: 15, duration: 'forever', name: 'MAXX15' });
          couponId = created.id;
        }
      }
      if (couponId) discounts = [{ coupon: couponId }];
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: normalizedEmail || undefined,
      line_items,
      shipping_address_collection: { allowed_countries: ['GB'] },
      billing_address_collection: 'required',
      phone_number_collection: { enabled: true },
      success_url: `${origin}/index.html?payment=success`,
      cancel_url: `${origin}/index.html?payment=cancelled`,
      discounts,
      metadata: {
        promo_opt_in: promoOptIn ? 'true' : 'false',
        promo_code: validPromo ? 'MAXX15' : '',
        discount_amount: String(discountAmount / 100),
        full_name: fullName || '',
        address_line1: address?.line1 || '',
        address_line2: address?.line2 || '',
        city: address?.city || '',
        postcode: address?.postal_code || '',
        country: address?.country || 'GB',
        cart: JSON.stringify(normalized),
        subtotal: String(subtotal / 100),
      },
    });

    return res.json({ url: session.url });
  } catch (e) {
    console.error('create-checkout-session-error', { message: e?.message, stack: e?.stack, hint: 'Check SUPABASE_SERVICE_ROLE_KEY env var has the service_role key (not anon key)' });
    return res.status(500).json({ error: e?.message === 'permission denied for table products' ? 'Database permission error — check SUPABASE_SERVICE_ROLE_KEY env var has the service_role key' : 'Unable to start checkout' });
  }
};