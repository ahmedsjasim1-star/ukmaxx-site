// Presentation groups sit alongside the existing SKU-based checkout payload.
export function projectBundles(cart, saved = []) {
  const pool = new Map(cart.map(i => [i.sku, Math.min(i.qty, i.bundleQty || 0)]));
  let water = cart.find(i => i.sku === 'WA10')?.qty || 0;
  const groups = [];
  const take = (group) => {
    if (!water || !Array.isArray(group.selection) || group.selection.length !== 3) return false;
    const need = new Map();
    group.selection.forEach(s => need.set(s, (need.get(s) || 0) + 1));
    if ([...need].some(([s, q]) => (pool.get(s) || 0) < q)) return false;
    need.forEach((q, s) => pool.set(s, pool.get(s) - q));
    water--;
    groups.push({ id: group.id, selection: [...group.selection] });
    return true;
  };
  for (const g of Array.isArray(saved) ? saved : []) {
    if (typeof g?.id === 'string' && /^[a-zA-Z0-9-]+$/.test(g.id) && !groups.some(x => x.id === g.id)) take(g);
  }
  // Older baskets have quantities but no selection IDs: recover complete groups.
  let index = 0;
  while (water) {
    const selection = [...pool].flatMap(([s, q]) => Array(Math.max(0, Math.floor(q))).fill(s)).slice(0, 3);
    if (selection.length < 3) break;
    let id;
    do { id = 'legacy-' + index++; } while (groups.some(g => g.id === id));
    take({ id, selection });
  }
  const used = new Map();
  for (const g of groups) for (const s of [...g.selection, 'WA10']) used.set(s, (used.get(s) || 0) + 1);
  const singles = cart.map(i => ({ ...i, qty: i.qty - (used.get(i.sku) || 0), bundleQty: 0 })).filter(i => i.qty > 0);
  return { groups, singles };
}
export function subtractBundle(cart, group) {
  const need = new Map();
  for (const s of [...group.selection, 'WA10']) need.set(s, (need.get(s) || 0) + 1);
  return cart.map(i => {
    const n = need.get(i.sku) || 0;
    return { ...i, qty: i.qty - n, bundleQty: Math.max(0, (i.bundleQty || 0) - (i.sku === 'WA10' ? 0 : n)) };
  }).filter(i => i.qty > 0);
}
export function bundlePrice(selection, products) {
  return selection.reduce((pence, sku) => {
    const unit = Math.round(products[sku].price * 100);
    return pence + unit - Math.round(unit * .05);
  }, 0) / 100;
}
