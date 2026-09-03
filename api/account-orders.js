const { getSupabaseAdmin } = require('./_lib/supabase');
const { memberSummary } = require('./_lib/loyalty');

function getBearerToken(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: 'Sign in required' });

    const supabase = getSupabaseAdmin();
    const authResult = await supabase.auth.getUser(token);
    if (authResult.error || !authResult.data?.user?.email) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const email = String(authResult.data.user.email).trim().toLowerCase();
    const metadata = authResult.data.user.user_metadata || {};
    const loyalty = await memberSummary(supabase, authResult.data.user);
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id,order_number,status,created_at,total,currency,tracking_number,tracking_url,dispatched_at,delivered_at')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(25);
    if (error) throw error;

    const orderIds = (orders || []).map((order) => order.id);
    let items = [];
    if (orderIds.length) {
      const itemResult = await supabase
        .from('order_items')
        .select('order_id,sku,product_name,qty,price,line_total')
        .in('order_id', orderIds);
      if (itemResult.error) throw itemResult.error;
      items = itemResult.data || [];
    }

    let allocations = [];
    let batches = [];
    if (orderIds.length) {
      const allocationResult = await supabase
        .from('order_batch_allocations')
        .select('order_id,sku,batch_code,qty')
        .in('order_id', orderIds);
      if (allocationResult.error) throw allocationResult.error;
      allocations = allocationResult.data || [];

      const batchCodes = [...new Set(allocations.map((row) => row.batch_code).filter(Boolean))];
      if (batchCodes.length) {
        const batchResult = await supabase
          .from('coa_batches')
          .select('batch_code,product_name,coa_url,release_status')
          .in('batch_code', batchCodes);
        if (batchResult.error) throw batchResult.error;
        batches = batchResult.data || [];
      }
    }

    const itemsByOrder = new Map();
    items.forEach((item) => {
      if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
      itemsByOrder.get(item.order_id).push({
        sku: item.sku,
        product_name: item.product_name,
        qty: item.qty,
        price: item.price,
        line_total: item.line_total,
      });
    });

    const batchByCode = new Map(batches.map((batch) => [batch.batch_code, batch]));
    const allocationsByOrder = new Map();
    allocations.forEach((allocation) => {
      if (!allocationsByOrder.has(allocation.order_id)) allocationsByOrder.set(allocation.order_id, []);
      const batch = batchByCode.get(allocation.batch_code) || {};
      allocationsByOrder.get(allocation.order_id).push({
        sku: allocation.sku,
        batch_code: allocation.batch_code,
        qty: allocation.qty,
        product_name: batch.product_name || allocation.sku,
        coa_url: batch.coa_url || '',
        release_status: batch.release_status || '',
      });
    });

    return res.status(200).json({
      email,
      first_name: String(metadata.first_name || metadata.given_name || String(metadata.name || '').split(' ')[0] || '').trim(),
      last_name: String(metadata.last_name || '').trim(),
      loyalty,
      orders: (orders || []).map((order) => ({
        order_number: order.order_number,
        status: order.status,
        created_at: order.created_at,
        total: order.total,
        currency: order.currency,
        tracking_number: order.tracking_number,
        tracking_url: order.tracking_url,
        dispatched_at: order.dispatched_at,
        delivered_at: order.delivered_at,
        items: itemsByOrder.get(order.id) || [],
        batches: allocationsByOrder.get(order.id) || [],
      })),
    });
  } catch (error) {
    console.error('account-orders-error', { message: error?.message, stack: error?.stack });
    return res.status(500).json({ error: 'Unable to load account orders' });
  }
};
