import { getSupabase } from './data/supabase.js';

const SITE_URL = window.location.origin;

const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(value || 0));
const number = (value) => new Intl.NumberFormat('en-GB').format(Number(value || 0));
const date = (value) => value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';

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
  showLock();
}

async function fetchDashboard(session) {
  const res = await fetch('/api/order-admin?type=dashboard', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (res.status === 401) throw new Error('Please sign in again.');
  if (res.status === 403) throw new Error('This Google account is not authorised for the UKMAXX dashboard.');
  if (!res.ok) throw new Error('Unable to load dashboard metrics.');
  return res.json();
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
  return rows.map((order) => `<tr>
    <td><strong>${escapeHtml(order.orderNumber)}</strong></td>
    <td>${escapeHtml(order.email)}</td>
    <td><span class="status-pill">${escapeHtml(order.status)}</span></td>
    <td>${escapeHtml(order.paymentProvider)}</td>
    <td>${money(order.total)}</td>
    <td>${date(order.createdAt)}</td>
  </tr>`).join('');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderDashboard(data) {
  const summary = data.summary || {};
  const today = summary.today || {};
  const seven = summary.sevenDays || {};
  const thirty = summary.thirtyDays || {};

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

  const top = data.products?.top || [];
  $('topProducts').innerHTML = renderBars(top);
  setText('topProductChip', top[0] ? `${top[0].name} · ${number(top[0].quantity)} sold` : 'No sales yet');
  $('orderStatus').innerHTML = renderStatuses(data.orders?.byStatus);
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
  clearAlert();
  const supabase = await getSupabase();
  const params = new URLSearchParams(window.location.search);
  if (params.has('code')) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.get('code'));
    const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
    window.history.replaceState({}, document.title, cleanUrl);
    if (error) {
      showLock('Sign-in could not be completed. Please try again.');
      return;
    }
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    showLock();
    return;
  }

  showDashboard();
  try {
    const data = await fetchDashboard(session);
    renderDashboard(data);
  } catch (err) {
    showAlert(err.message);
    if (/restricted|sign in/i.test(err.message)) showLock(err.message);
  }
}

$('adminGoogleBtn')?.addEventListener('click', signIn);
$('adminSignOutBtn')?.addEventListener('click', signOut);
$('adminRefreshBtn')?.addEventListener('click', loadDashboard);

getSupabase().then((supabase) => {
  supabase.auth.onAuthStateChange(() => loadDashboard());
  return loadDashboard();
}).catch((err) => showLock(`Unable to initialise admin login: ${err.message}`));
