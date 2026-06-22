const { getSupabaseAdmin } = require('./_lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const { initials, product, rating, reviewText, hp } = req.body || {};
  if (hp) return res.status(200).json({ ok: true });

  const cleanInitials = String(initials || '').trim().slice(0, 16);
  const cleanProduct = String(product || '').trim().slice(0, 32);
  const cleanText = String(reviewText || '').trim().slice(0, 500);
  const cleanRating = Number(rating);

  if (!cleanInitials || !cleanProduct || !cleanText || !Number.isInteger(cleanRating) || cleanRating < 1 || cleanRating > 5) {
    return res.status(400).json({ error: 'invalid_review' });
  }

  if (cleanText.length < 12) return res.status(400).json({ error: 'review_too_short' });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('reviews_pending').insert({
    initials: cleanInitials,
    product: cleanProduct,
    rating: cleanRating,
    review_text: cleanText,
    status: 'pending',
  });

  if (error) {
    console.error('submit-review-failed', error);
    return res.status(500).json({ error: 'submit_failed' });
  }

  return res.status(200).json({ ok: true });
};