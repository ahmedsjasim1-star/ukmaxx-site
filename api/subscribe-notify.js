const { getSupabaseAdmin } = require('./_lib/supabase');
const { Resend } = require('resend');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const { email, topics, hp } = req.body || {};
  if (hp) return res.status(200).json({ ok: true });

  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: 'invalid_email' });

  const safeTopics = Array.isArray(topics) && topics.length
    ? topics.filter(t => ['restock', 'batch_updates'].includes(t))
    : ['restock', 'batch_updates'];

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('notify_subscribers').upsert({
    email: cleanEmail,
    topics: safeTopics,
    status: 'active',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'email' });

  if (error) {
    console.error('subscribe-notify-failed', error);
    return res.status(500).json({ error: 'subscribe_failed' });
  }

  const shouldSendConfirmation = String(process.env.NOTIFY_SEND_CONFIRMATION || '').toLowerCase() === 'true';
  if (shouldSendConfirmation && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const base = process.env.PUBLIC_BASE_URL || 'https://www.ukmaxx.co.uk';
      const unsubscribeUrl = `${base}/api/unsubscribe-notify?email=${encodeURIComponent(cleanEmail)}`;
      await resend.emails.send({
        from: process.env.RESEND_UPDATES_FROM || process.env.RESEND_FROM || 'UKMAXX <orders@ukmaxx.co.uk>',
        to: cleanEmail,
        subject: 'You’re on the UKMAXX batch update list',
        html: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UKMAXX batch updates</title></head>
        <body style="margin:0;padding:0;background:#F4F8F9;font-family:Inter,Arial,sans-serif;color:#081F23">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F8F9;padding:28px 14px">
            <tr><td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #DCE8EA;border-radius:18px;overflow:hidden">
                <tr><td style="padding:28px 28px 14px;text-align:center">
                  <a href="${base}" target="_blank" style="display:inline-block;text-decoration:none"><img src="${base}/images/ukmaxx-logo-premium.png" width="64" height="64" alt="UKMAXX" style="display:block;border:0;border-radius:10px"></a>
                </td></tr>
                <tr><td style="padding:8px 30px 10px;text-align:center">
                  <p style="margin:0 0 10px;font-family:Menlo,Consolas,monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#0A7E8C">Batch alerts confirmed</p>
                  <h1 style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:28px;line-height:1.1;color:#081F23">You’re on the UKMAXX update list.</h1>
                  <p style="margin:0;color:#2A4248;font-size:15px;line-height:1.65">We’ll email important restock, COA and batch-release updates. Community-only codes are shared through Telegram.</p>
                </td></tr>
                <tr><td style="padding:16px 30px 30px;text-align:center">
                  <a href="https://t.me/ukmaxxofficial" target="_blank" style="display:inline-block;background:#0A7E8C;color:#ffffff;text-decoration:none;border-radius:8px;padding:13px 22px;font-weight:700;font-size:14px">Join UKMAXX on Telegram</a>
                  <p style="margin:16px 0 0;color:#5B7B82;font-size:13px;line-height:1.55">Follow launch notes and product updates on <a href="https://x.com/UKMAXXofficial" target="_blank" style="color:#0A7E8C;text-decoration:none;font-weight:700">X</a>.</p>
                </td></tr>
                <tr><td style="padding:22px 30px;background:#F8FBFC;border-top:1px solid #E6F0F2;text-align:center">
                  <p style="margin:0 0 8px;color:#5B7B82;font-size:12px;line-height:1.55">If this wasn’t you, unsubscribe here:</p>
                  <p style="margin:0;font-size:12px;line-height:1.55"><a href="${unsubscribeUrl}" style="color:#0A7E8C;text-decoration:underline">${unsubscribeUrl}</a></p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body></html>`,
      });
    } catch (e) {
      console.error('subscribe-confirmation-email-failed', e?.message || e);
    }
  }

  return res.status(200).json({ ok: true });
};
