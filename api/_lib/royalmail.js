const ROYALMAIL_API_BASE = 'https://api.parcel.royalmail.com/api/v1';

const PRODUCT_WEIGHTS_GRAMS = {
  RT10: 25,
  WA10: 120,
  RT10X3: 195,
  BC5X3: 195,
  BC5: 25,
  IP5: 25,
  NJ500: 25,
  GHKCU: 25,
};

function isRoyalMailConfigured() {
  return Boolean(process.env.ROYALMAIL_CLICKDROP_AUTH_KEY);
}

function royalMailTrackingUrl(trackingNumber) {
  return `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(trackingNumber)}`;
}

function sanitize(value, fallback = '') {
  return String(value || fallback).trim();
}

function collectRoyalMailErrorMessages(value, messages = [], depth = 0) {
  if (!value || depth > 5) return messages;

  if (Array.isArray(value)) {
    value.forEach((item) => collectRoyalMailErrorMessages(item, messages, depth + 1));
    return messages;
  }

  if (typeof value !== 'object') return messages;

  const messageParts = ['message', 'errorMessage', 'reason', 'statusMessage', 'description']
    .map((key) => sanitize(value[key]))
    .filter(Boolean);
  const codeParts = ['code', 'field', 'path', 'property']
    .map((key) => sanitize(value[key]))
    .filter(Boolean);

  if (messageParts.length || codeParts.length) {
    messages.push([...messageParts, ...codeParts].join(' '));
  }

  Object.entries(value).forEach(([key, child]) => {
    if (['order', 'recipient', 'sender', 'billing', 'address'].includes(key)) return;
    collectRoyalMailErrorMessages(child, messages, depth + 1);
  });

  return messages;
}

function countryCode(value) {
  const raw = sanitize(value || 'GB').toUpperCase();
  if (raw === 'UNITED KINGDOM' || raw === 'UK') return 'GB';
  return raw.length === 2 ? raw : 'GB';
}

function calculateWeight(items = []) {
  const packagingWeight = Number(process.env.ROYALMAIL_PACKAGING_WEIGHT_GRAMS || 50);
  const fallbackItemWeight = Number(process.env.ROYALMAIL_DEFAULT_ITEM_WEIGHT_GRAMS || 50);
  const total = items.reduce((sum, item) => {
    const sku = sanitize(item.sku).toUpperCase();
    const qty = Math.max(1, Number(item.qty || 1));
    const each = PRODUCT_WEIGHTS_GRAMS[sku] || fallbackItemWeight;
    return sum + (each * qty);
  }, packagingWeight);
  return Math.max(100, Math.min(750, Math.round(total)));
}

function buildPackageContents(items = []) {
  return items.map((item) => {
    const qty = Math.max(1, Number(item.qty || 1));
    const unitValue = Number(item.price || item.line_total || 0) / qty;
    const sku = sanitize(item.sku).toUpperCase();
    return {
      name: sanitize(item.product_name || sku, sku),
      SKU: sku,
      quantity: qty,
      unitValue: Number(unitValue.toFixed(2)),
      unitWeightInGrams: PRODUCT_WEIGHTS_GRAMS[sku] || Number(process.env.ROYALMAIL_DEFAULT_ITEM_WEIGHT_GRAMS || 50),
      originCountryCode: 'GB',
    };
  });
}

function buildRoyalMailOrderPayload(order, items = [], options = {}) {
  const fullName = sanitize(order.full_name, 'Customer');
  const email = sanitize(order.email);
  const phone = sanitize(order.phone);
  const line1 = sanitize(order.shipping_address_line1);
  const line2 = sanitize(order.shipping_address_line2);
  const city = sanitize(order.shipping_city);
  const postcode = sanitize(order.shipping_postcode).toUpperCase();
  const serviceCode = sanitize(options.serviceCode || process.env.ROYALMAIL_SERVICE_CODE || 'TOLP24');
  const packageFormatIdentifier = sanitize(options.packageFormatIdentifier || process.env.ROYALMAIL_PACKAGE_FORMAT || 'smallParcel');
  const includeLabelInResponse = options.includeLabelInResponse ?? String(process.env.ROYALMAIL_INCLUDE_LABEL_IN_RESPONSE || '').toLowerCase() === 'true';

  return {
    items: [{
      orderReference: sanitize(order.order_number).toUpperCase(),
      isRecipientABusiness: false,
      orderDate: order.created_at || new Date().toISOString(),
      recipient: {
        address: {
          fullName,
          addressLine1: line1,
          addressLine2: line2,
          addressLine3: '',
          city,
          county: '',
          postcode,
          countryCode: countryCode(order.shipping_country),
        },
        phoneNumber: phone,
        emailAddress: email,
      },
      sender: {
        tradingName: sanitize(process.env.ROYALMAIL_TRADING_NAME || 'UKMAXX'),
        phoneNumber: sanitize(process.env.ROYALMAIL_SENDER_PHONE || ''),
        emailAddress: sanitize(process.env.ROYALMAIL_SENDER_EMAIL || process.env.SUPPORT_EMAIL || 'support@ukmaxx.co.uk'),
      },
      billing: {
        address: {
          fullName,
          addressLine1: line1,
          addressLine2: line2,
          addressLine3: '',
          city,
          county: '',
          postcode,
          countryCode: countryCode(order.shipping_country),
        },
        phoneNumber: phone,
        emailAddress: email,
      },
      packages: [{
        weightInGrams: calculateWeight(items),
        packageFormatIdentifier,
        dimensions: {
          heightInMms: Number(process.env.ROYALMAIL_PACKAGE_HEIGHT_MM || 50),
          widthInMms: Number(process.env.ROYALMAIL_PACKAGE_WIDTH_MM || 127),
          depthInMms: Number(process.env.ROYALMAIL_PACKAGE_DEPTH_MM || 178),
        },
        contents: buildPackageContents(items),
      }],
      postageDetails: {
        serviceCode,
        receiveEmailNotification: true,
        receiveSmsNotification: Boolean(phone),
        sendNotificationsTo: 'recipient',
      },
      shippingCostCharged: Number(order.shipping || 0),
      subtotal: Number(order.subtotal || 0),
      total: Number(order.total || 0),
      label: {
        includeLabelInResponse,
      },
    }],
  };
}

async function royalMailRequest(path, { method = 'GET', body } = {}) {
  const authKey = process.env.ROYALMAIL_CLICKDROP_AUTH_KEY;
  if (!authKey) throw new Error('Royal Mail auth key is not configured');

  const response = await fetch(`${ROYALMAIL_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: authKey,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => '');

  if (!response.ok) {
    const details = typeof data === 'string'
      ? data
      : collectRoyalMailErrorMessages(data).join('; ') || `Request rejected with status ${response.status}`;
    throw new Error(`Royal Mail API ${response.status}: ${details.slice(0, 600)}`);
  }

  return data;
}

function getCreatedOrder(response) {
  const failed = response?.failedOrders || [];
  if (failed.length) {
    const first = failed[0];
    const message = collectRoyalMailErrorMessages(first)
      .filter(Boolean)
      .join('; ')
      || 'Royal Mail failed to create the order';
    throw new Error(message);
  }

  const created = response?.createdOrders?.[0];
  if (!created) throw new Error(`Royal Mail did not return a created order: ${JSON.stringify(response).slice(0, 600)}`);
  return created;
}

function pickTrackingNumber(createdOrder) {
  return createdOrder?.packages?.find((pkg) => pkg?.trackingNumber)?.trackingNumber
    || createdOrder?.trackingNumber
    || null;
}

async function createRoyalMailOrder(order, items = [], options = {}) {
  const payload = buildRoyalMailOrderPayload(order, items, options);
  let response;

  try {
    response = await royalMailRequest('/orders', { method: 'POST', body: payload });
  } catch (error) {
    const currentFormat = payload.items?.[0]?.packages?.[0]?.packageFormatIdentifier;
    if (currentFormat !== 'parcel' && /packageFormatIdentifier|package format|format/i.test(error.message || '')) {
      payload.items[0].packages[0].packageFormatIdentifier = 'parcel';
      response = await royalMailRequest('/orders', { method: 'POST', body: payload });
    } else {
      throw error;
    }
  }

  const created = getCreatedOrder(response);
  return {
    response,
    createdOrder: created,
    orderIdentifier: created.orderIdentifier || null,
    trackingNumber: pickTrackingNumber(created),
    labelReturned: Boolean(created.label),
    generatedDocuments: created.generatedDocuments || [],
  };
}

async function syncRoyalMailOrderToSupabase(supabase, order, items = [], options = {}) {
  if (!isRoyalMailConfigured()) {
    return { skipped: true, reason: 'not_configured' };
  }

  if (order.royalmail_order_identifier || order.tracking_number) {
    return {
      skipped: true,
      reason: 'already_synced',
      trackingNumber: order.tracking_number || null,
      orderIdentifier: order.royalmail_order_identifier || null,
    };
  }

  const result = await createRoyalMailOrder(order, items, options);
  const trackingUrl = result.trackingNumber ? royalMailTrackingUrl(result.trackingNumber) : null;

  const update = {
    status: 'processing',
    tracking_number: result.trackingNumber || null,
    tracking_url: trackingUrl,
    royalmail_order_identifier: result.orderIdentifier,
    royalmail_tracking_number: result.trackingNumber || null,
    royalmail_label_status: result.labelReturned ? 'label_returned' : 'created',
    royalmail_payload: result.response,
    label_created_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('orders').update(update).eq('id', order.id);
  if (error) throw error;

  try {
    const { error: auditError } = await supabase.from('admin_audit_log').insert({
      action: 'royalmail_order_created',
      order_id: order.id,
      payload: {
        order_number: order.order_number,
        royalmail_order_identifier: result.orderIdentifier,
        tracking_number: result.trackingNumber || null,
        generated_documents: result.generatedDocuments,
        label_returned: result.labelReturned,
      },
    });
    if (auditError) {
      console.error('royalmail-success-audit-log-error', {
        orderId: order.id,
        orderNumber: order.order_number,
        message: auditError.message,
      });
    }
  } catch (auditError) {
    console.error('royalmail-success-audit-log-error', {
      orderId: order.id,
      orderNumber: order.order_number,
      message: auditError?.message,
    });
  }

  return { ...result, trackingUrl };
}

module.exports = {
  buildRoyalMailOrderPayload,
  createRoyalMailOrder,
  isRoyalMailConfigured,
  royalMailTrackingUrl,
  syncRoyalMailOrderToSupabase,
};
