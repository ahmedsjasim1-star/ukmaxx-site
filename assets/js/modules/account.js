import { getSupabase } from '../data/supabase.js';
import { PRODUCTS, isPurchasable } from '../data/products.js';
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

const REWARD_STEPS = [
  { step: 1, short: 'Joined', title: 'Loyalty card unlocked' },
  { step: 2, short: '£5 credit', title: '£5 credit' },
  { step: 3, short: 'Free BAC', title: 'Free 10ml BAC Water' },
  { step: 4, short: '£10 credit', title: '£10 credit' },
  { step: 5, short: '20% off', title: '20% off · maximum £25' },
  { step: 6, short: 'Free vial', title: 'One free vial up to £29.99' },
  { step: 7, short: '£20 credit', title: '£20 credit' },
  { step: 8, short: 'BAC + vial', title: 'Free BAC Water + one vial up to £29.99' },
  { step: 9, short: '30% off', title: '30% off · maximum £50' },
  { step: 10, short: 'Any vial', title: 'Any one single vial free · delivery applies' },
];

const CARD_LEVELS = ['Teal', 'Copper', 'Violet', 'Onyx', 'Gold'];

function loyaltyState(completedOrders) {
  const completed = Math.max(0, Number(completedOrders || 0));
  const cycleIndex = Math.floor(completed / 10);
  const exactCycleEnd = completed > 0 && completed % 10 === 0;
  const progress = exactCycleEnd ? 10 : completed % 10;
  return {
    cycle: exactCycleEnd ? cycleIndex : cycleIndex + 1,
    level: CARD_LEVELS[Math.min(exactCycleEnd ? cycleIndex - 1 : cycleIndex, CARD_LEVELS.length - 1)],
    progress,
  };
}

function renderLoyalty(data) {
  const root = byId('loyaltySection');
  if (!root) return;
  if (!data.loyalty?.enabled) {
    root.hidden = true;
    root.innerHTML = '';
    return;
  }
  root.hidden = false;
  const deliveredOrders = (data.orders || []).filter((order) => order.status === 'delivered').length;
  const completedOrders = Number(data.loyalty?.completed_orders ?? deliveredOrders);
  const state = loyaltyState(completedOrders);
  const firstName = escapeHtml(data.first_name || 'Member');
  const nextReward = REWARD_STEPS[Math.min(state.progress, 9)];
  const currentReward = state.progress ? REWARD_STEPS[state.progress - 1] : null;
  const availableRewards = (data.loyalty?.rewards || []).filter((reward) => reward.status === 'available');
  const rewardWallet = availableRewards.length ? `
    <div class="loyalty-wallet">
      <div><span class="section-eyebrow">Available rewards</span><strong>${availableRewards.length} ready to use</strong></div>
      <div class="loyalty-wallet-list">${availableRewards.map((reward) => `<span>${escapeHtml(reward.label)}</span>`).join('')}</div>
      <a class="btn btn-primary btn-sm" href="/catalogue.html">Choose products</a>
    </div>` : '';
  const stamps = REWARD_STEPS.map((reward) => {
    const complete = reward.step <= state.progress;
    const next = reward.step === state.progress + 1;
    const latest = reward.step === state.progress;
    return `
      <li class="loyalty-stamp${complete ? ' is-complete' : ''}${next ? ' is-next' : ''}${latest ? ' is-latest' : ''}" title="${escapeHtml(reward.title)}">
        <span class="loyalty-stamp-number">${reward.step}</span>
        ${complete ? '<span class="loyalty-stamp-check" aria-hidden="true">✓</span>' : ''}
        <strong>${escapeHtml(reward.short)}</strong>
      </li>`;
  }).join('');

  root.innerHTML = `
    <div class="loyalty-card loyalty-card--${state.level.toLowerCase()}">
      <div class="loyalty-card-watermark" aria-hidden="true"></div>
      <div class="loyalty-card-head">
        <div>
          <span class="loyalty-eyebrow">UKMAXX Rewards</span>
          <h2 id="loyaltyTitle">${firstName}'s ${state.level} Card</h2>
        </div>
        <span class="loyalty-cycle">Cycle ${state.cycle}</span>
      </div>
      <ol class="loyalty-stamps" aria-label="${state.progress} of 10 orders completed">${stamps}</ol>
      <div class="loyalty-card-foot">
        <div>
          <span>${state.progress} of 10 qualifying orders</span>
          <strong>${state.progress === 10 ? 'Card complete' : `Next: ${escapeHtml(nextReward.title)}`}</strong>
        </div>
        ${currentReward ? `<div class="loyalty-latest"><span>Latest milestone</span><strong>${escapeHtml(currentReward.title)}</strong></div>` : ''}
      </div>
    </div>
    <div class="loyalty-explainer">
      <div>
        <span class="section-eyebrow">How it works</span>
        <p>Spend at least <strong>£50 on products</strong> in one order. Once delivered, it adds one stamp and unlocks that step's reward for a future qualifying order.</p>
      </div>
      <details>
        <summary>Reward rules</summary>
        <p>One reward per order. Earned rewards do not combine with MAXX10 or another promotional code. The 20% reward is capped at £25 and the 30% reward at £50. Free-vial rewards apply to one in-stock single vial, not bundles. Delivery is charged on the final free-vial reward.</p>
      </details>
    </div>${rewardWallet}`;
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
      <div class="account-item-actions"><span>${money(item.line_total || 0)}</span></div>
    </div>
  `).join('');
  const batches = (order.batches || []).map((batch) => `
    <div class="account-batch">
      <div><strong>${escapeHtml(batch.product_name || batch.sku)}</strong><span>${escapeHtml(batch.batch_code)} · Qty ${Number(batch.qty || 0)}</span></div>
      ${batch.coa_url ? `<a href="${escapeHtml(batch.coa_url)}" target="_blank" rel="noopener">View supplied COA</a>` : '<span>Record unavailable</span>'}
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
      ${batches ? `<div class="account-batches"><span class="account-order-label">Supplied batch records</span>${batches}</div>` : ''}
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
  const localPreview = ['127.0.0.1', 'localhost'].includes(window.location.hostname)
    && new URLSearchParams(window.location.search).get('loyalty_preview') === '1';

  try {
    if (localPreview) {
      const previewData = {
        email: 'member@ukmaxx.co.uk',
        first_name: 'Bashir',
        loyalty: {
          enabled: true,
          completed_orders: 8,
          rewards: [
            { id: 'preview-reward-7', code: 'CREDIT_20', label: '£20 credit', status: 'available' },
            { id: 'preview-reward-8', code: 'FREE_BAC_VIAL_2999', label: 'Free BAC Water + one vial up to £29.99', status: 'available' },
          ],
        },
        orders: [
          {
            order_number: 'UKX26PREVIEW', status: 'delivered', created_at: new Date().toISOString(), total: 85.06,
            tracking_number: 'AA123456789GB', tracking_url: 'https://www.royalmail.com/track-your-item',
            items: [{ sku: 'RT20', product_name: 'RETA 20MG', qty: 1, line_total: 79.99 }],
            batches: [{ sku: 'RT20', product_name: 'RETA 20MG', qty: 1, batch_code: 'RT20-2026-08-A', coa_url: '/coa.html?batch=RT20-2026-08-A' }],
          },
          ...Array.from({ length: 7 }, (_, index) => ({
            order_number: `UKX26HISTORY${index + 1}`, status: 'delivered', created_at: new Date(Date.now() - ((index + 1) * 86400000 * 9)).toISOString(), total: 58.07, items: [], batches: [],
          })),
        ],
      };
      if (emailEl) emailEl.textContent = previewData.email;
      accountOrders = previewData.orders;
      renderLoyalty(previewData);
      if (summaryEl) summaryEl.innerHTML = `
        <div><strong>8</strong><span>Completed orders</span></div>
        <div><strong>8 / 10</strong><span>Rewards progress</span></div>
        <div><strong>${formatDate(previewData.orders[0].created_at)}</strong><span>Latest order</span></div>`;
      if (ordersEl) ordersEl.innerHTML = previewData.orders.slice(0, 1).map(orderCard).join('');
      if (content) content.style.display = '';
      if (empty) empty.style.display = 'none';
      return;
    }

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
    renderLoyalty(data);
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
