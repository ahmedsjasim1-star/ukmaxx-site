const TRUSTPILOT_API = 'https://api.trustpilot.com/v1';

function json(res, status, body) {
  res.status(status).json(body);
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getTrustScore(profile, reviews) {
  const candidates = [
    profile?.score?.trustScore,
    profile?.score?.stars,
    profile?.trustScore,
    profile?.stars,
  ];
  for (const value of candidates) {
    const n = asNumber(value);
    if (n && n > 0) return n;
  }

  const ratings = reviews.map((r) => asNumber(r.stars)).filter(Boolean);
  if (!ratings.length) return null;
  return ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
}

function getReviewCount(profile, reviews) {
  const candidates = [
    profile?.numberOfReviews?.total,
    profile?.numberOfReviews,
    profile?.reviewCount,
    profile?.reviewsCount,
  ];
  for (const value of candidates) {
    const n = asNumber(value);
    if (n !== null) return n;
  }
  return reviews.length;
}

function getDistribution(profile, reviews) {
  const source = profile?.numberOfReviews || profile?.distribution || {};
  const direct = {};
  [1, 2, 3, 4, 5].forEach((star) => {
    const raw = source[star] ?? source[`${star}`] ?? source[`star${star}`] ?? source[`stars${star}`];
    const n = asNumber(raw);
    if (n !== null) direct[star] = n;
  });
  const total = Object.values(direct).reduce((sum, n) => sum + n, 0);
  if (total > 0) {
    return Object.fromEntries([5, 4, 3, 2, 1].map((star) => [star, Math.round((direct[star] || 0) / total * 100)]));
  }

  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  reviews.forEach((review) => {
    const stars = Math.round(asNumber(review.stars) || 0);
    if (stars >= 1 && stars <= 5) counts[stars] += 1;
  });
  const reviewTotal = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (!reviewTotal) return null;
  return Object.fromEntries([5, 4, 3, 2, 1].map((star) => [star, Math.round((counts[star] || 0) / reviewTotal * 100)]));
}

function displayName(name) {
  const clean = String(name || '').trim();
  if (!clean) return 'Verified reviewer';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  const apiKey = process.env.TRUSTPILOT_API_KEY;
  const businessUnitId = process.env.TRUSTPILOT_BUSINESS_UNIT_ID;
  if (!apiKey || !businessUnitId) {
    return json(res, 200, { configured: false, reviews: [] });
  }

  try {
    const headers = { apikey: apiKey };
    const profileUrl = `${TRUSTPILOT_API}/business-units/${encodeURIComponent(businessUnitId)}/profileinfo`;
    const reviewsUrl = new URL(`${TRUSTPILOT_API}/business-units/${encodeURIComponent(businessUnitId)}/reviews`);
    reviewsUrl.searchParams.set('perPage', '6');
    reviewsUrl.searchParams.set('page', '1');
    reviewsUrl.searchParams.set('language', 'en');
    reviewsUrl.searchParams.set('orderBy', 'createdat.desc');

    const [profileRes, reviewsRes] = await Promise.all([
      fetch(profileUrl, { headers }),
      fetch(reviewsUrl, { headers }),
    ]);

    if (!profileRes.ok || !reviewsRes.ok) {
      console.error('trustpilot-fetch-failed', {
        profileStatus: profileRes.status,
        reviewsStatus: reviewsRes.status,
      });
      return json(res, 502, { error: 'trustpilot_fetch_failed' });
    }

    const profile = await profileRes.json().catch(() => ({}));
    const reviewPayload = await reviewsRes.json().catch(() => ({}));
    const reviews = Array.isArray(reviewPayload?.reviews) ? reviewPayload.reviews : [];
    const rating = getTrustScore(profile, reviews);
    const reviewCount = getReviewCount(profile, reviews);

    return json(res, 200, {
      configured: true,
      profileUrl: `https://uk.trustpilot.com/review/ukmaxx.co.uk`,
      reviewUrl: `https://uk.trustpilot.com/evaluate/ukmaxx.co.uk`,
      rating,
      reviewCount,
      label: rating ? 'Excellent' : 'Trustpilot',
      distribution: getDistribution(profile, reviews),
      reviews: reviews.map((review) => ({
        id: review.id,
        rating: asNumber(review.stars) || 0,
        date: review.createdAt,
        title: review.title || '',
        text: review.text || '',
        initials: displayName(review.consumer?.displayName),
        verified: Boolean(review.isVerified),
        product: 'UKMAXX',
      })).filter((review) => review.rating > 0 && review.text),
    });
  } catch (error) {
    console.error('trustpilot-error', { message: error?.message });
    return json(res, 500, { error: 'trustpilot_error' });
  }
};
