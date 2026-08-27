const crypto = require('crypto');
const { getSupabaseAdmin } = require('./_lib/supabase');
const { sendTelegramAdminAlert, sendTelegramAdminPhoto } = require('./_lib/notify');

const PRODUCT_LABELS = {
  RT10: 'RETA 10mg',
  RT10X3: 'RETA 3-Pack',
  BC5X3: 'BPC 157 3-Pack',
  BC5: 'BPC 157',
  IP5: 'IPAM 5mg',
  NJ500: 'NAD+ 500mg',
  WA10: 'BAC Water',
  GHKCU: 'GHK-Cu 50mg',
};

// Keep tracking-order thumbnails aligned with the customer-facing catalogue.
// These are presentation assets rather than live inventory data, so they
// should not depend on potentially stale image_url values in Supabase.
const PRODUCT_IMAGES = {
  RT10: './images/ukmaxx-reta.png',
  RT10X3: './images/ukmaxx-reta-bundle.png',
  BC5X3: './images/ukmaxx-bpc-bundle.png',
  BC5: './images/ukmaxx-bpc-157.png',
  IP5: './images/ukmaxx-ipamorelin.png',
  NJ500: './images/ukmaxx-nad-500.png',
  WA10: './images/ukmaxx-bac-water.png',
  GHKCU: './images/ukmaxx-ghk-cu.png',
};

const ALLOWED_SITE_EVENTS = new Set([
  'page_view',
  'product_view',
  'add_to_cart',
  'checkout_opened',
  'payment_started',
  'payment_success',
  'payment_failed',
  'review_opened',
  'review_order_verified',
  'review_submitted',
  'whatsapp_support_click',
]);

module.exports = async (req, res) => {
  if (req.method === 'GET' && req.query?.type === 'reviews') return handleReviewsList(req, res);
  if (req.method === 'GET' && req.query?.type === 'visitor-context') return handleVisitorContext(req, res);
  if (req.method === 'POST' && req.body?.type === 'track-event') return handleSiteEvent(req, res);
  if (req.method === 'POST' && req.body?.type === 'review-order-options') return handleReviewOrderOptions(req, res);
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

    const enriched = (items || []).map((item) => ({
      ...item,
      image_url: PRODUCT_IMAGES[String(item.sku || '').toUpperCase()] || null,
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

function handleVisitorContext(req, res) {
  const country = cleanHeader(req.headers['x-vercel-ip-country'], 2).toUpperCase();
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.status(200).json({ country: /^[A-Z]{2}$/.test(country) ? country : null });
}

function clean(value, max = 240) {
  return String(value || '').trim().slice(0, max);
}

function cleanPath(value) {
  const raw = clean(value, 500);
  if (!raw || !raw.startsWith('/')) return '/';
  return raw.replace(/[^\w\-./?=&%#:+]/g, '').slice(0, 500);
}

function cleanSessionId(value) {
  return clean(value, 80).replace(/[^a-z0-9_-]/gi, '').slice(0, 80);
}

function cleanBool(value) {
  return value === true || value === 'true';
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

function referrerHost(referrer = '') {
  try {
    return new URL(referrer).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function sourceGroup({ referrer = '', utmSource = '' }) {
  const source = String(utmSource || '').toLowerCase();
  const host = referrerHost(referrer);
  const value = source || host;
  if (!value) return 'Direct';
  if (/ukmaxx\.co\.uk$/.test(value)) return 'Internal navigation';
  if (/^(payment\.)?fena\.co$/.test(value)) return 'Payment return';
  if (/(^|\.)(t\.co|x\.com|twitter\.com)$/.test(value) || value.includes('twitter') || value === 'x') return 'X / Twitter';
  if (/(^|\.)(t\.me|telegram\.org)$/.test(value) || value.includes('telegram')) return 'Telegram';
  if (value.includes('google') || value.includes('googlequicksearchbox')) return 'Google';
  if (value.includes('bing')) return 'Bing';
  if (value.includes('facebook') || value.includes('instagram') || value.includes('meta')) return 'Meta';
  return host || source || 'Referral';
}

function cleanCartItems(items) {
  if (!Array.isArray(items)) return null;
  const cleaned = items.slice(0, 12).map((item) => {
    const sku = clean(item?.sku, 40).toUpperCase();
    const name = clean(item?.name, 120);
    const qty = Math.max(0, Math.min(99, Number(item?.qty || 0)));
    const lineTotal = Math.max(0, Math.min(99999, Number(item?.lineTotal || 0)));
    if (!sku || !qty) return null;
    return {
      sku,
      name: name || sku,
      qty,
      lineTotal: Number(lineTotal.toFixed(2)),
    };
  }).filter(Boolean);
  return cleaned.length ? cleaned : null;
}

async function handleSiteEvent(req, res) {
  try {
    const body = req.body || {};
    const eventType = clean(body.eventType, 40);
    if (!ALLOWED_SITE_EVENTS.has(eventType)) return res.status(400).json({ error: 'Invalid event type' });

    const sessionId = cleanSessionId(body.sessionId);
    const visitorId = cleanSessionId(body.visitorId) || sessionId;
    if (!sessionId || sessionId.length < 10) return res.status(400).json({ error: 'Invalid session' });

    const userAgent = clean(req.headers['user-agent'], 320);
    const referrer = clean(body.referrer, 500);
    const utmSource = clean(body.utmSource, 80);
    const baseEvent = {
      event_type: eventType,
      session_id: sessionId,
      page_path: cleanPath(body.pagePath),
      page_title: clean(body.pageTitle, 180),
      product_sku: clean(body.productSku, 40).toUpperCase() || null,
      referrer: referrer || null,
      utm_source: utmSource || null,
      utm_medium: clean(body.utmMedium, 80) || null,
      utm_campaign: clean(body.utmCampaign, 120) || null,
      device_type: clean(body.deviceType, 30) || detectDevice(userAgent),
    };
    const enrichedEvent = {
      ...baseEvent,
      visitor_id: visitorId,
      is_internal: cleanBool(body.isInternal),
      referrer_host: referrerHost(referrer) || null,
      source_group: sourceGroup({ referrer, utmSource }),
      country: cleanHeader(req.headers['x-vercel-ip-country'], 2).toUpperCase() || null,
      region: cleanHeader(req.headers['x-vercel-ip-country-region'], 80) || null,
      city: cleanHeader(req.headers['x-vercel-ip-city'], 120) || null,
      timezone: clean(body.timezone, 80) || null,
      language: clean(body.language, 40) || null,
      cart_items: cleanCartItems(body.cartItems),
      cart_value: Number.isFinite(Number(body.cartValue)) ? Number(Number(body.cartValue).toFixed(2)) : null,
      promo_code: clean(body.promoCode, 40).toUpperCase() || null,
    };

    const supabase = getSupabaseAdmin();
    let { error } = await supabase.from('site_events').insert(enrichedEvent);

    if (error && /column .* does not exist|schema cache/i.test(String(error.message || ''))) {
      const fallback = await supabase.from('site_events').insert(baseEvent);
      error = fallback.error;
    }

    if (error) {
      console.error('site-event-insert-error', { message: error.message });
      return res.status(202).json({ ok: false });
    }

    return res.status(204).end();
  } catch (err) {
    console.error('site-event-error', { message: err?.message });
    return res.status(202).json({ ok: false });
  }
}

async function handleReviewsList(req, res) {
  try {
    const product = String(req.query?.product || '').trim().toUpperCase();
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('reviews_public')
      .select('initials,display_name,display_mode,product,rating,review_text,image_paths,review_date,created_at')
      .order('review_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200);

    if (product) query = query.eq('product', product);

    const { data, error } = await query;
    if (error) {
      console.error('reviews-list-db-error', { error: error?.message });
      return res.status(500).json({ error: 'Database error' });
    }
    const reviews = await Promise.all((data || []).map(async (review) => {
      const paths = Array.isArray(review.image_paths) ? review.image_paths.slice(0, 3) : [];
      if (!paths.length) return { ...review, image_urls: [] };
      const { data: signed } = await supabase.storage.from('review-images').createSignedUrls(paths, 3600);
      return { ...review, image_urls: (signed || []).map((item) => item.signedUrl).filter(Boolean) };
    }));
    return res.status(200).json({ reviews });
  } catch (e) {
    console.error('reviews-list-error', { message: e?.message, stack: e?.stack });
    return res.status(500).json({ error: 'Server error' });
  }
}

function publicIdentity(fullName, mode, suppliedInitials = '') {
  const words = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  const firstName = words[0] || 'Customer';
  const generatedInitials = words.length > 1
    ? `${words[0][0]}.${words[words.length - 1][0]}.`.toUpperCase()
    : `${firstName[0] || 'U'}.`.toUpperCase();
  const initials = String(suppliedInitials || generatedInitials)
    .trim().replace(/[^a-z0-9. -]/gi, '').slice(0, 16) || generatedInitials;
  return {
    displayMode: mode === 'first_name' ? 'first_name' : 'initials',
    displayName: mode === 'first_name' ? firstName.slice(0, 40) : initials,
    firstName: firstName.slice(0, 40),
    initials,
  };
}

async function findVerifiedReviewOrder(supabase, orderNumber, email) {
  const cleanOrderNumber = String(orderNumber || '').trim().toUpperCase().slice(0, 32);
  const cleanEmail = String(email || '').trim().toLowerCase().slice(0, 180);
  if (!cleanOrderNumber || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { error: 'invalid_order_details' };
  }

  const { data: order, error } = await supabase
    .from('orders')
    .select('id,order_number,email,status,full_name')
    .eq('order_number', cleanOrderNumber)
    .maybeSingle();
  if (error) throw error;
  if (!order || String(order.email || '').toLowerCase() !== cleanEmail) return { error: 'order_not_found' };
  if (order.status !== 'delivered') return { error: 'order_not_delivered' };

  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select('sku,product_name,qty')
    .eq('order_id', order.id);
  if (itemsError) throw itemsError;
  return { order, items: items || [], cleanEmail };
}

async function handleReviewOrderOptions(req, res) {
  try {
    const supabase = getSupabaseAdmin();
    const verified = await findVerifiedReviewOrder(supabase, req.body?.orderNumber, req.body?.email);
    if (verified.error) {
      return res.status(verified.error === 'order_not_delivered' ? 409 : 404).json({ error: verified.error });
    }
    const identity = publicIdentity(verified.order.full_name, 'initials');
    const { data: submittedReviews, error: submittedError } = await supabase
      .from('reviews_pending')
      .select('product')
      .eq('order_number', verified.order.order_number)
      .in('status', ['pending', 'approved']);
    if (submittedError) throw submittedError;
    const submittedProducts = new Set((submittedReviews || []).map((review) => String(review.product || '').trim().toUpperCase()));
    const availableProducts = verified.items.filter((item) => !submittedProducts.has(String(item.sku || '').trim().toUpperCase()));
    if (!availableProducts.length) return res.status(409).json({ error: 'order_reviews_complete' });
    return res.status(200).json({
      ok: true,
      orderNumber: verified.order.order_number,
      products: availableProducts.map((item) => ({
        sku: String(item.sku || '').trim().toUpperCase(),
        name: PRODUCT_LABELS[String(item.sku || '').trim().toUpperCase()] || item.product_name,
        qty: Number(item.qty || 1),
      })),
      identity: { firstName: identity.firstName, initials: identity.initials },
    });
  } catch (e) {
    console.error('review-order-options-error', { message: e?.message });
    return res.status(500).json({ error: 'Server error' });
  }
}

function decodeReviewImage(value) {
  const match = String(value || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=]+)$/i);
  if (!match) throw new Error('invalid_review_image');
  const mime = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 850 * 1024) throw new Error('review_image_too_large');
  const valid = mime === 'image/jpeg'
    ? buffer[0] === 0xff && buffer[1] === 0xd8
    : mime === 'image/png'
      ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!valid) throw new Error('invalid_review_image');
  return { buffer, mime, extension: mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1] };
}

async function handleReviewSubmit(req, res) {
  try {
    const { initials, reviewerName, displayMode, product, rating, reviewText, orderNumber, email, images, hp } = req.body || {};
    if (hp) return res.status(200).json({ ok: true });

    const cleanInitials = String(initials || '').trim().replace(/[^a-z0-9. -]/gi, '').slice(0, 16);
    const cleanProduct = String(product || '').trim().toUpperCase().slice(0, 32);
    const cleanText = String(reviewText || '').trim().replace(/\s+/g, ' ').slice(0, 500);
    const cleanRating = Number(rating);
    const cleanOrderNumber = String(orderNumber || '').trim().toUpperCase().slice(0, 32);
    const cleanEmail = String(email || '').trim().toLowerCase().slice(0, 180);
    const cleanReviewerName = String(reviewerName || '').trim().replace(/[^a-z0-9.' -]/gi, '').replace(/\s+/g, ' ').slice(0, 80);
    const cleanImages = Array.isArray(images) ? images.slice(0, 3) : [];

    if (!cleanProduct || !cleanText || !cleanOrderNumber || !cleanEmail) {
      return res.status(400).json({ error: 'missing_fields' });
    }
    if (!Number.isInteger(cleanRating) || cleanRating < 1 || cleanRating > 5) {
      return res.status(400).json({ error: 'invalid_rating' });
    }
    if (cleanText.length < 12) return res.status(400).json({ error: 'review_too_short' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return res.status(400).json({ error: 'invalid_email' });

    const supabase = getSupabaseAdmin();
    const verified = await findVerifiedReviewOrder(supabase, cleanOrderNumber, cleanEmail);
    if (verified.error) {
      return res.status(verified.error === 'order_not_delivered' ? 409 : 404).json({ error: verified.error });
    }
    const order = verified.order;
    const orderedSkus = new Set(verified.items.map((i) => String(i.sku || '').trim().toUpperCase()));
    if (!orderedSkus.has(cleanProduct) && !(cleanProduct === 'RT10' && orderedSkus.has('RT10X3'))) {
      return res.status(403).json({ error: 'product_not_in_order' });
    }

    const identity = publicIdentity(order.full_name || cleanReviewerName, displayMode, cleanInitials);
    const emailHash = crypto.createHash('sha256').update(cleanEmail).digest('hex');
    const insert = {
      initials: identity.initials,
      display_name: identity.displayName,
      display_mode: identity.displayMode,
      product: cleanProduct,
      rating: cleanRating,
      review_text: cleanText,
      status: 'pending',
      reviewer_name: order.full_name || cleanReviewerName || identity.firstName,
      order_number: order.order_number,
      email_hash: emailHash,
      source: 'onsite_verified_order',
    };

    const { data: pendingReview, error } = await supabase
      .from('reviews_pending')
      .insert(insert)
      .select('id')
      .single();
    if (error?.code === '23505') return res.status(409).json({ error: 'review_already_exists' });
    if (error) throw error;

    const imagePaths = [];
    try {
      for (const encoded of cleanImages) {
        const image = decodeReviewImage(encoded);
        const path = `${pendingReview.id}/${crypto.randomUUID()}.${image.extension}`;
        const { error: uploadError } = await supabase.storage.from('review-images').upload(path, image.buffer, {
          contentType: image.mime,
          upsert: false,
        });
        if (uploadError) throw uploadError;
        imagePaths.push(path);
      }
      if (imagePaths.length) {
        const { error: imageUpdateError } = await supabase
          .from('reviews_pending')
          .update({ image_paths: imagePaths })
          .eq('id', pendingReview.id);
        if (imageUpdateError) throw imageUpdateError;
      }
    } catch (imageError) {
      if (imagePaths.length) await supabase.storage.from('review-images').remove(imagePaths);
      await supabase.from('reviews_pending').delete().eq('id', pendingReview.id);
      const known = ['invalid_review_image', 'review_image_too_large'].includes(imageError?.message);
      return res.status(400).json({ error: known ? imageError.message : 'review_image_upload_failed' });
    }

    const productLabel = PRODUCT_LABELS[cleanProduct] || cleanProduct;
    const reviewCode = String(pendingReview?.id || '').slice(0, 8);
    try {
      await sendTelegramAdminAlert(
        `<b>New UKMAXX review pending</b>\n\nReview code: <code>${escapeTelegram(reviewCode)}</code>\nOrder: <code>${escapeTelegram(order.order_number)}</code>\nProduct: <b>${escapeTelegram(productLabel)}</b>\nRating: ${cleanRating}/5\nCustomer: ${escapeTelegram(order.full_name || cleanReviewerName || 'Verified customer')}\nPublic as: ${escapeTelegram(identity.displayName)} (${identity.displayMode === 'first_name' ? 'first name' : 'initials'})\nPhotos: ${imagePaths.length}\n\n${escapeTelegram(cleanText)}\n\nApprove: <code>/approvereview ${escapeTelegram(reviewCode)}</code>\nReject: <code>/rejectreview ${escapeTelegram(reviewCode)}</code>`
      );
      if (imagePaths.length) {
        const { data: signed } = await supabase.storage.from('review-images').createSignedUrls(imagePaths, 86400);
        for (let i = 0; i < (signed || []).length; i += 1) {
          if (signed[i]?.signedUrl) {
            await sendTelegramAdminPhoto(
              signed[i].signedUrl,
              `Review <code>${escapeTelegram(reviewCode)}</code> · photo ${i + 1}/${imagePaths.length}`,
            );
          }
        }
      }
    } catch (err) {
      console.error('review-telegram-alert-failed', { message: err?.message });
    }

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
