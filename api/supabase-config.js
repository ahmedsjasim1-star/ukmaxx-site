module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  try {
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return res.status(500).json({ error: 'Supabase public config not available. Set SUPABASE_URL and SUPABASE_ANON_KEY in environment.' });
    }
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    res.status(200).json({ url, anonKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
