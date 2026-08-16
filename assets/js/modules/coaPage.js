import { COA, PRODUCTS, getCoaStatusLabel, getReleaseLabel } from '../data/products.js?v=20260815-fast-products';
import { getSupabase } from '../data/supabase.js';

function byId(id) {
  return document.getElementById(id);
}

function normalise(value) {
  return String(value || '').trim().toUpperCase();
}

function statusClass(status) {
  if (status === 'REJECTED') return 'rejected';
  if (status === 'ARCHIVED') return 'archived';
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

function formatDate(value) {
  if (!value) return 'Pending';
  try {
    return new Date(value).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(value);
  }
}

function num(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function remaining(record) {
  return Math.max(0, num(record.batchSize) - num(record.soldCount));
}

function displayPurity(record) {
  return [record.purity, record.assayResult].filter(Boolean).join(' / ') || 'Pending';
}

function fallbackAssayResult(batchCode) {
  const assays = {
    'RT10-2026-06-A': '10.12mg',
  };
  return assays[String(batchCode || '').toUpperCase()] || '';
}

function isArchived(record) {
  if (record.status === 'REJECTED') return false;
  return record.status === 'ARCHIVED' || Boolean(record.archivedAt) || (num(record.batchSize) > 0 && remaining(record) <= 0);
}

function isRejected(record) {
  return record.status === 'REJECTED';
}

function localRecords() {
  const records = Object.values(COA).map((record) => {
    const skus = Object.values(PRODUCTS)
      .filter((product) => product.batch === record.batch)
      .map((product) => product.id);
    const product = PRODUCTS[record.sku];
    const batchSize = product?.category === 'support' && record.status !== 'REJECTED'
      ? 0
      : num(record.batchSize ?? product?.stockCount);
    return {
      ...record,
      batchSize,
      soldCount: 0,
      statusLabel: record.status === 'REJECTED' ? record.statusLabel : batchSize ? 'Active verified batch' : record.statusLabel,
      archivedAt: '',
      skus,
    };
  }).filter((record) => PRODUCTS[record.sku]?.category !== 'support' || record.status === 'REJECTED');

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
      assayResult: '',
      method: product.coa?.method || 'Pending',
      lab: product.coa?.lab || 'Pending',
      report: 'Awaiting COA',
      testDate: 'Pending',
      image: product.image,
      url: '',
      batchSize: 0,
      soldCount: 0,
      archivedAt: '',
      skus: [product.id],
      releaseLabel: getReleaseLabel(product),
    });
  });

  return sortRecords(records);
}

function mapSupabaseRecord(row) {
  const product = PRODUCTS[row.sku] || {};
  const batchSize = num(row.batch_size);
  const soldCount = num(row.sold_count);
  const releaseStatus = String(row.release_status || '').toLowerCase();
  const rejected = releaseStatus === 'rejected';
  const archived = !rejected && (Boolean(row.archived_at) || (batchSize > 0 && soldCount >= batchSize) || row.is_active === false);
  return {
    batch: row.batch_code,
    sku: row.sku,
    product: row.product_name || product.name || row.sku,
    sample: product.name || row.product_name || row.sku,
    status: rejected ? 'REJECTED' : archived ? 'ARCHIVED' : 'VERIFIED',
    statusLabel: rejected ? 'QC rejected — not released' : archived ? 'Archived batch' : 'Active verified batch',
    purity: row.purity || '',
    assayResult: row.assay_result || COA[row.batch_code]?.assayResult || fallbackAssayResult(row.batch_code),
    method: row.method || 'Pending',
    lab: row.lab_name || 'Pending',
    report: row.batch_code,
    testDate: formatDate(row.tested_at),
    image: row.image_url || product.image || '',
    url: row.coa_url || '',
    batchSize,
    soldCount,
    archivedAt: row.archived_at || '',
    releaseStatus: releaseStatus || 'approved',
    rejectionReason: row.rejection_reason || '',
    labelClaim: row.label_claim || '',
    skus: [row.sku],
    displayOrder: num(product.sortOrder) || num(row.display_order) || 100,
  };
}

function sortRecords(records) {
  const rank = { VERIFIED: 0, INTERNAL_QC: 1, PENDING: 2, ARCHIVED: 3, REJECTED: 4 };
  return [...records].sort((a, b) => {
    return (rank[a.status] ?? 9) - (rank[b.status] ?? 9)
      || num(PRODUCTS[a.sku]?.sortOrder) - num(PRODUCTS[b.sku]?.sortOrder)
      || num(a.displayOrder) - num(b.displayOrder)
      || a.product.localeCompare(b.product);
  });
}

async function fetchSupabaseRecords() {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('coa_batches')
      .select('batch_code,sku,product_name,purity,assay_result,method,lab_name,coa_url,image_url,tested_at,published_at,is_active,batch_size,sold_count,archived_at,display_order,release_status,rejection_reason,label_claim')
      .not('published_at', 'is', null)
      .order('display_order', { ascending: true })
      .order('tested_at', { ascending: false });
    if (error) throw error;
    const rows = (data || [])
      .filter((row) => PRODUCTS[row.sku]?.category !== 'support' && num(row.batch_size) > 0)
      .map(mapSupabaseRecord);
    return rows.length ? sortRecords(rows) : [];
  } catch (err) {
    console.warn('coa-live-records-fallback', err?.message || err);
    return [];
  }
}

function tableRow(record) {
  const skus = record.skus?.length ? record.skus : [record.sku];
  const left = remaining(record);
  const action = record.url
    ? `<a href="${record.url}" target="_blank" rel="noopener noreferrer" class="coa-link">Verify externally</a>`
    : `<span class="coa-muted">${record.status === 'PENDING' ? 'Pending release' : 'Available on request'}</span>`;
  const statusDetail = record.status === 'REJECTED' && record.rejectionReason
    ? `<span>${escapeHtml(record.rejectionReason)}</span>`
    : '';
  return `
    <tr class="${record.status === 'REJECTED' ? 'coa-row-rejected' : ''}">
      <td>
        <strong>${escapeHtml(record.product)}</strong>
        <span>${escapeHtml(skus.join(' / '))}</span>
      </td>
      <td><code>${escapeHtml(record.batch)}</code></td>
      <td>${escapeHtml(displayPurity(record))}</td>
      <td><span class="coa-stock-number">${escapeHtml(record.batchSize || '—')}</span></td>
      <td><span class="coa-stock-number">${escapeHtml(record.soldCount || 0)}</span></td>
      <td><span class="coa-stock-left">${escapeHtml(record.batchSize ? left : '—')}</span></td>
      <td><span class="coa-status coa-status-${statusClass(record.status)}">${escapeHtml(record.statusLabel)}</span>${statusDetail}</td>
      <td>${escapeHtml(record.lab)}<span>${escapeHtml(record.method)}</span></td>
      <td>${escapeHtml(record.testDate)}</td>
      <td>${action}</td>
    </tr>
  `;
}

function mobileRecordCard(record) {
  const skus = record.skus?.length ? record.skus : [record.sku];
  const left = remaining(record);
  const rejected = record.status === 'REJECTED';
  const archived = isArchived(record);
  const product = PRODUCTS[record.sku] || {};
  const image = product.image || record.image || './images/og-ukmaxx.jpg';
  const action = record.url
    ? `<a href="${record.url}" target="_blank" rel="noopener noreferrer" class="coa-card-action">View certificate <span aria-hidden="true">↗</span></a>`
    : `<a href="${productUrl(record.sku)}" class="coa-card-action">View product</a>`;
  const secondaryAction = record.url
    ? `<a href="${productUrl(record.sku)}" class="coa-card-secondary">Product page</a>`
    : '';
  const statusText = rejected ? 'QC rejected' : archived ? 'Archived batch' : 'Verified batch';
  const leftText = record.batchSize ? `${left} left` : '—';

  return `
    <article class="coa-record-card ${rejected ? 'is-rejected' : ''}">
      <div class="coa-record-top">
        <div class="coa-record-media">
          <img src="${escapeHtml(image)}" alt="${escapeHtml(record.product)}" loading="lazy" width="88" height="110">
        </div>
        <div class="coa-record-main">
          <div class="coa-record-title-row">
            <div>
              <h3>${escapeHtml(record.product)}</h3>
              <p>${escapeHtml(skus.join(' / '))}</p>
            </div>
            <span class="coa-status coa-status-${statusClass(record.status)}">${escapeHtml(statusText)}</span>
          </div>
          <div class="coa-record-batch">
            <span>Batch</span>
            <code>${escapeHtml(record.batch)}</code>
          </div>
        </div>
      </div>
      ${rejected && record.rejectionReason ? `<div class="coa-reject-reason">${escapeHtml(record.rejectionReason)}</div>` : ''}
      <div class="coa-card-stats">
        <div><span>Purity / assay</span><strong>${escapeHtml(displayPurity(record))}</strong></div>
        <div><span>Batch size</span><strong>${escapeHtml(record.batchSize || '—')}</strong></div>
        <div><span>Test date</span><strong>${escapeHtml(record.testDate)}</strong></div>
        <div><span>${archived ? 'Remaining' : 'Available'}</span><strong class="${rejected ? '' : 'is-left'}">${escapeHtml(rejected ? 'Not released' : leftText)}</strong></div>
      </div>
      <div class="coa-card-meta">
        <div><span>Lab</span><strong>${escapeHtml(record.lab)}</strong></div>
        <div><span>Method</span><strong>${escapeHtml(record.method)}</strong></div>
        <div><span>Release</span><strong>${escapeHtml(rejected ? 'Not released' : archived ? 'Archived' : 'Current batch')}</strong></div>
      </div>
      <div class="coa-card-actions">
        ${action}
        ${secondaryAction}
      </div>
    </article>
  `;
}

function renderQuickStats(records) {
  const stats = byId('coaQuickStats');
  if (!stats) return;
  const tested = records.filter((record) => record.status === 'VERIFIED' || record.status === 'REJECTED' || record.status === 'ARCHIVED');
  const active = records.filter((record) => !isArchived(record) && record.status === 'VERIFIED');
  const rejected = records.filter(isRejected);
  const certificates = tested.filter((record) => Boolean(record.url));
  const items = [
    { value: active.length, label: 'Active batches', tone: 'blue', icon: 'shield' },
    { value: tested.length, label: 'Products tested', tone: 'green', icon: 'check' },
    { value: rejected.length, label: 'QC rejected', tone: 'red', icon: 'flask' },
    { value: certificates.length, label: 'Certificates', tone: 'purple', icon: 'file' },
  ];
  stats.innerHTML = items.map((item) => `
    <div class="coa-stat-chip coa-stat-${item.tone}">
      <span class="coa-stat-icon" aria-hidden="true">${statIcon(item.icon)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <em>${escapeHtml(item.label)}</em>
    </div>
  `).join('');
}

function statIcon(icon) {
  const icons = {
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 19 6v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-5"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>',
    flask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3h6"/><path d="M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6A2 2 0 0 0 19 18l-5-9V3"/><path d="M8 15h8"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></svg>',
  };
  return icons[icon] || icons.check;
}

function renderRows(records) {
  const activeTable = byId('coaTableBody');
  const archiveTable = byId('coaArchiveTableBody');
  const archiveSection = byId('coaArchiveSection');
  const rejectedTable = byId('coaRejectedTableBody');
  const rejectedSection = byId('coaRejectedSection');
  const activeCards = byId('coaMobileCards');
  const archiveCards = byId('coaArchiveMobileCards');
  const rejectedCards = byId('coaRejectedMobileCards');
  if (!activeTable) return;

  const rejected = records.filter(isRejected);
  const active = records.filter((record) => !isArchived(record) && !isRejected(record));
  const archived = records.filter(isArchived);
  renderQuickStats(records);

  activeTable.innerHTML = active.length
    ? active.map(tableRow).join('')
    : '<tr><td colspan="10" class="coa-muted">No active public COA records found.</td></tr>';
  if (activeCards) {
    activeCards.innerHTML = active.length
      ? active.map(mobileRecordCard).join('')
      : '<p class="coa-muted">No active public COA records found.</p>';
  }

  if (archiveTable && archiveSection) {
    archiveSection.hidden = archived.length === 0;
    archiveTable.innerHTML = archived.map(tableRow).join('');
    if (archiveCards) archiveCards.innerHTML = archived.map(mobileRecordCard).join('');
  }

  if (rejectedTable && rejectedSection) {
    rejectedSection.hidden = rejected.length === 0;
    rejectedTable.innerHTML = rejected.map(tableRow).join('');
    if (rejectedCards) rejectedCards.innerHTML = rejected.map(mobileRecordCard).join('');
  }
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

  const left = remaining(record);
  const isRejectedRecord = record.status === 'REJECTED';
  const availabilityPercent = record.batchSize
    ? Math.max(0, Math.min(100, Math.round((left / record.batchSize) * 100)))
    : 0;
  const action = record.url
    ? `<a class="btn btn-primary" href="${record.url}" target="_blank" rel="noopener noreferrer">Verify on ${escapeHtml(record.lab)}</a>`
    : `<a class="btn btn-ghost" href="${productUrl(record.sku)}">View product</a>`;

  return `
    <div class="coa-result ${isRejectedRecord ? 'is-rejected' : ''}">
      <div class="coa-result-kicker">${escapeHtml(record.statusLabel)}</div>
      <h3>${escapeHtml(record.product)}</h3>
      <code class="coa-result-batch">${escapeHtml(record.batch)}</code>
      ${isRejectedRecord ? `<p><strong>Release decision:</strong> This batch was not released for sale. ${escapeHtml(record.rejectionReason || 'It did not meet UKMAXX release standards.')}</p>` : ''}
      <div class="coa-result-grid">
        <div class="coa-result-tile is-lab"><span>Lab</span><strong>${escapeHtml(record.lab)}</strong></div>
        <div class="coa-result-tile is-method"><span>Method</span><strong>${escapeHtml(record.method)}</strong></div>
        <div class="coa-result-tile is-assay"><span>Purity / assay</span><strong>${escapeHtml(displayPurity(record))}</strong></div>
        <div class="coa-result-tile is-date"><span>Test date</span><strong>${escapeHtml(record.testDate)}</strong></div>
        ${record.labelClaim ? `<div class="coa-result-tile is-claim"><span>Label claim</span><strong>${escapeHtml(record.labelClaim)}</strong></div>` : ''}
        <div class="coa-result-tile is-size"><span>Batch size</span><strong>${escapeHtml(record.batchSize || '—')}</strong></div>
        <div class="coa-result-tile ${isRejectedRecord ? 'is-release-rejected' : 'is-certificate'}"><span>${isRejectedRecord ? 'Release' : 'Certificate'}</span><strong>${isRejectedRecord ? 'Not released' : 'Published'}</strong></div>
        <div class="coa-result-tile is-remaining"><span>Remaining</span><strong>${escapeHtml(isRejectedRecord ? 'Not released' : record.batchSize ? left : '—')}</strong></div>
        <div class="coa-result-tile is-status"><span>Status</span><strong>${escapeHtml(isRejectedRecord ? 'QC rejected' : isArchived(record) ? 'Archived' : 'Current batch')}</strong></div>
      </div>
      ${!isRejectedRecord && record.batchSize ? `
        <div class="coa-availability" style="--coa-availability:${availabilityPercent}%">
          <div class="coa-availability-copy"><span>Current availability</span><strong>${escapeHtml(left)} of ${escapeHtml(record.batchSize)} available</strong></div>
          <div class="coa-availability-track" aria-hidden="true"><span></span></div>
        </div>
      ` : ''}
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

  let records = localRecords();
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

  fetchSupabaseRecords().then((liveRecords) => {
    if (!liveRecords.length) return;
    records = liveRecords;
    renderRows(records);
    if (batch) runCheck(batch);
  });
}
