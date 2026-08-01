import { COA, PRODUCTS, getCoaStatusLabel, getReleaseLabel } from '../data/products.js';
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
    assayResult: row.assay_result || '',
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
    displayOrder: num(row.display_order) || 100,
  };
}

function sortRecords(records) {
  const rank = { VERIFIED: 0, INTERNAL_QC: 1, PENDING: 2, ARCHIVED: 3, REJECTED: 4 };
  return [...records].sort((a, b) => {
    return (rank[a.status] ?? 9) - (rank[b.status] ?? 9)
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

function renderRows(records) {
  const activeTable = byId('coaTableBody');
  const archiveTable = byId('coaArchiveTableBody');
  const archiveSection = byId('coaArchiveSection');
  const rejectedTable = byId('coaRejectedTableBody');
  const rejectedSection = byId('coaRejectedSection');
  if (!activeTable) return;

  const rejected = records.filter(isRejected);
  const active = records.filter((record) => !isArchived(record) && !isRejected(record));
  const archived = records.filter(isArchived);

  activeTable.innerHTML = active.length
    ? active.map(tableRow).join('')
    : '<tr><td colspan="10" class="coa-muted">No active public COA records found.</td></tr>';

  if (archiveTable && archiveSection) {
    archiveSection.hidden = archived.length === 0;
    archiveTable.innerHTML = archived.map(tableRow).join('');
  }

  if (rejectedTable && rejectedSection) {
    rejectedSection.hidden = rejected.length === 0;
    rejectedTable.innerHTML = rejected.map(tableRow).join('');
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
  const action = record.url
    ? `<a class="btn btn-primary" href="${record.url}" target="_blank" rel="noopener noreferrer">Verify on ${escapeHtml(record.lab)}</a>`
    : `<a class="btn btn-ghost" href="${productUrl(record.sku)}">View product</a>`;

  return `
    <div class="coa-result ${record.status === 'REJECTED' ? 'is-rejected' : ''}">
      <div class="coa-result-kicker">${escapeHtml(record.statusLabel)}</div>
      ${record.status === 'REJECTED' ? `<p><strong>Release decision:</strong> This batch was not released for sale. ${escapeHtml(record.rejectionReason || 'It did not meet UKMAXX release standards.')}</p>` : ''}
      <h3>${escapeHtml(record.product)} · ${escapeHtml(record.batch)}</h3>
      <div class="coa-result-grid">
        <div><span>Lab</span><strong>${escapeHtml(record.lab)}</strong></div>
        <div><span>Method</span><strong>${escapeHtml(record.method)}</strong></div>
        <div><span>Purity / assay</span><strong>${escapeHtml(displayPurity(record))}</strong></div>
        <div><span>Test date</span><strong>${escapeHtml(record.testDate)}</strong></div>
        ${record.labelClaim ? `<div><span>Label claim</span><strong>${escapeHtml(record.labelClaim)}</strong></div>` : ''}
        <div><span>Batch size</span><strong>${escapeHtml(record.batchSize || '—')}</strong></div>
        <div><span>Sold</span><strong>${escapeHtml(record.soldCount || 0)}</strong></div>
        <div><span>Remaining</span><strong>${escapeHtml(record.batchSize ? left : '—')}</strong></div>
        <div><span>Status</span><strong>${escapeHtml(record.status === 'REJECTED' ? 'QC rejected' : isArchived(record) ? 'Archived' : 'Current batch')}</strong></div>
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
