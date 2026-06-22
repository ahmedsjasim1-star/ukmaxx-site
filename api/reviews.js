const { getSupabaseAdmin } = require('./_lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('reviews_public')
    .select('initials,product,rating,review_text,review_date')
    .order('review_date', { ascending: false })
    .limit(8);

  if (error) {
    console.error('reviews-fetch-failed', error);
    return res.status(500).json({ error: 'fetch_failed' });
  }

  return res.status(200).json({ reviews: data || [] });
};