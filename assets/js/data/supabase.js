let client = null;
let initPromise = null;

async function init() {
  try {
    const res = await fetch('/api/supabase-config');
    console.log('[supabase] config fetch status:', res.status);
    if (!res.ok) throw new Error('Failed to fetch Supabase config');
    const { url, anonKey } = await res.json();
    console.log('[supabase] config received, url:', url ? 'set' : 'MISSING', 'key:', anonKey ? 'set' : 'MISSING');
    const mod = await import('https://esm.sh/@supabase/supabase-js@2.49.8');
    client = mod.createClient(url, anonKey, {
      auth: {
        storageKey: 'ukmaxx_auth',
        persistSession: true,
        detectSessionInUrl: true,
        autoRefreshToken: true,
        flowType: 'pkce'
      }
    });
    initPromise = null;
    return client;
  } catch (err) {
    initPromise = null;
    throw err;
  }
}

export function getSupabase() {
  if (client) return Promise.resolve(client);
  if (!initPromise) initPromise = init();
  return initPromise;
}
