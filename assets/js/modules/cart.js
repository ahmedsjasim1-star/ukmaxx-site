import { toast } from './toast.js';
import { requireAuth, getCurrentUser } from './auth.js';
import { PRODUCTS, FREE_SHIPPING_THRESHOLD, FLAT_SHIPPING, PROMO_CODES, CART_KEY, PROMO_KEY } from '../data/products.js';
import { money } from '../utils/money.js';
import { getStorage, setStorage, getRaw } from '../utils/storage.js';
import { $, $$, byId, delegate } from '../utils/dom.js';

const SHIP_THRESHOLD = FREE_SHIPPING_THRESHOLD || 100;
const SHIP_FLAT = FLAT_SHIPPING || 4.99;
const PROMOS = PROMO_CODES || { MAXX15: { type: 'percent', value: 0.15, label: '15% off' } };

function normalizeSku(raw = '') {
  const t = String(raw).trim();
  const key = t.split('-')[0].trim().toUpperCase();
  if (key.startsWith('RT10X3')) return 'RT10X3';
  if (key.startsWith('RT10')) return 'RT10';
  if (key.startsWith('BC5')) return 'BC5';
  if (key.startsWith('IP5')) return 'IP5';
  if (key.startsWith('NJ500')) return 'NJ500';
  if (key.startsWith('WA10')) return 'WA10';
  return key;
}

function sanitizeCart(arr = []) {
  const map = new Map();
  (Array.isArray(arr) ? arr : []).forEach(i => {
    const sku = normalizeSku(i?.sku || '');
    const qty = Math.max(0, Number(i?.qty || 0));
    if (!sku || !PRODUCTS[sku] || !qty) return;
    map.set(sku, (map.get(sku) || 0) + qty);
  });
  return [...map.entries()].map(([sku, qty]) => ({ sku, qty }));
}

function getCart() { return sanitizeCart(getStorage(CART_KEY) || []); }
function setCart(c) { setStorage(CART_KEY, sanitizeCart(c)); }

function cartTotals(c) {
  const sub = c.reduce((a, b) => a + PRODUCTS[b.sku].price * b.qty, 0);
  const code = (getRaw(PROMO_KEY) || '').toUpperCase();
  const promo = PROMOS[code];
  const discount = promo ? (promo.type === 'percent' ? sub * promo.value : promo.value) : 0;
  const discounted = sub - discount;
  const ship = !c.length ? 0 : (discounted >= SHIP_THRESHOLD ? 0 : SHIP_FLAT);
  const tot = discounted + ship;
  return { sub, discount, discounted, ship, tot, code, promo };
}

export function renderCart() {
  const c = getCart();
  const count = c.reduce((a, b) => a + b.qty, 0);
  ['cartCount', 'cartCountHeader', 'cartCountMobile'].forEach(id => {
    const el = byId(id);
    if (!el) return;
    el.textContent = String(count);
    el.classList.toggle('is-empty', count === 0);
  });
  const t = cartTotals(c);
  const progressEl = byId('shippingProgress');
  const fillEl = byId('shippingFill');
  const labelEl = byId('shippingLabel');
  if (progressEl && fillEl && labelEl) {
    const pct = Math.min(100, Math.round((t.discounted / SHIP_THRESHOLD) * 100));
    fillEl.style.width = pct + '%';
    if (t.discounted >= SHIP_THRESHOLD || c.length === 0) {
      progressEl.classList.add('is-met');
      labelEl.classList.add('is-met');
      const lblSpan = labelEl.querySelector('span');
      if (lblSpan) lblSpan.innerHTML = c.length === 0
        ? `Add <strong>${money(SHIP_THRESHOLD)}</strong> more for free UK delivery`
        : `<strong>You've unlocked free UK delivery ✓</strong>`;
    } else {
      progressEl.classList.remove('is-met');
      labelEl.classList.remove('is-met');
      const remaining = SHIP_THRESHOLD - t.discounted;
      const lblSpan = labelEl.querySelector('span');
      if (lblSpan) lblSpan.innerHTML = `Add <strong>${money(remaining)}</strong> more for free UK delivery`;
    }
  }
  const itemsEl = byId('cartItems');
  const footEl = byId('cartFoot');
  if (!itemsEl) return;
  if (!c.length) {
    itemsEl.innerHTML = `<div class="cart-empty">
      <div class="cart-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/><path d="M2 3h3l2.4 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L21 7H6"/></svg></div>
      <div class="cart-empty-title">Your basket is empty</div>
      <div class="cart-empty-body">Add products to begin secure checkout. Free UK delivery on orders over ${money(SHIP_THRESHOLD)}.</div>
      <button class="btn btn-dark" id="continueShoppingBtn">Continue shopping</button>
    </div>`;
    if (footEl) footEl.style.display = 'none';
    return;
  }
  if (footEl) footEl.style.display = '';
  itemsEl.innerHTML = c.map(i => {
    const p = PRODUCTS[i.sku];
    return `<div class="cart-item">
      <img class="cart-thumb" src="${p.image}" alt="${p.name}">
      <div class="cart-item-info">
        <div class="cart-item-name">${p.name}</div>
        <div class="cart-item-meta">${p.id} · ${p.purity}</div>
        <div class="cart-item-bottom">
          <div class="qty-control" role="group" aria-label="Quantity for ${p.name}">
            <button class="qty-btn" aria-label="Decrease quantity" data-a="dec" data-sku="${i.sku}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg></button>
            <span class="qty-value">${i.qty}</span>
            <button class="qty-btn" aria-label="Increase quantity" data-a="inc" data-sku="${i.sku}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
          </div>
          <div class="cart-item-price">${money(p.price * i.qty)}</div>
        </div>
        <button class="cart-item-remove" data-a="rm" data-sku="${i.sku}">Remove</button>
      </div>
    </div>`;
  }).join('');
  const peptideSkus = ['RT10', 'BC5', 'IP5', 'NJ500'];
  const hasPeptide = c.some(i => peptideSkus.includes(i.sku));
  const hasBac = c.some(i => i.sku === 'WA10');
  if (hasPeptide && !hasBac) {
    const bac = PRODUCTS.WA10;
    itemsEl.insertAdjacentHTML('beforeend', `<div class="cart-upsell">
      <img class="cart-upsell-img" src="${bac.image}" alt="${bac.name}">
      <div class="cart-upsell-text">Customers buying <strong>peptides</strong> usually add <strong>${bac.name}</strong> for reconstitution.</div>
      <button class="cart-upsell-btn" data-upsell-bac>Add</button>
    </div>`);
  }
  const totalsEl = byId('cartTotals');
  if (totalsEl) {
    totalsEl.innerHTML = `
      <div class="cart-totals-row"><span>Subtotal</span><span>${money(t.sub)}</span></div>
      ${t.promo ? `<div class="cart-totals-row is-discount"><span>Discount (${t.code})</span><span>-${money(t.discount)}</span></div>` : ''}
      <div class="cart-totals-row"><span>Shipping</span><span>${t.ship === 0 ? '<strong style="color:var(--success)">FREE</strong>' : money(t.ship)}</span></div>
      <div class="cart-totals-row is-total"><span>Total</span><span>${money(t.tot)}</span></div>`;
  }
  renderCheckoutSummary();
}

function renderCheckoutSummary() {
  const c = getCart();
  const t = cartTotals(c);
  const itemsEl = byId('checkoutSummaryItems');
  const sumsEl = byId('checkoutSummary');
  if (itemsEl) {
    itemsEl.innerHTML = c.map(i => {
      const p = PRODUCTS[i.sku];
      return `<div class="checkout-summary-item">
        <img src="${p.image}" alt="${p.name}">
        <div class="checkout-summary-item-info">
          <div class="checkout-summary-item-name">${p.name}</div>
          <div class="checkout-summary-item-qty">× ${i.qty}</div>
        </div>
        <div class="checkout-summary-item-price">${money(p.price * i.qty)}</div>
      </div>`;
    }).join('');
  }
  if (sumsEl) {
    sumsEl.innerHTML = `
      <div class="checkout-totals-row"><span>Subtotal</span><span>${money(t.sub)}</span></div>
      ${t.promo ? `<div class="checkout-totals-row is-discount"><span>Discount (${t.code})</span><span>-${money(t.discount)}</span></div>` : ''}
      <div class="checkout-totals-row"><span>Shipping</span><span>${t.ship === 0 ? '<strong style="color:var(--success)">FREE</strong>' : money(t.ship)}</span></div>
      <div class="checkout-totals-row is-total"><span>Total</span><span>${money(t.tot)}</span></div>`;
  }
}

export function addSku(s) {
  const c = getCart();
  const f = c.find(x => x.sku === s);
  if (f) f.qty++; else c.push({ sku: s, qty: 1 });
  setCart(c);
  renderCart();
  const p = PRODUCTS[s];
  if (p) toast('Added to basket', `${p.name} added — review your basket or continue shopping.`);
}

export function addSkuQty(s, qty) {
  const num = Math.max(1, Math.min(99, Number(qty) || 1));
  const c = getCart();
  const f = c.find(x => x.sku === s);
  if (f) f.qty += num; else c.push({ sku: s, qty: num });
  setCart(c);
  renderCart();
  const p = PRODUCTS[s];
  if (p) toast('Added to basket', `${num}× ${p.name} added.`);
}

function chg(s, d) {
  const c = getCart();
  const f = c.find(x => x.sku === s);
  if (!f) return;
  f.qty += d;
  if (f.qty <= 0) c.splice(c.indexOf(f), 1);
  setCart(c);
  renderCart();
}

function rmv(s) {
  const p = PRODUCTS[s];
  setCart(getCart().filter(x => x.sku !== s));
  renderCart();
  if (p) toast('Removed from basket', p.name);
}

export async function openCheckout() {
  if (!(await requireAuth())) return;
  const c = getCart();
  if (!c.length) { toast('Basket empty', 'Add products to begin checkout.', 'error'); return; }
  const m = byId('checkoutBackdrop');
  m.classList.add('is-open');
  m.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  renderCheckoutSummary();
}

export function closeCheckout() {
  const m = byId('checkoutBackdrop');
  m.classList.remove('is-open');
  m.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

async function startCheckout() {
  const c = getCart();
  if (!c.length) { toast('Basket empty', 'Add products to begin checkout.', 'error'); return; }
  const user = getCurrentUser();
  const email = user?.email || '';
  const fullName = (user?.user_metadata?.first_name || '') + ' ' + (user?.user_metadata?.last_name || '');
  const promoCode = (getRaw(PROMO_KEY) || '').toUpperCase();
  const err = byId('checkoutError');
  const payBtn = byId('payBtn');
  if (err) { err.classList.remove('is-shown'); err.textContent = ''; }
  const label = payBtn?.querySelector('.payBtnLabel');
  try {
    if (payBtn) { payBtn.disabled = true; if (label) label.textContent = 'Processing…'; }
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 15000);
    const res = await fetch('/api/create-checkout-session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cartItems: c, email, fullName, promoOptIn: false, promoCode, address: {} }),
      signal: controller.signal
    });
    clearTimeout(to);
    const raw = await res.text();
    let data = {}; try { data = JSON.parse(raw); } catch { data = {}; }
    if (!res.ok || !data.url) {
      if (err) { err.textContent = data.error || 'Unable to start payment. Please try again.'; err.classList.add('is-shown'); }
      return;
    }
    window.location.href = data.url;
  } catch (e) {
    if (err) {
      err.textContent = e?.name === 'AbortError' ? 'Payment request timed out. Please try again.' : 'Unable to start payment. Network error.';
      err.classList.add('is-shown');
    }
  } finally {
    if (payBtn) { payBtn.disabled = false; if (label) label.textContent = 'Continue to payment'; }
  }
}

function orderRef() {
  const y = new Date().getFullYear();
  return `UKX-${y}-${String(Math.floor(1000 + Math.random() * 9000))}`;
}

export function initCart() {
  delegate(document.body, '[data-add]', 'click', (e, btn) => {
    e.stopPropagation();
    const sku = btn.dataset.add;
    addSku(sku);
    btn.classList.add('is-adding');
    btn.textContent = '✓ Added';
    setTimeout(() => {
      btn.classList.remove('is-adding');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg> Add';
    }, 1400);
  });

  delegate(document.body, '.product-card', 'click', (e, card) => {
    if (e.target.closest('[data-add]') || e.target.closest('.product-name a')) return;
    location.href = `./product.html?sku=${card.dataset.sku}`;
  });

  delegate(document.body, '.qty-btn', 'click', (e, btn) => {
    const sku = btn.dataset.sku;
    const a = btn.dataset.a;
    if (a === 'inc') chg(sku, 1);
    if (a === 'dec') chg(sku, -1);
  });

  delegate(document.body, '.cart-item-remove', 'click', (e, btn) => rmv(btn.dataset.sku));
  delegate(document.body, '[data-upsell-bac]', 'click', () => addSku('WA10'));

  byId('cartToggle')?.addEventListener('click', () => {
    byId('cartDrawer').classList.add('is-open');
    byId('cartBackdrop').classList.add('is-open');
    byId('cartDrawer').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  });

  byId('mobileCartBtn')?.addEventListener('click', () => byId('cartToggle')?.click());

  const closeCart = () => {
    byId('cartDrawer').classList.remove('is-open');
    byId('cartBackdrop').classList.remove('is-open');
    byId('cartDrawer').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };
  byId('cartClose')?.addEventListener('click', closeCart);
  byId('cartBackdrop')?.addEventListener('click', closeCart);

  byId('checkoutBtn')?.addEventListener('click', () => {
    closeCart();
    setTimeout(openCheckout, 200);
  });

  byId('checkoutClose')?.addEventListener('click', closeCheckout);
  byId('checkoutBack1')?.addEventListener('click', closeCheckout);

  byId('payBtn')?.addEventListener('click', startCheckout);

  byId('applyPromoBtn')?.addEventListener('click', () => {
    const input = byId('promoCode');
    const msg = byId('promoMsg');
    const code = (input?.value || '').trim().toUpperCase();
    if (PROMOS[code]) {
      setStorage(PROMO_KEY, code);
      if (msg) { msg.textContent = `${code} applied — ${PROMOS[code].label}`; msg.classList.add('is-success'); }
      toast('Promo applied', `${code}: ${PROMOS[code].label}`);
    } else {
      setStorage(PROMO_KEY, null);
      if (msg) { msg.textContent = code ? 'Invalid promo code.' : 'Promo removed.'; msg.classList.remove('is-success'); }
      if (code) toast('Invalid code', 'That promo code is not recognised.', 'error');
    }
    renderCart();
  });

  byId('promoCode')?.addEventListener('input', () => {
    const msg = byId('promoMsg');
    if (msg) { msg.textContent = ''; msg.classList.remove('is-success'); }
  });

  const params = new URLSearchParams(location.search);
  if (params.get('payment') === 'success') {
    setCart([]);
    renderCart();
    const sm = byId('successModal');
    const ref = byId('orderRef');
    if (ref) ref.textContent = `Order Reference: ${orderRef()}`;
    if (sm) { sm.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
    byId('backToShop')?.addEventListener('click', () => {
      if (sm) sm.style.display = 'none';
      document.body.style.overflow = '';
      history.replaceState({}, '', location.pathname);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  } else if (params.get('payment') === 'cancelled') {
    toast('Payment cancelled', 'Your basket has been saved - try again whenever you are ready.');
    history.replaceState({}, '', location.pathname);
  }

  byId('continueShoppingBtn')?.addEventListener('click', () => {
    byId('cartClose')?.click();
    byId('products')?.scrollIntoView({ behavior: 'smooth' });
  });
}

window.renderCart = renderCart;
window.addSku = addSku;
window.addSkuQty = addSkuQty;
window.openCheckout = openCheckout;
