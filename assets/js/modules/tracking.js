import { toast } from './toast.js';
import { byId } from '../utils/dom.js';
import { getCurrentUser } from './auth.js';

const STATUS_ORDER = ['paid', 'processing', 'dispatched', 'delivered'];
const STATUS_LABELS = { paid: 'Paid', processing: 'Processing', dispatched: 'Dispatched', delivered: 'Delivered', cancelled: 'Cancelled', refunded: 'Refunded' };

export function setupTracking() {
  const params = new URLSearchParams(location.search);
  const prefillOrder = params.get('order') || '';
  if (prefillOrder) {
    const el = byId('orderNumber');
    if (el) el.value = prefillOrder;
  }

  byId('trackForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ref = byId('orderNumber')?.value.trim();
    const user = getCurrentUser();
    const email = user?.email || '';
    const result = byId('trackResult');
    if (!ref) { toast('Missing order number', 'Please enter your order number.', 'error'); return; }
    if (!email) { toast('Sign in required', 'Please sign in to track your orders.', 'error'); return; }
    if (result) {
      result.style.display = 'none';
      result.classList.remove('is-shown');
    }
    const submitBtn = byId('trackSubmit');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Looking up…'; }
    try {
      const res = await fetch('/api/track-order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: ref, email })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.order) {
        toast('Order not found', 'Check your order number and email and try again.', 'error');
        return;
      }
      renderOrder(data.order);
    } catch {
      toast('Network error', 'Please try again.', 'error');
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg> Track my order'; }
    }
  });
}

function renderOrder(o) {
  const result = byId('trackResult');
  if (!result) return;

  byId('resOrder').textContent = o.order_number || '—';
  byId('resStatusShort').textContent = STATUS_LABELS[o.status] || o.status || 'Unknown';
  byId('resCarrier').textContent = o.carrier || '—';
  byId('resTracking').textContent = o.tracking_number || '—';
  byId('resSubtotal').textContent = `£${Number(o.subtotal || 0).toFixed(2)}`;
  byId('resShipping').textContent = Number(o.shipping || 0) === 0 ? 'Free' : `£${Number(o.shipping).toFixed(2)}`;
  byId('resTotal').textContent = `£${Number(o.total || 0).toFixed(2)}`;

  const statusBar = byId('resStatusBar');
  if (statusBar) {
    const label = STATUS_LABELS[o.status] || o.status || 'Unknown';
    const ts = o.delivered_at || o.dispatched_at || o.created_at || null;
    const dateStr = ts ? new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    statusBar.innerHTML = `<span class="result-status result-status--${o.status || 'unknown'}">${label}</span>${dateStr ? `<span class="result-date">${dateStr}</span>` : ''}`;
  }

  const timeline = byId('timeline');
  if (timeline) {
    const items = timeline.querySelectorAll('.timeline-item');
    const statusIdx = STATUS_ORDER.indexOf(o.status);
    items.forEach((item, i) => {
      item.className = 'timeline-item';
      if (o.status === 'cancelled' || o.status === 'refunded') {
        if (i <= statusIdx) { item.classList.add('is-done'); }
        else { item.classList.add('is-cancelled'); }
      } else if (i < statusIdx) {
        item.classList.add('is-done');
      } else if (i === statusIdx) {
        item.classList.add('is-active');
      } else {
        item.classList.add('is-future');
      }
    });
  }

  const itemsContainer = result.querySelector('.result-items');
  if (itemsContainer && o.items) {
    itemsContainer.innerHTML = o.items.map(i => `
      <div class="result-item">
        <img class="result-item-img" src="${i.image_url || './images/placeholder.jpg'}" alt="${i.product_name}">
        <div class="result-item-info">
          <div class="result-item-name">${i.product_name}</div>
          <div class="result-item-meta">${i.sku} · Qty ${i.qty}</div>
        </div>
        <div class="result-item-price">£${Number(i.line_total).toFixed(2)}</div>
      </div>
    `).join('');
  }

  const userEl = byId('resUser');
  if (userEl) {
    const parts = [o.full_name, o.shipping_address_line1, o.shipping_address_line2, o.shipping_city, o.shipping_postcode].filter(Boolean);
    userEl.textContent = parts.join(', ');
  }

  result.style.display = '';
  result.classList.add('is-shown');
}
