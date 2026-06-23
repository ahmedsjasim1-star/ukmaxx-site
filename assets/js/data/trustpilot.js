export const TRUSTPILOT = {
  profileUrl: 'https://uk.trustpilot.com/review/ukmaxx.co.uk',
  reviewUrl: 'https://uk.trustpilot.com/evaluate/ukmaxx.co.uk',
  apiUrl: '/api/trustpilot',
  businessUnitId: '6a3b074b9a89ab506eaa9e5b',

  // Fill these with real Trustpilot data once the UKMAXX business profile is live.
  // Keep rating as null until Trustpilot shows a genuine public score.
  rating: null,
  reviewCount: 0,
  label: 'Trustpilot profile coming soon',

  // Optional manual fallback for real Trustpilot reviews only.
  // Example:
  // { product: 'UKMAXX', rating: 5, date: '23 Jun 2026', initials: 'A.B.', text: 'Real Trustpilot review text...' }
  reviews: [],
};
