export function toast(title, msg, type = 'success') {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' is-error' : '');
  const icon = type === 'error'
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  el.innerHTML = '<span class="toast-icon">' + icon + '</span><div class="toast-body"><div class="toast-title"></div><div class="toast-msg"></div></div>';
  el.querySelector('.toast-title').textContent = title;
  el.querySelector('.toast-msg').textContent = msg || '';
  c.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-shown'));
  setTimeout(() => { el.classList.remove('is-shown'); setTimeout(() => el.remove(), 300); }, 3200);
}
