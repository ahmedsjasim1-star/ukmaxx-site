const { getSupabaseAdmin } = require('./_lib/supabase');
const { createAndProcessPayment } = require('./_lib/fena');

const SITE_URL = process.env.SITE_URL || 'https://www.ukmaxx.co.uk';
const COA_PENDING_SKUS = new Set(['IP5']);
const CUSTOM_BUNDLE_ELIGIBLE_SKUS = new Set(['RT10', 'RT20', 'BC5', 'GHKCU', 'NJ500']);
const BUNDLE_COMPONENTS = {
  RT10X3: { RT10: 3, WA10: 1 },
  RT20X3: { RT20: 3, WA10: 1 },
  BC5X3: { BC5: 3, WA10: 1 },
  GHKCUX3: { GHKCU: 3, WA10: 1 },
  UKXRB1: { RT10: 1, BC5: 1, GHKCU: 1, WA10: 1 },
};

function getBearerToken(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function clean(value, max = 200) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function cleanId(value) {
  return clean(value, 80).replace(/[^a-z0-9_-]/gi, '').slice(0, 80);
}

function cleanPath(value) {
  const path = clean(value, 500);
  if (!path || !path.startsWith('/')) return '/';
  return path.replace(/[^\w\-./?=&%#:+]/g, '').slice(0, 500);
}

function cleanHeader(value, max = 120) {
  try {
    return decodeURIComponent(clean(value, max));
  } catch {
    return clean(value, max);
  }
}

function detectDevice(userAgent = '') {
  const ua = String(userAgent || '').toLowerCase();
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobile|iphone|android/.test(ua)) return 'mobile';
  return 'desktop';
}

function normalizeAnalyticsContext(raw = {}, req = {}) {
  const firstSeen = clean(raw.firstSeenAt, 40);
  return {
    visitorId: cleanId(raw.visitorId),
    sessionId: cleanId(raw.sessionId),
    firstSource: clean(raw.firstSource, 120) || 'Direct',
    firstReferrer: clean(raw.firstReferrer, 500),
    firstLandingPage: cleanPath(raw.firstLandingPage),
    firstSeenAt: /^\d{4}-\d{2}-\d{2}T/.test(firstSeen) ? firstSeen : null,
    firstUtmSource: clean(raw.firstUtmSource, 80),
    firstUtmMedium: clean(raw.firstUtmMedium, 80),
    firstUtmCampaign: clean(raw.firstUtmCampaign, 120),
    conversionSource: clean(raw.conversionSource, 120) || 'Direct',
    conversionReferrer: clean(raw.conversionReferrer, 500),
    conversionLandingPage: cleanPath(raw.conversionLandingPage),
    conversionUtmSource: clean(raw.conversionUtmSource, 80),
    conversionUtmMedium: clean(raw.conversionUtmMedium, 80),
    conversionUtmCampaign: clean(raw.conversionUtmCampaign, 120),
    deviceType: clean(raw.deviceType, 30) || detectDevice(req.headers?.['user-agent']),
    country: cleanHeader(req.headers?.['x-vercel-ip-country'], 2).toUpperCase(),
    region: cleanHeader(req.headers?.['x-vercel-ip-country-region'], 80),
    city: cleanHeader(req.headers?.['x-vercel-ip-city'], 120),
  };
}

function normalizeCart(cartItems) {
  const quantities = new Map();
  for (const raw of Array.isArray(cartItems) ? cartItems : []) {
    const sku = String(raw?.sku || '').trim().toUpperCase();
    const qty = Number(raw?.qty);
    if (!sku || !Number.isSafeInteger(qty) || qty < 1 || qty > 50) continue;
    const current = quantities.get(sku) || { qty: 0, bundleQty: 0 };
    current.qty += qty;
    if (CUSTOM_BUNDLE_ELIGIBLE_SKUS.has(sku)) {
      const bundleQty = Number(raw?.bundleQty || 0);
      if (Number.isSafeInteger(bundleQty) && bundleQty > 0) current.bundleQty += Math.min(qty, bundleQty);
    }
    quantities.set(sku, current);
  }
  return [...quantities]
    .map(([sku, item]) => ({ sku, qty: item.qty, bundleQty: Math.min(item.qty, item.bundleQty) }))
    .filter((item) => item.qty <= 50);
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

function customBundleGiftQuantity(items) {
  const qualifyingVials = items.reduce((total, item) => (
    CUSTOM_BUNDLE_ELIGIBLE_SKUS.has(item.sku) ? total + item.bundleQty : total
  ), 0);
  const bacQuantity = items.find((item) => item.sku === 'WA10')?.qty || 0;
  return Math.min(Math.floor(qualifyingVials / 3), bacQuantity);
}

function customBundleDiscount(items, productsBySku) {
  const discountedUnitCount = customBundleGiftQuantity(items) * 3;
  if (!discountedUnitCount) return 0;
  const unitPrices = items
    .filter((item) => CUSTOM_BUNDLE_ELIGIBLE_SKUS.has(item.sku))
    .flatMap((item) => Array.from({ length: item.bundleQty }, () => Number(productsBySku.get(item.sku)?.price || 0)))
    .slice(0, discountedUnitCount);
  const discountPence = unitPrices.reduce((total, price) => total + Math.round(price * 100 * 0.05), 0);
  return discountPence / 100;
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
    const analytics = normalizeAnalyticsContext(req.body?.analyticsContext, req);
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
    let promoEligibleSubtotal = 0;
    const freeBacQty = customBundleGiftQuantity(normalized);
    for (const item of normalized) {
      const product = bySku.get(item.sku);
      if (!product || !product.is_active) return res.status(400).json({ error: `Unavailable SKU: ${item.sku}` });
      if (COA_PENDING_SKUS.has(item.sku)) return res.status(400).json({ error: `${item.sku} is coming soon and awaiting COA` });
      const unit = Number(product.price);
      const chargeableQty = item.sku === 'WA10' ? Math.max(0, item.qty - freeBacQty) : item.qty;
      const lineTotal = Number((unit * chargeableQty).toFixed(2));
      subtotal += lineTotal;
      promoEligibleSubtotal += lineTotal;
      orderItems.push({
        sku: item.sku,
        product_name: item.sku === 'WA10' && freeBacQty ? `${product.name} (${freeBacQty} free bundle gift${freeBacQty === 1 ? '' : 's'})` : product.name,
        qty: item.qty,
        price: unit,
        line_total: lineTotal,
      });
    }
    for (const [sku, qty] of stockRequirements.entries()) {
      const product = bySku.get(sku);
      if (!product || !product.is_active) return res.status(400).json({ error: `Unavailable SKU: ${sku}` });
      if (Number(product.stock_quantity) < qty) {
        return res.status(409).json({ error: `Insufficient stock for ${sku}` });
      }
    }

    const bundleDiscount = customBundleDiscount(normalized, bySku);
    promoEligibleSubtotal = Math.max(0, promoEligibleSubtotal - bundleDiscount);
    const requestedPromo = String(req.body?.promoCode || '').trim().toUpperCase();
    const validPromo = requestedPromo === 'MAXX10';
    const promoApplies = validPromo && promoEligibleSubtotal > 0;
    if (promoApplies) {
      const { data: prior, error: priorError } = await supabase
        .from('promo_redemptions')
        .select('id')
        .eq('email', checkout.email)
        .eq('promo_code', 'MAXX10')
        .limit(1);
      if (priorError) throw priorError;
      if (prior?.length) return res.status(409).json({ error: 'MAXX10 has already been used for this email.' });
    }

    const promoDiscount = promoApplies ? Number((promoEligibleSubtotal * 0.10).toFixed(2)) : 0;
    const discount = Number((bundleDiscount + promoDiscount).toFixed(2));
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
      promo_code: promoApplies ? 'MAXX10' : '',
      custom_bundle_free_bac_qty: freeBacQty,
      custom_bundle_discount: bundleDiscount,
      promo_discount: promoDiscount,
      items: orderItems,
      analytics,
    };

    const baseAttempt = {
      payment_provider: 'fena',
      payment_reference: reference,
      status: 'created',
      amount: total,
      currency: 'gbp',
      email: checkout.email,
      payload: attemptPayload,
    };
    const enrichedAttempt = {
      ...baseAttempt,
      visitor_id: analytics.visitorId || null,
      session_id: analytics.sessionId || null,
      account_user_id: authData?.user?.id || null,
      checkout_type: authData?.user?.id ? 'account' : 'guest',
      first_source: analytics.firstSource,
      first_referrer: analytics.firstReferrer || null,
      first_landing_page: analytics.firstLandingPage,
      first_seen_at: analytics.firstSeenAt,
      first_utm_source: analytics.firstUtmSource || null,
      first_utm_medium: analytics.firstUtmMedium || null,
      first_utm_campaign: analytics.firstUtmCampaign || null,
      conversion_source: analytics.conversionSource,
      conversion_referrer: analytics.conversionReferrer || null,
      conversion_landing_page: analytics.conversionLandingPage,
      conversion_utm_source: analytics.conversionUtmSource || null,
      conversion_utm_medium: analytics.conversionUtmMedium || null,
      conversion_utm_campaign: analytics.conversionUtmCampaign || null,
      device_type: analytics.deviceType,
      visitor_country: analytics.country || null,
      visitor_region: analytics.region || null,
      visitor_city: analytics.city || null,
    };

    let { error: attemptError } = await supabase.from('payment_attempts').insert(enrichedAttempt);
    if (attemptError && /column .* does not exist|schema cache/i.test(String(attemptError.message || ''))) {
      const fallback = await supabase.from('payment_attempts').insert(baseAttempt);
      attemptError = fallback.error;
    }
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
