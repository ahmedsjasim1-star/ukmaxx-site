const { getSupabaseAdmin } = require('./_lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('products')
      .select('sku,stock_quantity,is_active')
      .order('sku', { ascending: true });

    if (error) throw error;

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json({
      products: (data || []).map((product) => ({
        sku: product.sku,
        stockCount: Number(product.stock_quantity || 0),
        isActive: Boolean(product.is_active),
      })),
    });
  } catch (error) {
    console.error('products-stock-error', { message: error?.message });
    return res.status(500).json({ error: 'Unable to load stock' });
  }
};
