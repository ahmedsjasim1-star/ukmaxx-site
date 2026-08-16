import { COA, EXIT_KEY, PRODUCTS } from '../data/products.js?v=20260815-fast-products';
import { getSupabase } from '../data/supabase.js';
import { toast } from './toast.js';
import { setRaw } from '../utils/storage.js';

function byId(id) {
  return document.getElementById(id);
}

function isCompoundSku(sku) {
  return Boolean(PRODUCTS[sku] && PRODUCTS[sku].category !== 'support');
}

function localStats() {
  const records = Object.values(COA).filter((record) => isCompoundSku(record.sku));
  const active = records.filter((record) => {
    const product = PRODUCTS[record.sku];
    const available = Number(record.batchSize ?? product?.stockCount ?? 0) > 0;
    return record.status === 'VERIFIED' && product?.stock === 'in_stock' && available;
  });
  const rejected = records.filter((record) => record.status === 'REJECTED');
  const testedProducts = new Set(records.filter((record) => record.status === 'VERIFIED' || record.status === 'REJECTED').map((record) => record.sku));
  const certificates = records.filter((record) => Boolean(record.url));

  return {
    active: active.length,
    tested: testedProducts.size,
    rejected: rejected.length,
    certificates: certificates.length,
  };
}

function renderStats(stats) {
  if (!stats) return;
  if (byId('homeActiveBatches')) byId('homeActiveBatches').textContent = String(stats.active);
  if (byId('homeProductsTested')) byId('homeProductsTested').textContent = String(stats.tested);
  if (byId('homeRejectedBatches')) byId('homeRejectedBatches').textContent = String(stats.rejected);
  if (byId('homeCertificates')) byId('homeCertificates').textContent = String(stats.certificates);
}

async function refreshLiveStats() {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('coa_batches')
      .select('sku,published_at,is_active,batch_size,sold_count,archived_at,release_status,coa_url')
      .not('published_at', 'is', null);
    if (error) throw error;

    const records = (data || []).filter((row) => isCompoundSku(row.sku) && Number(row.batch_size || 0) > 0);
    if (!records.length) return;

    const rejected = records.filter((row) => String(row.release_status || '').toLowerCase() === 'rejected');
    const active = records.filter((row) => {
      const isRejected = String(row.release_status || '').toLowerCase() === 'rejected';
      const remaining = Number(row.batch_size || 0) - Number(row.sold_count || 0);
      return !isRejected && row.is_active !== false && !row.archived_at && remaining > 0;
    });
    const testedProducts = new Set(records.map((row) => row.sku));
    const certificates = records.filter((row) => Boolean(row.coa_url));

    renderStats({
      active: active.length,
      tested: testedProducts.size,
      rejected: rejected.length,
      certificates: certificates.length,
    });
  } catch (error) {
    console.warn('home-batch-stats-fallback', error?.message || error);
  }
}

function setupInlineBatchAlerts() {
  const form = byId('homeAlertForm');
  const input = byId('homeAlertEmail');
  if (!form || !input) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = input.value.trim();
    if (!email) return;

    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const response = await fetch('/api/subscribe-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, topics: ['restock', 'batch_updates'], hp: '' }),
      });
      if (!response.ok) throw new Error('subscribe_failed');
      input.value = '';
      setRaw(EXIT_KEY, '1');
      toast('You’re on the list', 'We’ll email important stock, COA and batch-release updates.');
    } catch {
      toast('Try again', 'Unable to subscribe. Please try again later.', 'error');
    } finally {
      if (button) button.disabled = false;
    }
  });
}

export function setupHomeProof() {
  if (!byId('homeBatchStats') && !byId('homeAlertForm')) return;
  renderStats(localStats());
  refreshLiveStats();
  setupInlineBatchAlerts();
}
