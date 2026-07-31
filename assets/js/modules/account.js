import { getSupabase } from '../data/supabase.js';
import { PRODUCTS, getCoaStatusLabel, isPurchasable } from '../data/products.js';
import { money } from '../utils/money.js';
import { byId } from '../utils/dom.js';
import { toast } from './toast.js';

let accountOrders = [];

const STATUS_LABELS = {
  paid: 'Paid',
  processing: 'Processing',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[char]));
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function coaLink(item) {
  const product = PRODUCTS[item.sku];
  if (product?.coaUrl) {
    return `<a href="${product.coaUrl}" target="_blank" rel="noopener">View COA</a>`;
  }
  if (product?.coaLabel) {
    return `<span class="account-item-note">${escapeHtml(product.coaLabel)}</span>`;
  }
  if (product?.coa?.status === 'VERIFIED') {
    return `<span class="account-item-note">${escapeHtml(getCoaStatusLabel(product))}</span>`;
  }
  if (product) {
    return `<span class="account-item-note">${escapeHtml(getCoaStatusLabel(product))}</span>`;
  }
  return '<span class="account-item-note">Batch details unavailable</span>';
}

function canReorder(order) {
  return (order.items || []).some((item) => isPurchasable(PRODUCTS[item.sku]));
}

function reorderOrder(index) {
  const order = accountOrders[index];
  if (!order?.items?.length || typeof window.addSkuQty !== 'function') {
    toast('Reorder unavailable', 'Please shop products directly or contact support.', 'error');
    return;
  }

  const unavailable = [];
  let added = 0;
  order.items.forEach((item) => {
    const sku = String(item.sku || '').toUpperCase();
    const product = PRODUCTS[sku];
    if (!isPurchasable(product)) {
      unavailable.push(item.product_name || sku);
      return;
    }
    window.addSkuQty(sku, Number(item.qty || 1));
    added += 1;
  });

  if (added) {
    byId('cartToggle')?.click();
    toast('Reorder added', unavailable.length
      ? 'Available items were added. Some previous items are not currently available.'
      : 'Your previous items are back in the basket.');
  } else {
    toast('Reorder unavailable', 'None of the items in this order are currently available.', 'error');
  }
}

function orderCard(order, index) {
  const status = STATUS_LABELS[order.status] || order.status || 'Unknown';
  const items = (order.items || []).map((item) => `
    <div class="account-item">
      <div>
        <strong>${escapeHtml(item.product_name)}</strong>
        <span>${escapeHtml(item.sku)} · Qty ${Number(item.qty || 0)}</span>
      </div>
      <div class="account-item-actions">${coaLink(item)}</div>
    </div>
  `).join('');
  return `
    <article class="account-order">
      <div class="account-order-head">
        <div>
          <span class="account-order-label">Order</span>
          <h3>${escapeHtml(order.order_number)}</h3>
        </div>
        <span class="account-status account-status--${escapeHtml(order.status || 'unknown')}">${escapeHtml(status)}</span>
      </div>
      <div class="account-order-meta">
        <span>${formatDate(order.created_at)}</span>
        <span>${money(order.total || 0)}</span>
        ${order.tracking_number ? `<span>Tracking: ${escapeHtml(order.tracking_number)}</span>` : ''}
      </div>
      <div class="account-items">${items || '<p class="account-empty-small">No item details available.</p>'}</div>
      <div class="account-order-actions">
        ${canReorder(order) ? `<button class="btn btn-primary btn-sm account-reorder-btn" type="button" data-reorder="${index}">Reorder</button>` : ''}
        <a class="btn btn-ghost btn-sm" href="/track.html?order=${encodeURIComponent(order.order_number)}">Track order</a>
        ${order.tracking_url ? `<a class="btn btn-ghost btn-sm" href="${order.tracking_url}" target="_blank" rel="noopener">Courier tracking</a>` : ''}
      </div>
    </article>
  `;
}

export async function setupAccountPage() {
  const root = byId('accountRoot');
  if (!root) return;

  const loading = byId('accountLoading');
  const content = byId('accountContent');
  const ordersEl = byId('accountOrders');
  const empty = byId('accountEmpty');
  const emailEl = byId('accountEmail');
  const summaryEl = byId('accountSummary');

  try {
    const supabase = await getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      window.location.href = '/signin.html?redirect=' + encodeURIComponent('/account.html');
      return;
    }

    const res = await fetch('/api/account-orders', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to load account');

    if (emailEl) emailEl.textContent = data.email || session.user.email || '';
    const orders = data.orders || [];
    accountOrders = orders;
    if (summaryEl) {
      const delivered = orders.filter((order) => order.status === 'delivered').length;
      summaryEl.innerHTML = `
        <div><strong>${orders.length}</strong><span>Total orders</span></div>
        <div><strong>${delivered}</strong><span>Delivered</span></div>
        <div><strong>${orders.length ? formatDate(orders[0].created_at) : '—'}</strong><span>Latest order</span></div>
      `;
    }

    if (ordersEl) {
      ordersEl.innerHTML = orders.map(orderCard).join('');
      ordersEl.addEventListener('click', (event) => {
        const button = event.target.closest('[data-reorder]');
        if (!button) return;
        reorderOrder(Number(button.dataset.reorder));
      });
    }
    if (empty) empty.style.display = orders.length ? 'none' : '';
    if (content) content.style.display = '';
  } catch (error) {
    toast('Account error', error.message || 'Unable to load your account.', 'error');
    if (empty) {
      empty.style.display = '';
      empty.innerHTML = '<h2>We could not load your account</h2><p>Please refresh or sign in again.</p><a class="btn btn-primary" href="/signin.html?redirect=%2Faccount.html">Sign in</a>';
    }
  } finally {
    if (loading) loading.style.display = 'none';
  }
}
