const Stripe = require('stripe');
const { getSupabaseAdmin } = require('./_lib/supabase');

const SITE_URL = process.env.SITE_URL || 'https://www.ukmaxx.co.uk';
const COA_PENDING_SKUS = new Set(['BC5', 'IP5', 'NJ500']);
const BUNDLE_COMPONENTS = {
  RT10X3: { RT10: 3, WA10: 3 },
};

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

function addRequiredStock(requirements, sku, qty) {
  const components = BUNDLE_COMPONENTS[sku];
  if (components) {
    for (const [componentSku, componentQty] of Object.entries(components)) {
      requirements.set(componentSku, (requirements.get(componentSku) || 0) + componentQty * qty);
    }
    return;
  }
  requirements.set(sku, (requirements.get(sku) || 0) + qty);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Checkout is not configured' });

  try {
    const supabase = getSupabaseAdmin();
    const token = getBearerToken(req);
    let authData = null;
    if (token) {
      const authResult = await supabase.auth.getUser(token);
      if (authResult.error || !authResult.data?.user) {
        return res.status(401).json({ error: 'Invalid or expired session' });
      }
      authData = authResult.data;
    }

    const normalized = normalizeCart(req.body?.cartItems);
    if (!normalized.length) return res.status(400).json({ error: 'Cart is empty or invalid' });

    const stockRequirements = new Map();
    normalized.forEach((item) => addRequiredStock(stockRequirements, item.sku, item.qty));
    const skus = [...new Set([...normalized.map((item) => item.sku), ...stockRequirements.keys()])];
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
      if (COA_PENDING_SKUS.has(item.sku)) return res.status(400).json({ error: `${item.sku} is coming soon and awaiting COA` });
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
    for (const [sku, qty] of stockRequirements.entries()) {
      const product = bySku.get(sku);
      if (!product || !product.is_active) return res.status(400).json({ error: `Unavailable SKU: ${sku}` });
      if (Number(product.stock_quantity) < qty) {
        return res.status(409).json({ error: `Insufficient stock for ${sku}` });
      }
    }

    const email = String(authData?.user?.email || '').trim().toLowerCase();
    const requestedPromo = String(req.body?.promoCode || '').trim().toUpperCase();
    const validPromo = requestedPromo === 'MAXX15';
    if (validPromo && email) {
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
    } else if (validPromo && !process.env.STRIPE_MAXX15_COUPON_ID) {
      return res.status(503).json({ error: 'Promo code is temporarily unavailable' });
    }

    const estimatedDiscountPence = validPromo ? Math.round(subtotalPence * 0.15) : 0;
    const shippingPence = subtotalPence - estimatedDiscountPence >= 10000 ? 0 : 499;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email || undefined,
      client_reference_id: authData?.user?.id || undefined,
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
        user_id: authData?.user?.id || '',
        checkout_type: authData?.user?.id ? 'account' : 'guest',
        promo_opt_in: req.body?.promoOptIn ? 'true' : 'false',
        promo_code: validPromo ? 'MAXX15' : '',
        cart: JSON.stringify(normalized),
      },
    }, {
      idempotencyKey: `checkout-${authData?.user?.id || String(req.body?.guestCheckoutId || 'guest').slice(0, 64)}-${Buffer.from(JSON.stringify(normalized)).toString('base64url')}-${validPromo ? 'maxx15' : 'none'}`,
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('create-checkout-session-error', { message: error?.message, stack: error?.stack });
    return res.status(500).json({ error: 'Unable to start checkout' });
  }
};
