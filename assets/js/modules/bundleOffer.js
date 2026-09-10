// Pure quote: never mutate the basket until the customer confirms.
export function quoteBundle(cart, selection, products, eligible, components) {
  if (selection.length !== 3 || selection.some(s => !eligible.includes(s))) return null;
  const need = {};
  selection.forEach(s => { need[s] = (need[s] || 0) + 1; });
  if (Object.entries(need).some(([s, q]) => q > ((cart.find(i => i.sku === s)?.qty || 0) - (cart.find(i => i.sku === s)?.bundleQty || 0)))) return null;
  const regular = selection.reduce((n, s) => n + Math.round(products[s].price * 100), 0);
  let price = selection.reduce((n, s) => { const p = Math.round(products[s].price * 100); return n + p - Math.round(p * .05); }, 0);
  let fixedSku = '';
  for (const [sku, parts] of Object.entries(components)) {
    if (parts.WA10 !== 1 || !products[sku] || products[sku].stockCount < 1) continue;
    const peptideParts = Object.entries(parts).filter(([s]) => s !== 'WA10');
    if (peptideParts.length === Object.keys(need).length && peptideParts.every(([s,q]) => need[s] === q)) {
      const fixedPrice = Math.round(products[sku].price * 100);
      if (fixedPrice <= price) { fixedSku = sku; price = fixedPrice; }
    }
  }
  const next = cart.map(i => ({ ...i }));
  if (fixedSku) {
    next.forEach(i => { i.qty -= need[i.sku] || 0; });
    const existing = next.find(i => i.sku === fixedSku);
    if (existing) existing.qty++; else next.push({ sku: fixedSku, qty: 1 });
  } else {
    next.forEach(i => { if (need[i.sku]) i.bundleQty = (i.bundleQty || 0) + need[i.sku]; });
    const water = next.find(i => i.sku === 'WA10');
    if (water) water.qty++; else next.push({ sku: 'WA10', qty: 1 });
  }
  // Include existing fixed bundles and paid water in the stock requirement.
  const stock = {};
  next.forEach(i => Object.entries(components[i.sku] || { [i.sku]: 1 }).forEach(([s,q]) => { stock[s] = (stock[s] || 0) + q * i.qty; }));
  if (Object.entries(stock).some(([s,q]) => !products[s] || q > Number(products[s].stockCount || 0))) return null;
  return { cart: next.filter(i => i.qty > 0), fixedSku, selection: [...selection], price: price / 100, saving: (regular - price) / 100 };
}
