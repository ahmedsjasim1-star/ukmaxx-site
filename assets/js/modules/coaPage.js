import { COA, PRODUCTS, getCoaStatusLabel, getReleaseLabel } from '../data/products.js';

function byId(id) {
  return document.getElementById(id);
}

function normalise(value) {
  return String(value || '').trim().toUpperCase();
}

function statusClass(status) {
  if (status === 'VERIFIED') return 'verified';
  if (status === 'INTERNAL_QC') return 'internal';
  return 'pending';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]));
}

function productUrl(sku) {
  return `./product.html?sku=${encodeURIComponent(sku)}`;
}

function coaRecords() {
  const records = Object.values(COA).map((record) => ({
    ...record,
    skus: Object.values(PRODUCTS)
      .filter((product) => product.batch === record.batch)
      .map((product) => product.id),
  })).filter((record) => PRODUCTS[record.sku]?.category !== 'support');

  Object.values(PRODUCTS).forEach((product) => {
    if (product.category === 'support') return;
    if (!product.batch || COA[product.batch]) return;
    records.push({
      batch: product.batch,
      sku: product.id,
      product: product.name,
      sample: product.name,
      status: 'PENDING',
      statusLabel: getCoaStatusLabel(product),
      purity: product.purity || 'Pending',
      method: product.coa?.method || 'Pending',
      lab: product.coa?.lab || 'Pending',
      report: 'Awaiting COA',
      testDate: 'Pending',
      image: product.image,
      url: '',
      skus: [product.id],
      releaseLabel: getReleaseLabel(product),
    });
  });

  return records.sort((a, b) => {
    const rank = { VERIFIED: 0, INTERNAL_QC: 1, PENDING: 2 };
    return (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.product.localeCompare(b.product);
  });
}

function renderRows(records) {
  const table = byId('coaTableBody');
  if (!table) return;
  table.innerHTML = records.map((record) => {
    const skus = record.skus?.length ? record.skus : [record.sku];
    const action = record.url
      ? `<a href="${record.url}" target="_blank" rel="noopener noreferrer" class="coa-link">Verify externally</a>`
      : `<span class="coa-muted">${record.status === 'PENDING' ? 'Pending release' : 'Available on request'}</span>`;
    return `
      <tr>
        <td>
          <strong>${escapeHtml(record.product)}</strong>
          <span>${escapeHtml(skus.join(' / '))}</span>
        </td>
        <td><code>${escapeHtml(record.batch)}</code></td>
        <td><span class="coa-status coa-status-${statusClass(record.status)}">${escapeHtml(record.statusLabel)}</span></td>
        <td>${escapeHtml(record.lab)}</td>
        <td>${escapeHtml(record.method)}</td>
        <td>${escapeHtml(record.testDate)}</td>
        <td>${action}</td>
      </tr>
    `;
  }).join('');
}

function findRecord(query, records) {
  const needle = normalise(query);
  if (!needle) return null;
  return records.find((record) => {
    const fields = [
      record.batch,
      record.sku,
      record.product,
      record.sample,
      record.report,
      ...(record.skus || []),
    ].map(normalise);
    return fields.includes(needle);
  }) || records.find((record) => {
    return normalise(record.batch).includes(needle) || normalise(record.product).includes(needle);
  }) || null;
}

function resultHtml(record) {
  if (!record) {
    return `
      <div class="coa-result is-missing">
        <div class="coa-result-kicker">No match found</div>
        <h3>We could not find that batch code.</h3>
        <p>Check the code printed on your UKMAXX batch card or product label. If it still does not match, contact support with your order number.</p>
        <a class="btn btn-ghost" href="mailto:support@ukmaxx.co.uk?subject=Batch%20COA%20check">Contact support</a>
      </div>
    `;
  }

  const action = record.url
    ? `<a class="btn btn-primary" href="${record.url}" target="_blank" rel="noopener noreferrer">Verify on ${escapeHtml(record.lab)}</a>`
    : `<a class="btn btn-ghost" href="${productUrl(record.sku)}">View product</a>`;

  return `
    <div class="coa-result">
      <div class="coa-result-kicker">${escapeHtml(record.statusLabel)}</div>
      <h3>${escapeHtml(record.product)} · ${escapeHtml(record.batch)}</h3>
      <div class="coa-result-grid">
        <div><span>Lab</span><strong>${escapeHtml(record.lab)}</strong></div>
        <div><span>Method</span><strong>${escapeHtml(record.method)}</strong></div>
        <div><span>Purity / QC</span><strong>${escapeHtml(record.purity)}</strong></div>
        <div><span>Test date</span><strong>${escapeHtml(record.testDate)}</strong></div>
      </div>
      <div class="coa-result-actions">
        ${action}
        <a class="btn btn-ghost" href="${productUrl(record.sku)}">View product page</a>
      </div>
    </div>
  `;
}

export function setupCoaPage() {
  const mount = byId('coaPage');
  if (!mount) return;

  const records = coaRecords();
  renderRows(records);

  const form = byId('coaCheckerForm');
  const input = byId('coaCheckerInput');
  const result = byId('coaCheckerResult');
  const chips = document.querySelectorAll('[data-coa-check]');

  function runCheck(value) {
    if (!result) return;
    const record = findRecord(value, records);
    result.innerHTML = resultHtml(record);
    result.hidden = false;
  }

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    runCheck(input?.value);
  });

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const value = chip.getAttribute('data-coa-check') || '';
      if (input) input.value = value;
      runCheck(value);
    });
  });

  const params = new URLSearchParams(window.location.search);
  const batch = params.get('batch') || params.get('sku');
  if (batch) {
    if (input) input.value = batch;
    runCheck(batch);
  }
}
