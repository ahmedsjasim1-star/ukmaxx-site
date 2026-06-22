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
        from: process.env.RESEND_FROM || 'UKMAXX <orders@ukmaxx.com>',
        to: cleanEmail,
        subject: 'UKMAXX updates subscription confirmed',
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
          <h3>Subscription confirmed</h3>
          <p>You're now subscribed to UKMAXX restock and batch update emails.</p>
          <p style="font-size:12px;color:#555">If this wasn't you, you can unsubscribe here: <a href="${unsubscribeUrl}">${unsubscribeUrl}</a></p>
        </div>`,
      });
    } catch (e) {
      console.error('subscribe-confirmation-email-failed', e?.message || e);
    }
  }

  return res.status(200).json({ ok: true });
};