const fs = require('fs');
const path = require('path');
const { Resend } = require('resend');

const BASE_URL = process.env.PUBLIC_BASE_URL || process.env.SITE_URL || 'https://www.ukmaxx.co.uk';
const FROM = process.env.RESEND_FROM || 'UKMAXX Orders <orders@ukmaxx.co.uk>';

function useProductionBase(html) {
  return String(html || '');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

function renderOrderItems(items = []) {
  return items.map((item) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:8px">
      <tr>
        <td style="background-color:#F8FBFC;border:1px solid #E6F0F2;border-radius:10px;padding:14px 16px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
            <tr>
              <td valign="middle">
                <p style="font-size:14.5px;font-weight:700;color:#081F23;margin:0;line-height:1.3;font-family:Inter,Arial,sans-serif">${escapeHtml(item.product_name)}</p>
                <p style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:11px;color:#5B7B82;margin:4px 0 0;letter-spacing:0.04em;line-height:1.4">${escapeHtml(item.sku)} &middot; Qty ${escapeHtml(item.qty)}</p>
              </td>
              <td align="right" valign="middle" style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:14px;font-weight:700;color:#081F23;line-height:1.2">&pound;${formatMoney(item.line_total)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `).join('');
}

async function sendOrderConfirmationEmail({ to, orderNumber, items, total, shipping }) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;

  const resend = new Resend(key);
  const supportEmail = process.env.SUPPORT_EMAIL || 'support@ukmaxx.co.uk';
  const safeShipping = shipping || {};
  const trackUrl = `${BASE_URL}/track.html?order=${encodeURIComponent(orderNumber)}`;
  const itemsHtml = renderOrderItems(items);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>UKMAXX order confirmed - ${escapeHtml(orderNumber)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F0F4F5;font-family:Inter,Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
<tr><td style="background-color:#F0F4F5;padding:20px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 12px 35px rgba(8,31,35,0.08)">
      <tr>
        <td style="background:linear-gradient(135deg,#081F23 0%,#0A7E8C 100%);padding:12px 28px">
          <p style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:10.5px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.92);margin:0;text-align:center">Order received &middot; UK tracked dispatch</p>
        </td>
      </tr>
      <tr>
        <td style="background-color:#ffffff;padding:30px 28px 22px;text-align:center">
          <a href="${BASE_URL}" target="_blank" style="text-decoration:none;display:inline-block;margin-bottom:18px"><img src="${BASE_URL}/images/ukmaxx-logo-premium.png" width="64" height="64" alt="UKMAXX" style="display:block;border:0;border-radius:10px"></a>
          <p style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:10.5px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#0A7E8C;margin:0 0 12px;line-height:1">Order confirmed</p>
          <h1 style="font-family:'Space Grotesk','Helvetica Neue',Arial,sans-serif;font-size:31px;font-weight:700;letter-spacing:-0.03em;line-height:1.12;margin:0 0 12px;color:#081F23">Thanks for your order.</h1>
          <p style="font-size:15px;line-height:1.6;margin:0 auto;max-width:430px;color:#5B7B82;font-family:Inter,Arial,sans-serif">We have received <strong style="color:#081F23">${escapeHtml(orderNumber)}</strong>. Your order is now being prepared for Royal Mail Tracked 24 dispatch.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 28px 20px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F0F6F7;border:1px solid #D5E5E8;border-radius:14px;border-collapse:collapse">
            <tr>
              <td width="33.33%" style="padding:16px 8px;text-align:center">
                <p style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0A7E8C;margin:0 0 5px">1. Paid</p>
                <p style="font-size:11.5px;color:#5B7B82;margin:0;line-height:1.35">Payment received</p>
              </td>
              <td width="33.33%" style="padding:16px 8px;text-align:center;border-left:1px solid #D5E5E8;border-right:1px solid #D5E5E8">
                <p style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0A7E8C;margin:0 0 5px">2. Preparing</p>
                <p style="font-size:11.5px;color:#5B7B82;margin:0;line-height:1.35">Packed discreetly</p>
              </td>
              <td width="33.33%" style="padding:16px 8px;text-align:center">
                <p style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0A7E8C;margin:0 0 5px">3. Tracking</p>
                <p style="font-size:11.5px;color:#5B7B82;margin:0;line-height:1.35">Sent on dispatch</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 28px 8px">
          <p style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#5B7B82;margin:0 0 12px;line-height:1">Your order</p>
          ${itemsHtml}
        </td>
      </tr>
      <tr>
        <td style="padding:8px 28px 18px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
            <tr>
              <td style="border-top:1px solid #E6F0F2;padding-top:16px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
                  <tr>
                    <td style="font-size:14px;color:#5B7B82;font-family:Inter,Arial,sans-serif">Order total</td>
                    <td align="right" style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:17px;font-weight:800;color:#081F23">&pound;${formatMoney(total)}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding:14px 28px 28px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
            <tr>
              <td align="center" style="background-color:#0A7E8C;border-radius:9px;mso-padding-alt:14px 30px">
                <a href="${trackUrl}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:'Space Grotesk','Helvetica Neue',Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.02em;line-height:1">View order status &rarr;</a>
              </td>
            </tr>
          </table>
          <p style="font-size:12.5px;color:#5B7B82;margin:12px 0 0;line-height:1.5;font-family:Inter,Arial,sans-serif">Tracking activates once the Royal Mail label is generated and dispatched.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 28px 22px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF;border:1px solid #E6F0F2;border-radius:12px;border-collapse:collapse">
            <tr>
              <td style="padding:17px 20px">
                <p style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:10.5px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#5B7B82;margin:0 0 8px;line-height:1">Shipping to</p>
                <p style="font-size:13.5px;color:#081F23;margin:0;line-height:1.6;font-family:Inter,Arial,sans-serif">${escapeHtml(safeShipping.line1)}${safeShipping.line2 ? '<br>' + escapeHtml(safeShipping.line2) : ''}<br>${escapeHtml(safeShipping.city)}, ${escapeHtml(safeShipping.postcode)}<br>${escapeHtml(safeShipping.country || 'United Kingdom')}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:0 28px 30px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
            <tr>
              <td width="33%" style="text-align:center;padding:0 4px"><p style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0A7E8C;margin:0 0 4px;line-height:1">COA verified</p><p style="font-size:11px;color:#5B7B82;margin:0;line-height:1.4;font-family:Inter,Arial,sans-serif">Batch tested</p></td>
              <td width="33%" style="text-align:center;padding:0 4px;border-left:1px solid #E6F0F2;border-right:1px solid #E6F0F2"><p style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0A7E8C;margin:0 0 4px;line-height:1">UK stock</p><p style="font-size:11px;color:#5B7B82;margin:0;line-height:1.4;font-family:Inter,Arial,sans-serif">Held ready</p></td>
              <td width="33%" style="text-align:center;padding:0 4px"><p style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0A7E8C;margin:0 0 4px;line-height:1">Tracked 24</p><p style="font-size:11px;color:#5B7B82;margin:0;line-height:1.4;font-family:Inter,Arial,sans-serif">Royal Mail</p></td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:30px 28px 28px 28px;border-top:1px solid #E6F0F2">
          <p style="font-size:13px;color:#081F23;margin:0 0 12px;line-height:1.5;font-family:Inter,Arial,sans-serif">Need help with this order? Reply to this email or contact <a href="mailto:${supportEmail}" style="color:#0A7E8C;text-decoration:underline">${escapeHtml(supportEmail)}</a>.</p>
          <p style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:11px;color:#5B7B82;margin:0 0 14px;letter-spacing:0.04em;line-height:1.5"><a href="https://t.me/ukmaxxofficial" style="color:#0A7E8C;text-decoration:none;font-weight:700">Telegram</a> <span style="color:#D5E5E8;margin:0 8px">|</span> <a href="https://x.com/UKMAXXofficial" style="color:#0A7E8C;text-decoration:none;font-weight:700">X (Twitter)</a></p>
          <p style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:10.5px;color:#8AA4AB;margin:0;line-height:1.6;letter-spacing:0.04em">UKMAXX &middot; Octa Technologies Ltd<br>All products strictly for laboratory and in-vitro research use only. Not for human consumption.<br><a href="${trackUrl}" style="color:#5B7B82;text-decoration:underline">View order</a> &middot; <a href="${BASE_URL}/coa.html" style="color:#5B7B82;text-decoration:underline">COA results</a> &middot; <a href="${BASE_URL}/privacy-policy.html" style="color:#5B7B82;text-decoration:underline">Privacy</a></p>
        </td>
      </tr>
    </table>
  </td></tr></table>
</td></tr></table>
</body>
</html>`;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `UKMAXX order confirmed - ${orderNumber}`,
    html: useProductionBase(html),
  });
}

async function sendAdminOrderAlertEmail({ orderNumber, customerEmail, fullName, phone, items, total, shipping, stripeSessionId }) {
  const key = process.env.RESEND_API_KEY;
  const adminTo = process.env.ADMIN_ORDER_EMAIL || 'orders@ukmaxx.co.uk';
  if (!key || !adminTo) return;

  const resend = new Resend(key);
  const safeShipping = shipping || {};
  const address = [safeShipping.line1, safeShipping.line2, safeShipping.city, safeShipping.postcode, safeShipping.country].filter(Boolean).join(', ');
  const itemRows = (items || []).map((item) => `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #E6F0F2">
        <strong>${escapeHtml(item.product_name)}</strong><br>
        <span style="color:#5B7B82">${escapeHtml(item.sku)} &middot; Qty ${escapeHtml(item.qty)}</span>
      </td>
      <td align="right" style="padding:9px 0;border-bottom:1px solid #E6F0F2;font-family:Menlo,Consolas,monospace">&pound;${formatMoney(item.line_total)}</td>
    </tr>
  `).join('');

  const html = `<div style="margin:0;padding:24px;background:#F0F4F5;font-family:Inter,Arial,sans-serif;color:#081F23">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E6F0F2">
      <div style="background:#081F23;color:#ffffff;padding:16px 22px">
        <p style="margin:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#9ED8DF">New UKMAXX order</p>
        <h2 style="margin:6px 0 0;font-size:24px;line-height:1.2">${escapeHtml(orderNumber)} &middot; &pound;${formatMoney(total)}</h2>
      </div>
      <div style="padding:22px">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:18px">
          <tr><td style="padding:6px 0;color:#5B7B82">Customer</td><td align="right" style="padding:6px 0">${escapeHtml(fullName || 'N/A')}</td></tr>
          <tr><td style="padding:6px 0;color:#5B7B82">Email</td><td align="right" style="padding:6px 0"><a href="mailto:${escapeHtml(customerEmail)}" style="color:#0A7E8C">${escapeHtml(customerEmail)}</a></td></tr>
          <tr><td style="padding:6px 0;color:#5B7B82">Phone</td><td align="right" style="padding:6px 0">${escapeHtml(phone || 'N/A')}</td></tr>
          <tr><td style="padding:6px 0;color:#5B7B82;vertical-align:top">Address</td><td align="right" style="padding:6px 0;max-width:360px">${escapeHtml(address || 'N/A')}</td></tr>
          <tr><td style="padding:6px 0;color:#5B7B82">Payment</td><td align="right" style="padding:6px 0">${escapeHtml(stripeSessionId || 'N/A')}</td></tr>
        </table>
        <p style="margin:0 0 8px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#5B7B82">Items</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${itemRows}</table>
      </div>
    </div>
  </div>`;

  await resend.emails.send({
    from: FROM,
    to: adminTo,
    subject: `New order ${orderNumber} - £${formatMoney(total)}`,
    html,
  });
}

function renderTemplate(tpl, ctx) {
  return tpl
    .replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, block) => {
      const val = ctx[key];
      if (Array.isArray(val)) {
        return val.map((item) => {
          let out = block;
          for (const [k, v] of Object.entries(item)) {
            out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
          }
          return out;
        }).join('');
      }
      if (val) {
        return block.replace(/\{\{(\w+)\}\}/g, (_, k) => ctx[k] ?? '');
      }
      return '';
    })
    .replace(/\{\{(\w+)\}\}/g, (_, key) => ctx[key] ?? '');
}

async function sendOrderDispatchedEmail({ to, orderNumber, items, total, trackingNumber, expectedDate, packedDate, dispatchedDate }) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;
  const resend = new Resend(key);
  const rendered = renderTemplate(tpls.dispatched, {
    orderNumber,
    total: formatMoney(total),
    trackingNumber: trackingNumber || '-',
    expectedDate: expectedDate || '-',
    packedDate: packedDate || '-',
    dispatchedDate: dispatchedDate || '-',
    items: items || [],
    email: to,
  });
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Your UKMAXX order ${orderNumber} has been dispatched`,
    html: useProductionBase(rendered),
  });
}

async function sendOrderDeliveredEmail({ to, orderNumber, items, total, deliveredTime }) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;
  const resend = new Resend(key);
  const rendered = renderTemplate(tpls.delivered, {
    orderNumber,
    total: formatMoney(total),
    deliveredTime: deliveredTime || '-',
    items: items || [],
    email: to,
    reviewUrl: `${BASE_URL}/review.html?order=${encodeURIComponent(orderNumber)}`,
  });
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Your UKMAXX order ${orderNumber} has been delivered`,
    html: useProductionBase(rendered),
  });
}

async function sendReviewRequestEmail({ to, orderNumber, items }) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;
  const resend = new Resend(key);
  const rendered = renderTemplate(tpls.reviewRequest, {
    orderNumber,
    items: items || [],
    email: to,
    reviewUrl: `${BASE_URL}/review.html?order=${encodeURIComponent(orderNumber)}`,
  });
  await resend.emails.send({
    from: FROM,
    to,
    subject: `How was your UKMAXX order ${orderNumber}? - Quick review`,
    html: useProductionBase(rendered),
  });
}

async function sendOrderCancelledEmail({ to, orderNumber, items, total, refundInitiated }) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;
  const resend = new Resend(key);
  const rendered = renderTemplate(tpls.cancelled, {
    orderNumber,
    total: formatMoney(total),
    refundInitiated: !!refundInitiated,
    items: items || [],
    email: to,
  });
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Your UKMAXX order ${orderNumber} has been cancelled`,
    html: useProductionBase(rendered),
  });
}

async function sendOrderRefundedEmail({ to, orderNumber, total, refundDate }) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;
  const resend = new Resend(key);
  const rendered = renderTemplate(tpls.refunded, {
    orderNumber,
    total: formatMoney(total),
    refundDate: refundDate || new Date().toLocaleDateString('en-GB'),
    email: to,
  });
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Refund processed - UKMAXX order ${orderNumber}`,
    html: useProductionBase(rendered),
  });
}

const emailsDir = path.resolve(__dirname, '../../emails');
const read = (name) => {
  try { return fs.readFileSync(path.join(emailsDir, name), 'utf-8'); } catch { return ''; }
};

const tpls = {
  dispatched: read('dispatched.html'),
  delivered: read('delivered.html'),
  reviewRequest: read('review-request.html'),
  cancelled: read('cancelled.html'),
  refunded: read('refunded.html'),
};

module.exports = {
  sendOrderConfirmationEmail,
  sendAdminOrderAlertEmail,
  sendOrderDispatchedEmail,
  sendOrderDeliveredEmail,
  sendReviewRequestEmail,
  sendOrderCancelledEmail,
  sendOrderRefundedEmail,
};
