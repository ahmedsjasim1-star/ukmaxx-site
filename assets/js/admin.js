import { getSupabase } from './data/supabase.js';

const SITE_URL = window.location.origin;
const ANALYTICS_IGNORE_KEY = 'ukmaxx_analytics_ignore';
const ADMIN_RANGE_KEY = 'ukmaxx_admin_range';
const RANGE_LABELS = {
  '1h': 'Last hour',
  '24h': 'Last 24 hours',
  '72h': 'Last 72 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '1y': 'Last year',
  all: 'All time',
};

const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(value || 0));
const number = (value) => new Intl.NumberFormat('en-GB').format(Number(value || 0));
const date = (value) => value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';

let currentDashboard = null;
let dashboardLoading = false;
let selectedRange = getStoredRange();

function showAlert(message) {
  const alert = $('adminAlert');
  if (!alert) return;
  alert.textContent = message;
  alert.hidden = false;
}

function clearAlert() {
  const alert = $('adminAlert');
  if (!alert) return;
  alert.hidden = true;
  alert.textContent = '';
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function analyticsIgnored() {
  try {
    return localStorage.getItem(ANALYTICS_IGNORE_KEY) === 'true';
  } catch {
    return false;
  }
}

function setAnalyticsIgnored(value) {
  try {
    localStorage.setItem(ANALYTICS_IGNORE_KEY, value ? 'true' : 'false');
  } catch {}
  updateIgnoreBrowserButton();
}

function getStoredRange() {
  try {
    const stored = localStorage.getItem(ADMIN_RANGE_KEY);
    return RANGE_LABELS[stored] ? stored : '24h';
  } catch {
    return '24h';
  }
}

function setStoredRange(value) {
  selectedRange = RANGE_LABELS[value] ? value : '24h';
  try {
    localStorage.setItem(ADMIN_RANGE_KEY, selectedRange);
  } catch {}
  updateRangeTabs();
}

function updateIgnoreBrowserButton() {
  const btn = $('adminIgnoreBrowserBtn');
  if (!btn) return;
  const ignored = analyticsIgnored();
  btn.textContent = ignored ? 'Tracking ignored' : 'Ignore this browser';
  btn.classList.toggle('is-active', ignored);
  btn.setAttribute('aria-pressed', ignored ? 'true' : 'false');
}

function updateRangeTabs() {
  document.querySelectorAll('.admin-range-tab').forEach((button) => {
    const active = button.dataset.range === selectedRange;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

function showLock(message = '') {
  $('adminLock').hidden = false;
  $('adminDashboard').hidden = true;
  const note = $('adminLockNote');
  if (note) note.textContent = message || 'Authorised UKMAXX administrators only.';
}

function showDashboard() {
  $('adminLock').hidden = true;
  $('adminDashboard').hidden = false;
}

async function signIn() {
  const btn = $('adminGoogleBtn');
  if (btn) btn.disabled = true;
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${SITE_URL}/admin.html`,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) throw error;
  } catch (err) {
    showLock(`Sign-in failed: ${err.message}`);
    if (btn) btn.disabled = false;
  }
}

async function signOut() {
  const supabase = await getSupabase();
  await supabase.auth.signOut();
  closeOrderDrawer();
  showLock();
}

async function fetchDashboard(session) {
  const res = await fetch('/api/order-admin?type=dashboard', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (res.status === 401) throw new Error('Please sign in again.');
  if (res.status === 403) throw new Error('Admin access could not be verified.');
  if (!res.ok) throw new Error('Unable to load dashboard metrics.');
  return res.json();
}

async function waitForSession(supabase, timeoutMs = 4500) {
  const existing = await supabase.auth.getSession();
  if (existing.data?.session?.access_token) return existing.data.session;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (session = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription?.unsubscribe?.();
      resolve(session);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.access_token) finish(session);
    });
    const timer = setTimeout(async () => {
      const retry = await supabase.auth.getSession();
      finish(retry.data?.session || null);
    }, timeoutMs);
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderBars(rows) {
  const max = Math.max(1, ...rows.map((row) => Number(row.revenue || row.value || 0)));
  if (!rows.length) return '<p class="empty-state">No product sales yet.</p>';
  return rows.map((row) => {
    const value = Number(row.revenue || row.value || 0);
    const width = Math.max(4, Math.round((value / max) * 100));
    return `<div class="bar-row">
      <span class="bar-name">${escapeHtml(row.name || row.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${width}%"></span></span>
      <span class="bar-value">${money(value)}</span>
    </div>`;
  }).join('');
}

function renderCountBars(rows, emptyText = 'No data yet.') {
  const max = Math.max(1, ...rows.map((row) => Number(row.value || 0)));
  if (!rows.length) return `<p class="empty-state">${escapeHtml(emptyText)}</p>`;
  return rows.map((row) => {
    const value = Number(row.value || 0);
    const width = Math.max(value ? 5 : 0, Math.round((value / max) * 100));
    return `<div class="count-row">
      <div class="count-row-top">
        <span>${escapeHtml(row.label)}</span>
        <strong>${number(value)}</strong>
      </div>
      <span class="count-track"><span class="count-fill" style="width:${width}%"></span></span>
    </div>`;
  }).join('');
}

function renderStatuses(statuses) {
  const entries = Object.entries(statuses || {});
  if (!entries.length) return '<p class="empty-state">No orders yet.</p>';
  return entries.map(([status, count]) => `<div class="status-card"><strong>${number(count)}</strong><span>${escapeHtml(status)}</span></div>`).join('');
}

function renderStock(stock) {
  const rows = stock?.products || [];
  if (!rows.length) return '<p class="empty-state">No stock data found.</p>';
  return rows.map((product) => {
    const low = product.active && Number(product.stock || 0) <= 5;
    return `<div class="stock-row ${low ? 'low' : ''}">
      <div><strong>${escapeHtml(product.name || product.sku)}</strong><small>${escapeHtml(product.sku)} · ${product.active ? 'Active' : 'Inactive'}</small></div>
      <span class="stock-count">${number(product.stock)}</span>
    </div>`;
  }).join('');
}

function renderRecentOrders(rows) {
  if (!rows?.length) return '<tr><td colspan="6" class="empty-state">No orders yet.</td></tr>';
  return rows.map((order) => `<tr data-order-number="${escapeHtml(order.orderNumber)}">
    <td><strong>${escapeHtml(order.orderNumber)}</strong></td>
    <td>${escapeHtml(order.email)}</td>
    <td><span class="status-pill">${escapeHtml(order.status)}</span></td>
    <td>${escapeHtml(order.paymentProvider)}</td>
    <td>${money(order.total)}</td>
    <td>${date(order.createdAt)}</td>
  </tr>`).join('');
}

function formatTopics(topics) {
  const labels = {
    restock: 'Restock',
    batch_updates: 'Batch updates',
  };
  const values = Array.isArray(topics) ? topics : [];
  if (!values.length) return 'Batch updates';
  return values.map((topic) => labels[topic] || String(topic).replace(/_/g, ' ')).join(', ');
}

function renderEmailSubscribers(rows) {
  if (!rows?.length) return '<tr><td colspan="5" class="empty-state">No batch alert signups in this range.</td></tr>';
  return rows.map((subscriber) => `<tr>
    <td><strong>${escapeHtml(subscriber.email)}</strong></td>
    <td>${escapeHtml(formatTopics(subscriber.topics))}</td>
    <td><span class="status-pill ${subscriber.status === 'unsubscribed' ? 'muted' : ''}">${escapeHtml(subscriber.status)}</span></td>
    <td>${date(subscriber.createdAt)}</td>
    <td>${date(subscriber.updatedAt)}</td>
  </tr>`).join('');
}

function renderDropoffs(rows) {
  if (!rows?.length) return '<p class="empty-state">No dropped checkouts in this range.</p>';
  return rows.map((row, index) => `<button class="dropoff-row" type="button" data-dropoff-index="${index}">
    <span class="dropoff-main">
      <strong>${escapeHtml(row.itemSummary || 'Basket details unavailable')}</strong>
      <span>${escapeHtml(row.source || 'Direct')} · ${escapeHtml(row.location || 'Unknown')} · ${escapeHtml(row.device || 'unknown')}</span>
    </span>
    <span class="dropoff-meta">
      <strong>${money(row.cartValue || 0)}</strong>
      <span>${row.promoCode ? `Promo ${escapeHtml(row.promoCode)} · ` : ''}${date(row.lastSeen)}</span>
    </span>
    <span class="dropoff-stage">
      <strong>${escapeHtml(row.stage || 'Checkout')}</strong>
      <span>${escapeHtml(row.lastPage || '/')}</span>
    </span>
  </button>`).join('');
}

function detail(label, value) {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || '—')}</strong></div>`;
}

function openOrderDrawer(orderNumber) {
  const order = currentDashboard?.orders?.recent?.find((row) => row.orderNumber === orderNumber);
  const drawer = $('orderDrawer');
  if (!order || !drawer) return;
  $('orderDrawerTitle').textContent = order.orderNumber;
  $('orderDrawerBody').innerHTML = [
    detail('Customer', order.email),
    detail('Status', order.status),
    detail('Payment', order.paymentProvider),
    detail('Subtotal', money(order.subtotal)),
    detail('Discount', money(order.discount)),
    detail('Shipping', money(order.shipping)),
    detail('Total', money(order.total)),
    detail('Promo opt-in', order.promoOptIn ? 'Yes' : 'No'),
    detail('Created', date(order.createdAt)),
    detail('Dispatched', date(order.dispatchedAt)),
    detail('Delivered', date(order.deliveredAt)),
  ].join('');
  drawer.classList.add('is-open');
  drawer.setAttribute('aria-hidden', 'false');
}

function openDropoffDrawer(index) {
  const row = (currentDashboard?.ranges?.[selectedRange]?.checkoutDropoffs || [])[Number(index)];
  const drawer = $('orderDrawer');
  if (!row || !drawer) return;
  $('orderDrawerTitle').textContent = row.stage || 'Dropped checkout';
  const journey = (row.journey || []).map((step) => {
    const product = step.product ? ` · ${step.product}` : '';
    return `${date(step.time)} · ${String(step.type || '').replace(/_/g, ' ')}${product} · ${step.page || '/'}`;
  }).join('<br>');
  $('orderDrawerBody').innerHTML = [
    detail('Products', row.itemSummary),
    detail('Basket value', money(row.cartValue || 0)),
    detail('Source', row.source),
    detail('Location', row.location),
    detail('Device', row.device),
    detail('Promo code', row.promoCode || 'None'),
    detail('Last page', row.lastPage),
    detail('First seen', date(row.firstSeen)),
    detail('Last seen', date(row.lastSeen)),
    detail('Journey', journey || 'No journey data'),
  ].join('');
  drawer.classList.add('is-open');
  drawer.setAttribute('aria-hidden', 'false');
}

function closeOrderDrawer() {
  const drawer = $('orderDrawer');
  if (!drawer) return;
  drawer.classList.remove('is-open');
  drawer.setAttribute('aria-hidden', 'true');
}

function renderDashboardRange(data) {
  currentDashboard = data;
  const range = data.ranges?.[selectedRange] || data.ranges?.['24h'] || {};
  const rangeLabel = range.label || RANGE_LABELS[selectedRange] || 'Last 24 hours';
  const summary = range.summary || data.summary || {};
  const analytics = range.analytics || data.analytics || {};
  const products = range.products || data.products || {};
  const orders = range.orders || data.orders || {};
  const payments = range.payments || data.payments || {};
  const customers = range.customers || data.customers || {};
  const reviews = range.reviews || data.reviews || {};
  const emailSubscribers = range.emailSubscribers || data.emailSubscribers || {};
  const stock = data.products?.stock;
  const orderCount = Number(summary.orders || 0);
  const visitors = Number(analytics.visitors || 0);
  const sessions = Number(analytics.sessions || 0);
  const pageviews = Number(analytics.pageviews || 0);

  setText('adminEmail', data.adminEmail || 'Admin');
  setText('dashboardUpdated', `Updated ${date(data.generatedAt)}`);
  setText('adminRangeTitle', rangeLabel);
  setText('adminRangeSub', `${number(visitors)} unique visitors · ${number(sessions)} sessions · ${number(pageviews)} pageviews`);
  setText('trafficRangeChip', rangeLabel);
  updateRangeTabs();

  setText('rangeRevenue', money(summary.revenue));
  setText('rangeRevenueMeta', `${number(orderCount)} paid order${orderCount === 1 ? '' : 's'} in range`);
  setText('rangeOrders', number(orderCount));
  setText('rangeOrdersMeta', `${money(summary.averageOrderValue)} AOV`);
  setText('rangeAov', money(summary.averageOrderValue));
  setText('rangeAovMeta', `${money(summary.revenue)} revenue`);
  setText('rangeConversion', `${Number(analytics.conversionRate || 0).toFixed(1)}%`);
  setText('rangeConversionMeta', `${number(orderCount)} paid orders from ${number(visitors)} visitors`);

  setText('rangeVisitors', number(visitors));
  setText('rangeVisitorsMeta', `${number(analytics.internalIgnored || 0)} ignored internal events`);
  setText('rangeSessions', number(sessions));
  setText('rangeSessionsMeta', `${number(visitors)} unique visitors`);
  setText('rangePageviews', number(pageviews));
  setText('rangePageviewsMeta', `${sessions ? (pageviews / sessions).toFixed(1) : '0.0'} pages/session`);
  setText('rangePaymentIssues', number(payments.rejectedOrCancelled));
  setText('rangePaymentIssuesMeta', `${number(payments.totalAttempts)} payment attempts`);

  const top = products.top || [];
  $('topProducts').innerHTML = renderBars(top);
  setText('topProductChip', top[0] ? `${top[0].name} · ${number(top[0].quantity)} sold` : 'No sales yet');
  $('orderStatus').innerHTML = renderStatuses(orders.byStatus);
  $('topPages').innerHTML = renderCountBars(analytics.topPages || [], 'No page views tracked yet.');
  $('checkoutFunnel').innerHTML = renderCountBars(analytics.funnel || [], 'No checkout behaviour tracked yet.');
  $('checkoutDropoffs').innerHTML = renderDropoffs(range.checkoutDropoffs || []);
  setText('dropoffChip', `${number(range.checkoutDropoffs?.length || 0)} sessions`);
  $('productViews').innerHTML = renderCountBars(analytics.topProductViews || [], 'No product views tracked yet.');
  $('trafficSources').innerHTML = renderCountBars(analytics.sources || [], 'No traffic sources tracked yet.');
  $('visitorLocations').innerHTML = renderCountBars(analytics.locations || [], 'No visitor locations yet.');
  $('deviceSplit').innerHTML = renderCountBars(analytics.devices || [], 'No device split tracked yet.');
  $('stockList').innerHTML = renderStock(stock);
  setText('lowStockChip', `${number(stock?.lowStock?.length)} low stock`);

  setText('uniqueCustomers', number(customers.uniqueCustomers));
  setText('repeatCustomers', number(customers.repeatCustomers));
  setText('repeatRate', `${number(customers.repeatRate)}%`);
  setText('subscribers', number(emailSubscribers.active || 0));

  setText('paymentAttempts', number(payments.totalAttempts));
  setText('paymentIssues', number(payments.rejectedOrCancelled));
  setText('pendingReviews', number(reviews.pending));
  setText('approvedReviews', `${number(reviews.approved)} · ${Number(reviews.averageRating || 0).toFixed(1)}/5`);

  setText('emailSubscriberChip', `${number(emailSubscribers.newInRange || 0)} new · ${number(emailSubscribers.active || 0)} active`);
  $('emailSubscribersList').innerHTML = renderEmailSubscribers(emailSubscribers.recent || []);

  setText('openFulfilment', `${number(data.orders?.openFulfilment)} open fulfilment`);
  $('recentOrders').innerHTML = renderRecentOrders(data.orders?.recent || []);
}

function renderDashboard(data) {
  renderDashboardRange(data);
  return;
  currentDashboard = data;
  const summary = data.summary || {};
  const today = summary.today || {};
  const seven = summary.sevenDays || {};
  const thirty = summary.thirtyDays || {};
  const analytics = data.analytics || {};
  const trafficToday = analytics.today || {};
  const trafficSeven = analytics.sevenDays || {};
  const trafficThirty = analytics.thirtyDays || {};

  setText('adminEmail', data.adminEmail || 'Admin');
  setText('dashboardUpdated', `Updated ${date(data.generatedAt)}`);
  setText('revenueToday', money(today.revenue));
  setText('ordersToday', `${number(today.orders)} order${today.orders === 1 ? '' : 's'} today`);
  setText('revenueSeven', money(seven.revenue));
  setText('ordersSeven', `${number(seven.orders)} orders · AOV ${money(seven.averageOrderValue)}`);
  setText('revenueThirty', money(thirty.revenue));
  setText('ordersThirty', `${number(thirty.orders)} orders · AOV ${money(thirty.averageOrderValue)}`);
  setText('averageOrderValue', money(summary.averageOrderValue));
  setText('allTimeOrders', `${number(summary.allTimeOrders)} paid orders · ${money(summary.allTimeRevenue)} total`);

  setText('visitorsToday', number(trafficToday.visitors));
  setText('pageviewsToday', `${number(trafficToday.sessions || 0)} sessions · ${number(trafficToday.pageviews)} pageviews`);
  setText('visitorsSeven', number(trafficSeven.visitors));
  setText('pageviewsSeven', `${number(trafficSeven.sessions || 0)} sessions · ${number(trafficSeven.pageviews)} pageviews`);
  setText('conversionToday', `${Number(trafficToday.conversionRate || 0).toFixed(1)}%`);
  setText('conversionSeven', `7-day conversion ${Number(trafficSeven.conversionRate || 0).toFixed(1)}%`);
  setText('visitorsThirty', number(trafficThirty.visitors));
  setText('pageviewsThirty', `${number(trafficThirty.sessions || 0)} sessions · ${number(trafficThirty.pageviews)} pageviews`);

  const top = data.products?.top || [];
  $('topProducts').innerHTML = renderBars(top);
  setText('topProductChip', top[0] ? `${top[0].name} · ${number(top[0].quantity)} sold` : 'No sales yet');
  $('orderStatus').innerHTML = renderStatuses(data.orders?.byStatus);
  $('topPages').innerHTML = renderCountBars(analytics.topPages || [], 'No page views tracked yet.');
  $('checkoutFunnel').innerHTML = renderCountBars(analytics.funnel || [], 'No checkout behaviour tracked yet.');
  $('productViews').innerHTML = renderCountBars(analytics.topProductViews || [], 'No product views tracked yet.');
  $('trafficSources').innerHTML = renderCountBars(analytics.sources || [], 'No traffic sources tracked yet.');
  $('visitorLocations').innerHTML = renderCountBars(analytics.locations || [], 'No visitor locations yet.');
  $('deviceSplit').innerHTML = renderCountBars(analytics.devices || [], 'No device split tracked yet.');
  $('stockList').innerHTML = renderStock(data.products?.stock);
  setText('lowStockChip', `${number(data.products?.stock?.lowStock?.length)} low stock`);

  setText('uniqueCustomers', number(data.customers?.uniqueCustomers));
  setText('repeatCustomers', number(data.customers?.repeatCustomers));
  setText('repeatRate', `${number(data.customers?.repeatRate)}%`);
  setText('subscribers', number(summary.subscribers));

  setText('paymentAttempts', number(data.payments?.totalAttempts));
  setText('paymentIssues', number(data.payments?.rejectedOrCancelled));
  setText('pendingReviews', number(data.reviews?.pending));
  setText('approvedReviews', `${number(data.reviews?.approved)} · ${Number(data.reviews?.averageRating || 0).toFixed(1)}/5`);

  setText('openFulfilment', `${number(data.orders?.openFulfilment)} open fulfilment`);
  $('recentOrders').innerHTML = renderRecentOrders(data.orders?.recent || []);
}

async function loadDashboard() {
  if (dashboardLoading) return;
  dashboardLoading = true;
  clearAlert();
  try {
    const supabase = await getSupabase();
    const params = new URLSearchParams(window.location.search);

    if (params.has('error') || params.has('error_description')) {
      window.history.replaceState({}, document.title, window.location.pathname);
      showLock('Sign-in was not completed. Please try again.');
      return;
    }

    const isOAuthReturn = params.has('code');
    if (isOAuthReturn) {
      const session = await waitForSession(supabase);
      window.history.replaceState({}, document.title, window.location.pathname);
      if (!session?.access_token) {
        showLock('Sign-in could not be completed. Please try again.');
        return;
      }

      showDashboard();
      const data = await fetchDashboard(session);
      renderDashboard(data);
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      showLock();
      return;
    }

    showDashboard();
    const data = await fetchDashboard(session);
    renderDashboard(data);
  } catch (err) {
    showAlert(err.message);
    if (/access|sign in/i.test(err.message)) showLock(err.message);
  } finally {
    dashboardLoading = false;
  }
}

$('adminGoogleBtn')?.addEventListener('click', signIn);
$('adminSignOutBtn')?.addEventListener('click', signOut);
$('adminRefreshBtn')?.addEventListener('click', loadDashboard);
$('adminIgnoreBrowserBtn')?.addEventListener('click', () => {
  setAnalyticsIgnored(!analyticsIgnored());
  showAlert(analyticsIgnored()
    ? 'This browser will no longer be counted in public-site analytics.'
    : 'This browser will be counted in public-site analytics again.');
});
$('adminRangeTabs')?.addEventListener('click', (event) => {
  const button = event.target.closest('.admin-range-tab[data-range]');
  if (!button) return;
  setStoredRange(button.dataset.range);
  if (currentDashboard) renderDashboardRange(currentDashboard);
});
$('recentOrders')?.addEventListener('click', (event) => {
  const row = event.target.closest('tr[data-order-number]');
  if (row) openOrderDrawer(row.getAttribute('data-order-number'));
});
$('checkoutDropoffs')?.addEventListener('click', (event) => {
  const row = event.target.closest('[data-dropoff-index]');
  if (row) openDropoffDrawer(row.getAttribute('data-dropoff-index'));
});
$('orderDrawerClose')?.addEventListener('click', closeOrderDrawer);
$('orderDrawerBackdrop')?.addEventListener('click', closeOrderDrawer);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeOrderDrawer();
});

getSupabase().then(async (supabase) => {
  updateIgnoreBrowserButton();
  await loadDashboard();
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      showLock();
      return;
    }
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') loadDashboard();
  });
}).catch((err) => showLock(`Unable to initialise admin login: ${err.message}`));
