import { toast } from './toast.js';
import { getCurrentUser } from './auth.js';
import { PRODUCTS, FREE_SHIPPING_THRESHOLD, FLAT_SHIPPING, PROMO_CODES, CART_KEY, PROMO_KEY, getReleaseLabel, isPurchasable } from '../data/products.js';
import { money } from '../utils/money.js';
import { getStorage, setStorage, getRaw, setRaw, removeStorage } from '../utils/storage.js';
import { $, $$, byId, delegate } from '../utils/dom.js';
import { getSupabase } from '../data/supabase.js';

const SHIP_THRESHOLD = FREE_SHIPPING_THRESHOLD || 100;
const SHIP_FLAT = FLAT_SHIPPING || 4.99;
const PROMOS = PROMO_CODES || { MAXX10: { type: 'percent', value: 0.10, label: '10% off' } };

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
    if (!sku || !PRODUCTS[sku] || !isPurchasable(PRODUCTS[sku]) || !qty) return;
    const maxQty = Math.max(0, Number(PRODUCTS[sku].stockCount || 0));
    map.set(sku, Math.min(maxQty, (map.get(sku) || 0) + qty));
  });
  return [...map.entries()].filter(([, qty]) => qty > 0).map(([sku, qty]) => ({ sku, qty }));
}

function getCart() { return sanitizeCart(getStorage(CART_KEY) || []); }
function setCart(c) { setStorage(CART_KEY, sanitizeCart(c)); }

function getPromoCode() {
  const raw = getRaw(PROMO_KEY) || '';
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') return parsed.trim().toUpperCase();
  } catch {}
  return String(raw).trim().toUpperCase();
}

function cartTotals(c) {
  const sub = c.reduce((a, b) => a + PRODUCTS[b.sku].price * b.qty, 0);
  const code = getPromoCode();
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
  const p = PRODUCTS[s];
  if (!isPurchasable(p)) {
    toast(getReleaseLabel(p), `${p?.name || 'This product'} is awaiting COA before release.`, 'error');
    return;
  }
  const c = getCart();
  const f = c.find(x => x.sku === s);
  const maxQty = Math.max(1, Number(p.stockCount || 1));
  if (f && f.qty >= maxQty) {
    toast('Stock limit reached', `Only ${maxQty} ${p.category === 'bundles' ? 'bundles' : 'available'} right now.`, 'error');
    return;
  }
  if (f) f.qty++; else c.push({ sku: s, qty: 1 });
  setCart(c);
  renderCart();
  if (p) toast('Added to basket', `${p.name} added — review your basket or continue shopping.`);
}

export function addSkuQty(s, qty) {
  const p = PRODUCTS[s];
  if (!isPurchasable(p)) {
    toast(getReleaseLabel(p), `${p?.name || 'This product'} is awaiting COA before release.`, 'error');
    return;
  }
  const num = Math.max(1, Math.min(99, Number(qty) || 1));
  const c = getCart();
  const f = c.find(x => x.sku === s);
  const maxQty = Math.max(1, Number(p.stockCount || 1));
  const nextQty = Math.min(maxQty, (f?.qty || 0) + num);
  if (f) f.qty = nextQty; else c.push({ sku: s, qty: Math.min(maxQty, num) });
  setCart(c);
  renderCart();
  if (p) toast('Added to basket', `${num}× ${p.name} added.`);
}

function chg(s, d) {
  const c = getCart();
  const f = c.find(x => x.sku === s);
  if (!f) return;
  f.qty += d;
  f.qty = Math.min(f.qty, Math.max(1, Number(PRODUCTS[s]?.stockCount || 1)));
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
  const c = getCart();
  if (!c.length) { toast('Basket empty', 'Add products to begin checkout.', 'error'); return; }
  prefillCheckoutFields();
  const m = byId('checkoutBackdrop');
  if (!m) {
    toast('Checkout unavailable', 'Please open the shop page and try checkout again.', 'error');
    return;
  }
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

function checkoutValue(id) {
  return String(byId(id)?.value || '').trim();
}

function setCheckoutValue(id, value) {
  const el = byId(id);
  if (el && !el.value) el.value = value || '';
}

function prefillCheckoutFields() {
  const user = getCurrentUser();
  if (!user) return;
  const first = user.user_metadata?.first_name || '';
  const last = user.user_metadata?.last_name || '';
  setCheckoutValue('checkoutEmail', user.email || '');
  setCheckoutValue('checkoutFullName', `${first} ${last}`.trim());
}

function collectCheckoutDetails() {
  const details = {
    email: checkoutValue('checkoutEmail').toLowerCase(),
    fullName: checkoutValue('checkoutFullName'),
    phone: checkoutValue('checkoutPhone'),
    address: {
      line1: checkoutValue('checkoutAddress1'),
      line2: checkoutValue('checkoutAddress2'),
      city: checkoutValue('checkoutCity'),
      postcode: checkoutValue('checkoutPostcode').toUpperCase(),
      country: 'GB',
    },
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) throw new Error('Please enter a valid email address.');
  if (details.fullName.length < 2) throw new Error('Please enter your full name.');
  if (details.address.line1.length < 3) throw new Error('Please enter address line 1.');
  if (details.address.city.length < 2) throw new Error('Please enter your town or city.');
  if (details.address.postcode.length < 4) throw new Error('Please enter a valid postcode.');
  return details;
}

async function startCheckout() {
  const c = getCart();
  if (!c.length) { toast('Basket empty', 'Add products to begin checkout.', 'error'); return; }
  const promoCode = getPromoCode();
  const err = byId('checkoutError');
  const payBtn = byId('payBtn');
  if (err) { err.classList.remove('is-shown'); err.textContent = ''; }
  const label = payBtn?.querySelector('.payBtnLabel');
  try {
    const details = collectCheckoutDetails();
    if (payBtn) { payBtn.disabled = true; if (label) label.textContent = 'Processing…'; }
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 15000);
    const supabase = await getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    const guestCheckoutIdKey = 'ukmaxx_guest_checkout_id';
    let guestCheckoutId = localStorage.getItem(guestCheckoutIdKey);
    if (!guestCheckoutId) {
      guestCheckoutId = (crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(16).slice(2));
      localStorage.setItem(guestCheckoutIdKey, guestCheckoutId);
    }
    const headers = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const res = await fetch('/api/create-fena-payment', {
      method: 'POST',
      headers,
      body: JSON.stringify({ cartItems: c, promoOptIn: false, promoCode, guestCheckoutId, ...details }),
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
      err.textContent = e?.name === 'AbortError' ? 'Payment request timed out. Please try again.' : (e?.message || 'Unable to start payment. Network error.');
      err.classList.add('is-shown');
    }
  } finally {
    if (payBtn) { payBtn.disabled = false; if (label) label.textContent = 'Continue to Pay by Bank'; }
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
    const originalHtml = btn.dataset.originalHtml || btn.innerHTML;
    btn.dataset.originalHtml = originalHtml;
    const qtyInput = btn.dataset.qtyInput ? byId(btn.dataset.qtyInput) : null;
    if (qtyInput) addSkuQty(sku, qtyInput.value);
    else addSku(sku);
    btn.classList.add('is-adding');
    btn.textContent = '✓ Added';
    setTimeout(() => {
      btn.classList.remove('is-adding');
      btn.innerHTML = btn.dataset.originalHtml || originalHtml;
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
      setRaw(PROMO_KEY, code);
      if (msg) { msg.textContent = `${code} applied — ${PROMOS[code].label}`; msg.classList.add('is-success'); }
      toast('Promo applied', `${code}: ${PROMOS[code].label}`);
    } else {
      removeStorage(PROMO_KEY);
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
  const paymentReturn = params.get('payment');
  const fenaStatus = String(params.get('status') || '').trim().toLowerCase();
  const fenaSuccess = paymentReturn === 'fena-return' && fenaStatus === 'paid';
  const fenaFailed = paymentReturn === 'fena-return' && ['rejected', 'cancelled', 'overdue', 'refund rejected'].includes(fenaStatus);

  if (paymentReturn === 'success' || fenaSuccess) {
    setCart([]);
    renderCart();
    const sm = byId('successModal');
    const ref = byId('orderRef');
    const returnedRef = params.get('order_id') || params.get('reference') || '';
    if (ref) ref.textContent = returnedRef ? `Order Reference: ${returnedRef}` : `Order Reference: ${orderRef()}`;
    if (sm) { sm.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
    byId('backToShop')?.addEventListener('click', () => {
      if (sm) sm.style.display = 'none';
      document.body.style.overflow = '';
      history.replaceState({}, '', location.pathname);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  } else if (fenaFailed) {
    toast('Payment unsuccessful', 'Your bank payment was not completed. Your basket has been saved so you can try again.', 'error');
    history.replaceState({}, '', location.pathname);
  } else if (paymentReturn === 'fena-return') {
    toast('Payment not completed', 'Your basket has been saved. Please try again or contact support if money has left your account.', 'error');
    history.replaceState({}, '', location.pathname);
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
