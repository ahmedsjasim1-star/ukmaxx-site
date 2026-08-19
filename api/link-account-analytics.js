const { getSupabaseAdmin } = require('./_lib/supabase');

function bearerToken(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function cleanId(value) {
  return clean(value, 80).replace(/[^a-z0-9_-]/gi, '').slice(0, 80);
}

function cleanPath(value) {
  const path = clean(value, 500);
  if (!path || !path.startsWith('/')) return '/';
  return path.replace(/[^\w\-./?=&%#:+]/g, '').slice(0, 500);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'Sign in required' });

    const supabase = getSupabaseAdmin();
    const authResult = await supabase.auth.getUser(token);
    const user = authResult.data?.user;
    if (authResult.error || !user?.id) return res.status(401).json({ error: 'Invalid session' });

    const context = req.body?.analyticsContext || {};
    const visitorId = cleanId(context.visitorId);
    const sessionId = cleanId(context.sessionId);
    if (!visitorId || !sessionId) return res.status(204).end();

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    const update = {
      analytics_visitor_id: visitorId,
      analytics_session_id: sessionId,
      first_source: profile?.first_source || clean(context.firstSource, 120) || 'Direct',
      first_referrer: profile?.first_referrer || clean(context.firstReferrer, 500) || null,
      first_landing_page: profile?.first_landing_page || cleanPath(context.firstLandingPage),
      first_seen_at: profile?.first_seen_at || clean(context.firstSeenAt, 40) || new Date().toISOString(),
      first_utm_source: profile?.first_utm_source || clean(context.firstUtmSource, 80) || null,
      first_utm_medium: profile?.first_utm_medium || clean(context.firstUtmMedium, 80) || null,
      first_utm_campaign: profile?.first_utm_campaign || clean(context.firstUtmCampaign, 120) || null,
      last_linked_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('profiles').update(update).eq('id', user.id);
    if (error && !/column .* does not exist|schema cache/i.test(String(error.message || ''))) {
      throw error;
    }

    return res.status(204).end();
  } catch (error) {
    console.error('link-account-analytics-error', { message: error?.message });
    return res.status(202).json({ ok: false });
  }
};
