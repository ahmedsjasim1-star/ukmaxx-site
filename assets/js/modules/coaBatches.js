import { getSupabase } from '../data/supabase.js';
import { applyCoaBatches } from '../data/products.js';

let loadPromise = null;

export function loadCoaBatches() {
  if (loadPromise) return loadPromise;
  loadPromise = getSupabase()
    .then((supabase) => supabase
      .from('coa_batches')
      .select('batch_code,sku,product_name,purity,method,lab_name,coa_url,image_url,tested_at,published_at,is_active')
      .eq('is_active', true)
      .order('tested_at', { ascending: false, nullsFirst: false })
      .order('published_at', { ascending: false, nullsFirst: false }))
    .then(({ data, error }) => {
      if (error) throw error;
      applyCoaBatches(data || []);
      return data || [];
    })
    .catch((err) => {
      console.warn('[coa] using local COA fallback:', err?.message || err);
      return [];
    });
  return loadPromise;
}
