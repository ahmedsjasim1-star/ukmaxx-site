const { Resend } = require('resend');

async function sendOrderConfirmationEmail({ to, orderNumber, items, total, shipping }) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;
  const resend = new Resend(key);
  const supportEmail = process.env.SUPPORT_EMAIL || 'support@ukmaxx.co.uk';
  const itemsHtml = items.map(i => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:8px">
      <tr>
        <td style="background-color:#F0F6F7;border:1px solid #E6F0F2;border-radius:8px;padding:12px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
            <tr>
              <td valign="middle">
                <p style="font-size:14px;font-weight:600;color:#081F23;margin:0;line-height:1.3;font-family:Inter,Arial,sans-serif">${i.product_name}</p>
                <p style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:11px;color:#5B7B82;margin:3px 0 0;letter-spacing:0.04em;line-height:1.4">${i.sku} · Qty ${i.qty}</p>
              </td>
              <td align="right" valign="middle" style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:14px;font-weight:600;color:#081F23;line-height:1.2">£${Number(i.line_total).toFixed(2)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`).join('');
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UKMAXX Order Confirmation — ${orderNumber}</title></head>
<body style="margin:0;padding:0;background-color:#F0F4F5;font-family:Inter,Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
<tr><td style="background-color:#F0F4F5;padding:20px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:#ffffff;border-radius:12px;overflow:hidden">
      <!-- Status Bar -->
      <tr><td style="background:linear-gradient(135deg,#0A7E8C 0%,#0FA3B1 100%);padding:14px 28px"><p style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:11px;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:rgba(255,255,255,0.9);margin:0;text-align:center">Order Confirmed</p></td></tr>
      <!-- Logo -->
      <tr><td style="background-color:#ffffff;padding:24px 28px 16px;text-align:center"><a href="https://ukmaxx-site-5tc7.vercel.app" target="_blank" style="text-decoration:none;display:inline-block"><img src="https://ukmaxx-site-5tc7.vercel.app/images/ukmaxx-logo-premium.png" width="60" height="60" alt="UKMAXX" style="display:block;border:0;border-radius:8px"></a></td></tr>
      <!-- Order Number -->
      <tr><td style="padding:24px 28px 8px;text-align:center"><p style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:#0A7E8C;margin:0 0 12px;line-height:1">Order Placed</p><h1 style="font-family:'Space Grotesk','Helvetica Neue',Arial,sans-serif;font-size:28px;font-weight:600;letter-spacing:-0.02em;line-height:1.15;margin:0;color:#081F23">${orderNumber}</h1></td></tr>
      <!-- Items -->
      <tr><td style="padding:16px 28px 8px"><p style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:11px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:#5B7B82;margin:0 0 12px;line-height:1">Items Ordered</p>${itemsHtml}</td></tr>
      <!-- Total -->
      <tr><td style="padding:8px 28px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td style="border-top:1px solid #E6F0F2;padding-top:16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td style="font-size:14px;color:#5B7B82;font-family:Inter,Arial,sans-serif">Total</td><td align="right" style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:16px;font-weight:700;color:#081F23">£${Number(total).toFixed(2)}</td></tr></table></td></tr></table></td></tr>
      <!-- CTA -->
      <tr><td align="center" style="padding:20px 28px 28px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td align="center" style="background-color:#0A7E8C;border-radius:8px;mso-padding-alt:14px 28px"><a href="https://ukmaxx-site-5tc7.vercel.app/track.html?order=${orderNumber}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:'Space Grotesk','Helvetica Neue',Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.02em;line-height:1">Track my order →</a></td></tr></table></td></tr>
      <!-- Shipping -->
      <tr><td style="padding:0 28px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F0F6F7;border:1px solid #E6F0F2;border-radius:12px;border-collapse:collapse"><tr><td style="padding:16px 20px"><p style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:10.5px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:#5B7B82;margin:0 0 6px;line-height:1">Shipping To</p><p style="font-size:13.5px;color:#081F23;margin:0;line-height:1.6;font-family:Inter,Arial,sans-serif">${shipping.line1}${shipping.line2 ? '<br/>' + shipping.line2 : ''}<br/>${shipping.city}, ${shipping.postcode}<br/>${shipping.country}</p></td></tr></table></td></tr>
      <!-- Trust -->
      <tr><td style="padding:0 28px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td width="33%" style="text-align:center;padding:0 4px"><p style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:10px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#0A7E8C;margin:0 0 4px;line-height:1">✓ COA Verified</p><p style="font-size:11px;color:#5B7B82;margin:0;line-height:1.4;font-family:Inter,Arial,sans-serif">Batch tested</p></td><td width="33%" style="text-align:center;padding:0 4px;border-left:1px solid #E6F0F2;border-right:1px solid #E6F0F2"><p style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:10px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#0A7E8C;margin:0 0 4px;line-height:1">✓ 99%+ Purity</p><p style="font-size:11px;color:#5B7B82;margin:0;line-height:1.4;font-family:Inter,Arial,sans-serif">Third-party lab</p></td><td width="33%" style="text-align:center;padding:0 4px"><p style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:10px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#0A7E8C;margin:0 0 4px;line-height:1">✓ UK Stock</p><p style="font-size:11px;color:#5B7B82;margin:0;line-height:1.4;font-family:Inter,Arial,sans-serif">Same-day dispatch</p></td></tr></table></td></tr>
      <!-- Footer -->
      <tr><td style="padding:32px 28px 28px 28px;border-top:1px solid #E6F0F2"><p style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:11px;color:#5B7B82;margin:0 0 12px;letter-spacing:0.04em;line-height:1.5"><a href="https://t.me/ukmaxx" style="color:#0A7E8C;text-decoration:none;font-weight:600">Telegram</a> <span style="color:#D5E5E8;margin:0 8px">|</span> <a href="https://x.com/ukmaxx" style="color:#0A7E8C;text-decoration:none;font-weight:600">X (Twitter)</a> <span style="color:#D5E5E8;margin:0 8px">|</span> <a href="https://uk.trustpilot.com/review/ukmaxx.co.uk" style="color:#0A7E8C;text-decoration:none;font-weight:600">Trustpilot</a></p><p style="font-size:13px;color:#081F23;margin:0 0 16px;line-height:1.5;font-family:Inter,Arial,sans-serif">Questions about your order?<br/>Reply to this email or write to <a href="mailto:${supportEmail}" style="color:#0A7E8C;text-decoration:underline">${supportEmail}</a></p><p style="font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:10.5px;color:#8AA4AB;margin:0;line-height:1.6;letter-spacing:0.04em">UKMAXX · Octa Technologies Ltd<br/>All products strictly for laboratory and in-vitro research use only. Not for human consumption.<br/><a href="https://ukmaxx-site-5tc7.vercel.app/track.html?order=${orderNumber}" style="color:#5B7B82;text-decoration:underline">View tracking</a> · <a href="https://ukmaxx-site-5tc7.vercel.app/returns.html" style="color:#5B7B82;text-decoration:underline">Returns</a> · <a href="https://ukmaxx-site-5tc7.vercel.app/privacy-policy.html" style="color:#5B7B82;text-decoration:underline">Privacy</a></p></td></tr>
    </table>
  </td></tr></table>
</td></tr></table></body></html>`;
  await resend.emails.send({ from: process.env.RESEND_FROM || 'UKMAXX <orders@ukmaxx.com>', to, subject: `UKMAXX Order Confirmation — ${orderNumber}`, html });
}

async function sendAdminOrderAlertEmail({ orderNumber, customerEmail, fullName, phone, items, total, shipping, stripeSessionId }) {
  const key = process.env.RESEND_API_KEY;
  const adminTo = process.env.ADMIN_ORDER_EMAIL || 'ahmedsjasim1@gmail.com';
  if (!key || !adminTo) return;

  const resend = new Resend(key);
  const lines = items.map(i => `• ${i.product_name} x${i.qty} — £${Number(i.line_total).toFixed(2)}`).join('<br/>');
  const address = [shipping.line1, shipping.line2, shipping.city, shipping.postcode, shipping.country].filter(Boolean).join(', ');

  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
    <h2>New UKMAXX Order</h2>
    <p><strong>Order:</strong> ${orderNumber}<br/>
    <strong>Total:</strong> £${Number(total).toFixed(2)}<br/>
    <strong>Customer:</strong> ${customerEmail}<br/>
    <strong>Name:</strong> ${fullName || 'N/A'}<br/>
    <strong>Phone:</strong> ${phone || 'N/A'}<br/>
    <strong>Address:</strong> ${address || 'N/A'}<br/>
    <strong>Stripe Session:</strong> ${stripeSessionId}</p>
    <p><strong>Items</strong><br/>${lines}</p>
  </div>`;

  await resend.emails.send({
    from: process.env.RESEND_FROM || 'UKMAXX <orders@ukmaxx.com>',
    to: adminTo,
    subject: `New Order ${orderNumber} — £${Number(total).toFixed(2)}`,
    html,
  });
}

/* ------------------------------------------------
   Simple template renderer for Mustache-style:
   • {{var}} — simple value
   • {{#items}}...{{/items}} — array iteration
   • {{#boolKey}}...{{/boolKey}} — truthy/falsy section
------------------------------------------------- */
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
        let out = block;
        return out.replace(/\{\{(\w+)\}\}/g, (_, k) => ctx[k] ?? '');
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
    total: Number(total).toFixed(2),
    trackingNumber: trackingNumber || '—',
    expectedDate: expectedDate || '—',
    packedDate: packedDate || '—',
    dispatchedDate: dispatchedDate || '—',
    items: items || [],
    email: to,
  });
  await resend.emails.send({
    from: process.env.RESEND_FROM || 'UKMAXX <orders@ukmaxx.com>',
    to,
    subject: `Your UKMAXX order ${orderNumber} has been dispatched`,
    html: rendered,
  });
}

async function sendOrderDeliveredEmail({ to, orderNumber, items, total, deliveredTime }) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;
  const resend = new Resend(key);
  const rendered = renderTemplate(tpls.delivered, {
    orderNumber,
    total: Number(total).toFixed(2),
    deliveredTime: deliveredTime || '—',
    items: items || [],
    email: to,
  });
  await resend.emails.send({
    from: process.env.RESEND_FROM || 'UKMAXX <orders@ukmaxx.com>',
    to,
    subject: `Your UKMAXX order ${orderNumber} has been delivered`,
    html: rendered,
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
  });
  await resend.emails.send({
    from: process.env.RESEND_FROM || 'UKMAXX <orders@ukmaxx.com>',
    to,
    subject: `How was your UKMAXX order ${orderNumber}? — Quick review`,
    html: rendered,
  });
}

async function sendOrderCancelledEmail({ to, orderNumber, items, total, refundInitiated }) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;
  const resend = new Resend(key);
  const rendered = renderTemplate(tpls.cancelled, {
    orderNumber,
    total: Number(total).toFixed(2),
    refundInitiated: !!refundInitiated,
    items: items || [],
    email: to,
  });
  await resend.emails.send({
    from: process.env.RESEND_FROM || 'UKMAXX <orders@ukmaxx.com>',
    to,
    subject: `Your UKMAXX order ${orderNumber} has been cancelled`,
    html: rendered,
  });
}

async function sendOrderRefundedEmail({ to, orderNumber, total, refundDate }) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;
  const resend = new Resend(key);
  const rendered = renderTemplate(tpls.refunded, {
    orderNumber,
    total: Number(total).toFixed(2),
    refundDate: refundDate || new Date().toLocaleDateString('en-GB'),
    email: to,
  });
  await resend.emails.send({
    from: process.env.RESEND_FROM || 'UKMAXX <orders@ukmaxx.com>',
    to,
    subject: `Refund processed — UKMAXX order ${orderNumber}`,
    html: rendered,
  });
}

/* ------------------------------------------------
   Template strings (loaded once at module init).
------------------------------------------------- */
const fs = require('fs');
const path = require('path');
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
