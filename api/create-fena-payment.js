const { getSupabaseAdmin } = require('./_lib/supabase');
const { createAndProcessPayment } = require('./_lib/fena');

const SITE_URL = process.env.SITE_URL || 'https://www.ukmaxx.co.uk';
const COA_PENDING_SKUS = new Set(['BC5', 'IP5', 'NJ500']);
const BUNDLE_COMPONENTS = {
  RT10X3: { RT10: 3, WA10: 3 },
};

function getBearerToken(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function clean(value, max = 200) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
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

function makeOrderNumber() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `UKX${String(new Date().getFullYear()).slice(-2)}${suffix}`;
}

function normalizeCheckoutDetails(body, authEmail) {
  const address = body?.address || {};
  const email = clean(body?.email || authEmail, 254).toLowerCase();
  const fullName = clean(body?.fullName, 120);
  const phone = clean(body?.phone, 40);
  const line1 = clean(address.line1, 160);
  const line2 = clean(address.line2, 160);
  const city = clean(address.city, 100);
  const postcode = clean(address.postcode, 20).toUpperCase();
  const country = clean(address.country || 'GB', 2).toUpperCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Please enter a valid email address.');
  if (fullName.length < 2) throw new Error('Please enter your full name.');
  if (line1.length < 3) throw new Error('Please enter your address line 1.');
  if (city.length < 2) throw new Error('Please enter your town or city.');
  if (postcode.length < 4) throw new Error('Please enter a valid postcode.');
  if (country !== 'GB') throw new Error('UK delivery only is currently available.');

  return { email, fullName, phone, address: { line1, line2, city, postcode, country } };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.FENA_TERMINAL_ID || !process.env.FENA_TERMINAL_SECRET) {
    return res.status(503).json({ error: 'Pay by Bank is not configured' });
  }

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

    const checkout = normalizeCheckoutDetails(req.body || {}, authData?.user?.email || '');
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
    const orderItems = [];
    let subtotal = 0;
    for (const item of normalized) {
      const product = bySku.get(item.sku);
      if (!product || !product.is_active) return res.status(400).json({ error: `Unavailable SKU: ${item.sku}` });
      if (COA_PENDING_SKUS.has(item.sku)) return res.status(400).json({ error: `${item.sku} is coming soon and awaiting COA` });
      const unit = Number(product.price);
      subtotal += unit * item.qty;
      orderItems.push({
        sku: item.sku,
        product_name: product.name,
        qty: item.qty,
        price: unit,
        line_total: unit * item.qty,
      });
    }
    for (const [sku, qty] of stockRequirements.entries()) {
      const product = bySku.get(sku);
      if (!product || !product.is_active) return res.status(400).json({ error: `Unavailable SKU: ${sku}` });
      if (Number(product.stock_quantity) < qty) {
        return res.status(409).json({ error: `Insufficient stock for ${sku}` });
      }
    }

    const requestedPromo = String(req.body?.promoCode || '').trim().toUpperCase();
    const validPromo = requestedPromo === 'MAXX15';
    if (validPromo) {
      const { data: prior, error: priorError } = await supabase
        .from('promo_redemptions')
        .select('id')
        .eq('email', checkout.email)
        .eq('promo_code', 'MAXX15')
        .limit(1);
      if (priorError) throw priorError;
      if (prior?.length) return res.status(409).json({ error: 'MAXX15 has already been used for this email.' });
    }

    const discount = validPromo ? Number((subtotal * 0.15).toFixed(2)) : 0;
    const discounted = subtotal - discount;
    const shipping = discounted >= 100 ? 0 : 4.99;
    const total = Number((discounted + shipping).toFixed(2));
    if (total <= 0) return res.status(400).json({ error: 'Invalid order total' });

    const orderNumber = makeOrderNumber();
    const reference = orderNumber;
    const attemptPayload = {
      orderNumber,
      user_id: authData?.user?.id || null,
      checkout_type: authData?.user?.id ? 'account' : 'guest',
      email: checkout.email,
      fullName: checkout.fullName,
      phone: checkout.phone,
      shipping: checkout.address,
      subtotal,
      discount,
      shippingCost: shipping,
      total,
      currency: 'gbp',
      promo_opt_in: !!req.body?.promoOptIn,
      promo_code: validPromo ? 'MAXX15' : '',
      items: orderItems,
    };

    const { error: attemptError } = await supabase.from('payment_attempts').insert({
      payment_provider: 'fena',
      payment_reference: reference,
      status: 'created',
      amount: total,
      currency: 'gbp',
      email: checkout.email,
      payload: attemptPayload,
    });
    if (attemptError) throw attemptError;

    const fena = await createAndProcessPayment({
      reference,
      amount: total,
      customerName: checkout.fullName,
      customerEmail: checkout.email,
      description: `UKMAXX order ${orderNumber}`,
      customRedirectUrl: `${SITE_URL}/index.html?payment=fena-return`,
    });
    const payment = fena?.result || {};
    if (!payment.link || !payment.id) throw new Error('Fena did not return a payment link');

    const { error: updateError } = await supabase
      .from('payment_attempts')
      .update({
        provider_payment_id: payment.id,
        status: String(payment.status || 'sent').toLowerCase(),
        provider_payload: payment,
      })
      .eq('payment_reference', reference)
      .eq('payment_provider', 'fena');
    if (updateError) throw updateError;

    return res.status(200).json({ url: payment.link, orderReference: orderNumber });
  } catch (error) {
    const message = error?.message || 'Unable to start Pay by Bank';
    const safeClientErrors = [
      'Please enter a valid email address.',
      'Please enter your full name.',
      'Please enter your address line 1.',
      'Please enter your town or city.',
      'Please enter a valid postcode.',
      'UK delivery only is currently available.',
    ];
    if (safeClientErrors.includes(message)) return res.status(400).json({ error: message });
    console.error('create-fena-payment-error', { message: error?.message, stack: error?.stack, data: error?.data });
    return res.status(500).json({ error: 'Unable to start Pay by Bank' });
  }
};
