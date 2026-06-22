const { createClient } = require('@supabase/supabase-js');

let cached;
function getSupabaseAdmin() {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase admin env vars');
  cached = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return cached;
}

module.exports = { getSupabaseAdmin };
