const { getSupabaseAdmin } = require('./_lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  const email = String(req.query?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).send('Invalid email');

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('notify_subscribers')
    .update({ status: 'unsubscribed', updated_at: new Date().toISOString() })
    .eq('email', email);

  if (error) {
    console.error('unsubscribe-notify-failed', error);
    return res.status(500).send('Unable to unsubscribe right now');
  }

  return res.status(200).send('You have been unsubscribed from UKMAXX updates.');
};