const Stripe = require('stripe');
const { getSupabaseAdmin } = require('./_lib/supabase');

const SITE_URL = process.env.SITE_URL || 'https://www.ukmaxx.co.uk';

function getBearerToken(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function normalizeCart(cartItems) {
  const quantities = new Map();
  for (const raw of Array.isArray(cartItems) ? cartItems : []) {
    const sku = String(raw?.sku || '').trim().toUpperCase();
    const qty = Number(raw?.qty);
    if (!sku || !Number.isSafeInteger(qty) || qty < 1 || qty > 50) continue;
    quantities.set(sku, (quantities.get(sku) || 0) + qty);
  }
  return [...quantities].map(([sku, qty]) => ({ sku, qty })).filter((item) => item.qty <= 50);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Checkout is not configured' });

  try {
    const supabase = getSupabaseAdmin();
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: 'Sign in required' });

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData?.user) return res.status(401).json({ error: 'Invalid or expired session' });

    const normalized = normalizeCart(req.body?.cartItems);
    if (!normalized.length) return res.status(400).json({ error: 'Cart is empty or invalid' });

    const skus = normalized.map((item) => item.sku);
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('sku,name,price,stock_quantity,is_active')
      .in('sku', skus);
    if (productsError) throw productsError;

    const bySku = new Map((products || []).map((product) => [product.sku, product]));
    const lineItems = [];
    let subtotalPence = 0;
    for (const item of normalized) {
      const product = bySku.get(item.sku);
      if (!product || !product.is_active) return res.status(400).json({ error: `Unavailable SKU: ${item.sku}` });
      if (Number(product.stock_quantity) < item.qty) {
        return res.status(409).json({ error: `Insufficient stock for ${item.sku}` });
      }
      const unitAmount = Math.round(Number(product.price) * 100);
      subtotalPence += unitAmount * item.qty;
      lineItems.push({
        price_data: {
          currency: 'gbp',
          product_data: { name: product.name, metadata: { sku: product.sku } },
          unit_amount: unitAmount,
        },
        quantity: item.qty,
      });
    }

    const email = String(authData.user.email || '').trim().toLowerCase();
    const requestedPromo = String(req.body?.promoCode || '').trim().toUpperCase();
    const validPromo = requestedPromo === 'MAXX15';
    if (validPromo) {
      const { data: prior, error: priorError } = await supabase
        .from('promo_redemptions')
        .select('id')
        .eq('email', email)
        .eq('promo_code', 'MAXX15')
        .limit(1);
      if (priorError) throw priorError;
      if (prior?.length) return res.status(409).json({ error: 'MAXX15 has already been used for this account.' });
      if (!process.env.STRIPE_MAXX15_COUPON_ID) {
        return res.status(503).json({ error: 'Promo code is temporarily unavailable' });
      }
    }

    const estimatedDiscountPence = validPromo ? Math.round(subtotalPence * 0.15) : 0;
    const shippingPence = subtotalPence - estimatedDiscountPence >= 10000 ? 0 : 499;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      client_reference_id: authData.user.id,
      line_items: lineItems,
      shipping_address_collection: { allowed_countries: ['GB'] },
      billing_address_collection: 'required',
      phone_number_collection: { enabled: true },
      success_url: `${SITE_URL}/index.html?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/index.html?payment=cancelled`,
      discounts: validPromo ? [{ coupon: process.env.STRIPE_MAXX15_COUPON_ID }] : undefined,
      shipping_options: shippingPence > 0 ? [{
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: shippingPence, currency: 'gbp' },
          display_name: 'Royal Mail Tracked 24',
          delivery_estimate: {
            minimum: { unit: 'business_day', value: 1 },
            maximum: { unit: 'business_day', value: 2 },
          },
        },
      }] : undefined,
      metadata: {
        user_id: authData.user.id,
        promo_opt_in: req.body?.promoOptIn ? 'true' : 'false',
        promo_code: validPromo ? 'MAXX15' : '',
        cart: JSON.stringify(normalized),
      },
    }, {
      idempotencyKey: `checkout-${authData.user.id}-${Buffer.from(JSON.stringify(normalized)).toString('base64url')}-${validPromo ? 'maxx15' : 'none'}`,
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('create-checkout-session-error', { message: error?.message, stack: error?.stack });
    return res.status(500).json({ error: 'Unable to start checkout' });
  }
};
