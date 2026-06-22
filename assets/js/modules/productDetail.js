import { requireAuth } from './auth.js';
import { PRODUCTS, DETAIL_DATA, SAMPLE_REVIEWS } from '../data/products.js';
import { money, tpStars } from '../utils/money.js';
import { $, $$, byId } from '../utils/dom.js';

export function renderProductDetail() {
  const root = byId('pdpRoot');
  if (root) { renderPdpProduct(root); return; }
  const container = byId('productDetail');
  if (!container) return;
  const params = new URLSearchParams(location.search);
  const sku = params.get('sku');
  const p = PRODUCTS[sku];
  if (!p) { container.innerHTML = '<div class="product-404"><h2>Product not found</h2><p>This product does not exist or has been removed.</p><a class="btn btn-dark" href="/">Back to shop</a></div>'; return; }
  const d = DETAIL_DATA[sku] || {};
  const starsStr = '★'.repeat(Math.round(p.rating)) + '☆'.repeat(5 - Math.round(p.rating));
  container.innerHTML = `<div class="pd-layout">
    <div class="pd-gallery">
      <div class="pd-main-img"><img src="${p.image}" alt="${p.name}" width="600" height="600"></div>
    </div>
    <div class="pd-info">
      <div class="pd-sku">${p.id} · ${p.shortName}</div>
      <h1 class="pd-title">${p.name}</h1>
      <div class="pd-rating">
        <span class="stars" aria-hidden="true">${starsStr}</span>
        <span><strong>${p.rating.toFixed(1)}</strong></span>
        <a class="count" href="#reviews">(${p.reviewCount} reviews)</a>
      </div>
      <div class="pd-price-row">
        <span class="pd-price">${money(p.price)}</span>
        ${p.originalPrice ? `<span class="pd-price-original">${money(p.originalPrice)}</span><span class="pd-badge">Save ${money(p.originalPrice - p.price)}</span>` : ''}
      </div>
      <div class="pd-desc">${p.description}</div>
      <div class="pd-attrs">
        <div class="pd-attr"><strong>Purity</strong><span>${p.purity}</span></div>
        <div class="pd-attr"><strong>Batch</strong><span>${p.batch}</span></div>
        <div class="pd-attr"><strong>Lab</strong><span>${p.coa.lab}</span></div>
        <div class="pd-attr"><strong>Method</strong><span>${p.coa.method}</span></div>
        <div class="pd-attr"><strong>Stock</strong><span class="stock-${p.stock}">${p.stockCount > 0 ? `${p.stockCount} vials` : p.stock}</span></div>
      </div>
      <button class="btn btn-dark btn-lg" data-add="${p.id}">Add to basket — ${money(p.price)}</button>
    </div>
  </div>
  <div class="pd-tabs">
    <div class="pd-tab-nav">
      <button class="pd-tab-btn is-active" data-tab="science">Science</button>
      <button class="pd-tab-btn" data-tab="specs">Specifications</button>
      <button class="pd-tab-btn" data-tab="coa">COA</button>
    </div>
    <div class="pd-tab-content is-active" data-tab="science"><p>${(d.science || 'Research data available upon request.')}</p></div>
    <div class="pd-tab-content" data-tab="specs"><pre class="pd-pre">${(d.specs || 'Specifications available upon request.')}</pre></div>
    <div class="pd-tab-content" data-tab="coa"><pre class="pd-pre">${(d.coa || 'COA available upon request.')}</pre></div>
  </div>`;
  container.querySelectorAll('.pd-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.pd-tab-btn').forEach(b => b.classList.remove('is-active'));
      container.querySelectorAll('.pd-tab-content').forEach(c => c.classList.remove('is-active'));
      btn.classList.add('is-active');
      container.querySelector(`.pd-tab-content[data-tab="${btn.dataset.tab}"]`)?.classList.add('is-active');
    });
  });
}

function renderPdpProduct(root) {
  const params = new URLSearchParams(location.search);
  const sku = params.get('sku') || 'RT10';
  const p = PRODUCTS[sku];
  const loading = byId('pdpLoading');
  const notFound = byId('pdpNotFound');
  const content = byId('pdpContent');
  const tabs = byId('pdpTabs');
  const sections = byId('pdpSections');

  if (!p) {
    if (loading) loading.style.display = 'none';
    if (notFound) notFound.style.display = '';
    if (content) content.style.display = 'none';
    return;
  }

  if (loading) loading.style.display = 'none';
  if (notFound) notFound.style.display = 'none';
  if (content) content.style.display = '';
  if (tabs) tabs.style.display = '';
  if (sections) sections.style.display = '';

  const d = DETAIL_DATA[sku] || {};
  setText('pageTitle', p.name + ' \u2014 UKMAXX');
  setAttr('pageDesc', 'content', p.name + ': ' + p.description + ' Third-party verified.');
  setText('ogTitle', p.name + ' \u2014 UKMAXX');
  setAttr('ogDesc', 'content', p.description);
  setAttr('canonical', 'href', 'https://ukmaxx-site-5tc7.vercel.app/product.html?sku=' + sku);

  const jsonLd = byId('productJsonLd');
  if (jsonLd) {
    jsonLd.textContent = JSON.stringify({
      '@context': 'https://schema.org/',
      '@type': 'Product',
      name: p.name,
      image: p.image,
      description: p.description,
      sku: p.id,
      brand: { '@type': 'Brand', name: 'UKMAXX' },
      offers: {
        '@type': 'Offer',
        url: 'https://ukmaxx-site-5tc7.vercel.app/product.html?sku=' + sku,
        priceCurrency: 'GBP',
        price: p.price,
        availability: p.stock === 'in_stock' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
      }
    });
  }

  setText('pdpBreadcrumbCurrent', p.name);
  setText('pdpSku', p.id + ' \u00B7 ' + p.shortName);
  setText('pdpName', p.name);
  setText('pdpPrice', p.price.toFixed(2));

  if (p.originalPrice) {
    const origEl = byId('pdpPriceOriginal');
    if (origEl) { origEl.textContent = money(p.originalPrice); origEl.style.display = ''; }
    const saveEl = byId('pdpSaveBadge');
    if (saveEl) { saveEl.textContent = 'Save ' + money(p.originalPrice - p.price); saveEl.style.display = ''; }
  } else {
    const origEl = byId('pdpPriceOriginal');
    if (origEl) origEl.style.display = 'none';
    const saveEl = byId('pdpSaveBadge');
    if (saveEl) saveEl.style.display = 'none';
  }

  const starsWrap = byId('pdpStarsWrap');
  if (starsWrap) {
    const full = Math.round(p.rating);
    let h = '';
    for (let i = 0; i < full; i++) h += '<i class="s-full"></i>';
    for (let i = full; i < 5; i++) h += '<i class="s-empty"></i>';
    starsWrap.innerHTML = h;
  }
  setText('pdpRating', p.rating.toFixed(1));
  setText('pdpReviewCount', p.reviewCount + ' reviews');
  setText('pdpStockText', p.stock === 'in_stock' ? 'In stock' : 'Out of stock');
  setText('pdpStockSub', p.stock === 'in_stock' ? '\u00B7 ' + p.stockCount + ' vials ready' : '');
  const stockDot = $('.pdp-stock-dot', root);
  if (stockDot) stockDot.className = 'pdp-stock-dot stock-' + p.stock;

  const specsMini = byId('pdpSpecsMini');
  if (specsMini) {
    specsMini.innerHTML = '<span>Purity: <strong>' + p.purity + '</strong></span><span>Batch: <strong>' + p.batch + '</strong></span><span>Lab: <strong>' + p.coa.lab + '</strong></span>';
  }

  const galleryImg = byId('pdpGalleryImg');
  if (galleryImg) { galleryImg.src = p.image; galleryImg.alt = p.name; }
  const galleryBadges = byId('pdpGalleryBadges');
  if (galleryBadges) {
    galleryBadges.innerHTML = '<span class="badge badge-stock">In stock</span>' + (p.featured ? '<span class="badge badge-featured">Bestseller</span>' : '');
  }
  const galleryThumbs = byId('pdpGalleryThumbs');
  if (galleryThumbs) {
    galleryThumbs.innerHTML = '<button class="pdp-thumb is-active" aria-label="' + p.name + '"><img src="' + p.image + '" alt="' + p.name + '" width="80" height="64" loading="lazy"></button>';
  }

  const addBtn = byId('pdpAddBtn');
  const addBtnLabel = byId('pdpAddBtnLabel');
  if (addBtn) { addBtn.dataset.add = p.id; if (addBtnLabel) addBtnLabel.textContent = 'Add to basket'; }
  setText('pdpMobileName', p.name);
  setText('pdpMobilePrice', money(p.price));
  const mobileAdd = byId('pdpMobileAdd');
  if (mobileAdd) mobileAdd.dataset.add = p.id;

  const dec = byId('pdpQtyDec');
  const inc = byId('pdpQtyInc');
  const inp = byId('pdpQtyInput');
  const clamp = (v) => Math.max(1, Math.min(99, Number(v) || 1));
  const sync = () => { if (inp) inp.value = clamp(inp.value); };
  if (dec) dec.addEventListener('click', () => { if (inp) inp.value = clamp(Number(inp.value) - 1); sync(); });
  if (inc) inc.addEventListener('click', () => { if (inp) inp.value = clamp(Number(inp.value) + 1); sync(); });
  if (inp) inp.addEventListener('change', sync);

  const mDec = byId('pdpMobileQtyDec');
  const mInc = byId('pdpMobileQtyInc');
  const mInp = byId('pdpMobileQtyInput');
  const mSync = () => { if (mInp) mInp.value = clamp(mInp.value); };
  if (mDec) mDec.addEventListener('click', () => { if (mInp) mInp.value = clamp(Number(mInp.value) - 1); mSync(); });
  if (mInc) mInc.addEventListener('click', () => { if (mInp) mInp.value = clamp(Number(mInp.value) + 1); mSync(); });
  if (mInp) mInp.addEventListener('change', mSync);

  byId('pdpBuyNow')?.addEventListener('click', async () => {
    if (!(await requireAuth())) return;
    const qty = Number(byId('pdpQtyInput')?.value || 1);
    window.addSkuQty(p.id, qty);
    setTimeout(function () { window.openCheckout(); }, 300);
  });

  const upsellSkus = ['RT10', 'BC5', 'IP5', 'NJ500'];
  const upsell = byId('pdpUpsell');
  if (upsellSkus.includes(sku)) {
    if (upsell) upsell.style.display = '';
    byId('pdpUpsellBtn')?.addEventListener('click', function () { window.addSku('WA10'); });
  } else {
    if (upsell) upsell.style.display = 'none';
  }

  const overviewText = byId('pdpOverviewText');
  if (overviewText) {
    overviewText.innerHTML = '<p>' + p.description + '</p><p>Each vial independently tested by <strong>' + p.coa.lab + '</strong> using <strong>' + p.coa.method + '</strong>. Purity verified at <strong>' + p.purity + '</strong>. Batch: <strong>' + p.batch + '</strong>.</p>';
  }
  const featureList = byId('pdpFeatureList');
  if (featureList) {
    let features = [
      '1\u00D7 ' + p.name + ' vial',
      'Batch ' + p.batch + ' \u2014 ' + p.purity + ' purity',
      'COA verified by ' + p.coa.lab + ' (' + p.coa.method + ')',
      'Insulated cold-chain packaging',
      'Free UK Tracked 24 over \u00A3100'
    ];
    if (sku === 'RT10X3') { features.unshift('3\u00D7 Retatrutide 10mg vials', '3\u00D7 10ml BAC Water vials'); }
    featureList.innerHTML = features.map(function (f) {
      return '<li><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> ' + f + '</li>';
    }).join('');
  }

  const scienceText = byId('pdpScienceText');
  if (scienceText) scienceText.innerHTML = '<p>' + (d.science || 'Research data available upon request.') + '</p>';

  const specsGrid = byId('pdpSpecsGrid');
  if (specsGrid && d.specs) {
    specsGrid.innerHTML = d.specs.split('\n').map(function (line) {
      var parts = line.split(':');
      if (parts.length < 2) return '<div class="pdp-spec-row"><span class="pdp-spec-value" style="grid-column:1/-1">' + line + '</span></div>';
      return '<div class="pdp-spec-row"><span class="pdp-spec-label">' + parts[0].trim() + '</span><span class="pdp-spec-value">' + parts.slice(1).join(':').trim() + '</span></div>';
    }).join('');
  }

  const coaRows = byId('pdpCoaRows');
  if (coaRows && d.coa) {
    coaRows.innerHTML = d.coa.split('\n').map(function (line) {
      var parts = line.split(':');
      if (parts.length < 2) return '';
      return '<div class="pdp-coa-row"><strong>' + parts[0].trim() + '</strong><span>' + parts.slice(1).join(':').trim() + '</span></div>';
    }).join('');
  }
  byId('pdpCoaView')?.addEventListener('click', function () {
    var lb = byId('lightboxOverlay');
    var img = byId('lightboxImg');
    if (lb && img) { img.src = './images/coa-certificate.jpg'; img.alt = p.name + ' COA'; lb.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
  });

  setText('pdpScoreNum', p.rating.toFixed(1));
  var scoreStars = byId('pdpScoreStars');
  if (scoreStars) {
    var sh = '';
    for (var i = 0; i < Math.round(p.rating); i++) sh += '<i></i>';
    for (var i = Math.round(p.rating); i < 5; i++) sh += '<i class="empty"></i>';
    scoreStars.innerHTML = sh;
  }
  setText('pdpScoreText', p.reviewCount + ' verified reviews');

  var rbList = byId('pdpRbList');
  if (rbList) {
    var basePct = Math.round(p.rating / 5 * 80);
    rbList.innerHTML = '';
    for (var s = 5; s >= 1; s--) {
      var barPct = s <= Math.round(p.rating) ? Math.max(20, basePct + (s - Math.round(p.rating)) * 5) : Math.max(5, basePct - (Math.round(p.rating) - s) * 10);
      rbList.innerHTML += '<div class="pdp-rb-row"><span class="pdp-rb-label">' + s + '</span><div class="pdp-rb-bar"><div class="pdp-rb-bar-fill" style="width:' + barPct + '%"></div></div><span class="pdp-rb-pct">' + barPct + '%</span></div>';
    }
  }

  var reviewsList = byId('pdpReviewsList');
  if (reviewsList) {
    var productReviews = SAMPLE_REVIEWS.filter(function (r) { return r.product === p.id || r.product === p.name; });
    if (productReviews.length) {
      reviewsList.innerHTML = productReviews.map(function (r) {
        return '<article class="review-card"><div class="review-card-head"><span>' + r.product + '</span><span>' + r.date + '</span></div>' + tpStars(Number(r.rating) || 5) + '<div class="review-card-badge"><svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Verified \u00B7 Trustpilot</div><p class="review-card-text">' + r.text + '</p><div class="review-card-author">\u2014 ' + r.initials + '</div></article>';
      }).join('');
    } else {
      reviewsList.innerHTML = '<p class="pdp-reviews-empty">No reviews yet for this product.</p>';
    }
  }

  var relatedGrid = byId('pdpRelated');
  if (relatedGrid) {
    var related = Object.values(PRODUCTS).filter(function (x) { return x.id !== p.id && (x.category === p.category || x.category === 'support'); }).slice(0, 4);
    relatedGrid.innerHTML = related.map(function (r) {
      return '<article class="product-card" data-sku="' + r.id + '"><div class="product-media"><img loading="lazy" src="' + r.image + '" alt="' + r.name + '" width="400" height="400"><div class="product-badges"><span class="badge badge-stock">In stock</span></div></div><div class="product-body"><h3 class="product-name"><a href="./product.html?sku=' + r.id + '">' + r.name + '</a></h3><div class="product-rating"><span class="stars" aria-hidden="true">' + '\u2605'.repeat(Math.round(r.rating)) + '\u2606'.repeat(5 - Math.round(r.rating)) + '</span><span>' + r.rating.toFixed(1) + '</span></div><div class="product-foot"><div class="product-price"><span class="currency">\u00A3</span>' + r.price.toFixed(2) + '</div><button class="add-btn" data-add="' + r.id + '" aria-label="Add ' + r.name + ' to basket"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div></div></article>';
    }).join('');
  }

  setupPdpTabs();
}

function setupPdpTabs() {
  var tabContainer = byId('pdpTabs');
  var sections = byId('pdpSections');
  if (!tabContainer || !sections) return;
  var tabBtns = tabContainer.querySelectorAll('.pdp-tab');
  var targetMap = {};
  tabBtns.forEach(function (btn) {
    var id = btn.dataset.target;
    targetMap[id] = byId(id);
    btn.addEventListener('click', function () {
      var el = targetMap[btn.dataset.target];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  var onScroll = function () {
    var current = tabBtns[0] ? tabBtns[0].dataset.target : '';
    var scrollY = window.scrollY + 130;
    Object.keys(targetMap).forEach(function (id) {
      var el = targetMap[id];
      if (el && el.offsetTop <= scrollY) current = id;
    });
    tabBtns.forEach(function (btn) {
      var active = btn.dataset.target === current;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  var header = byId('siteHeader');
  if (header) {
    var h = header.offsetHeight;
    var stickyFn = function () {
      var rect = sections.getBoundingClientRect();
      tabContainer.classList.toggle('is-stuck', rect.top <= h);
    };
    window.addEventListener('scroll', stickyFn, { passive: true });
    stickyFn();
  }
}

function setText(id, text) {
  var el = byId(id);
  if (el) el.textContent = text;
}
function setAttr(id, attr, value) {
  var el = byId(id);
  if (el) el.setAttribute(attr, value);
}

export function renderRelatedProducts() {
  var grid = byId('relatedGrid');
  if (!grid) return;
  var params = new URLSearchParams(location.search);
  var sku = params.get('sku');
  var p = PRODUCTS[sku];
  if (!p) return;
  var related = Object.values(PRODUCTS).filter(function (x) { return x.id !== p.id && (x.category === p.category || x.category === 'support'); }).slice(0, 4);
  grid.innerHTML = related.map(function (r) {
    return '<article class="product-card" data-sku="' + r.id + '"><div class="product-media"><img loading="lazy" src="' + r.image + '" alt="' + r.name + '" width="400" height="400"><div class="product-badges"><span class="badge badge-stock">In stock</span></div></div><div class="product-body"><h3 class="product-name"><a href="./product.html?sku=' + r.id + '">' + r.name + '</a></h3><div class="product-rating"><span class="stars" aria-hidden="true">' + '\u2605'.repeat(Math.round(r.rating)) + '\u2606'.repeat(5 - Math.round(r.rating)) + '</span><span>' + r.rating.toFixed(1) + '</span></div><div class="product-foot"><div class="product-price"><span class="currency">\u00A3</span>' + r.price.toFixed(2) + '</div><button class="add-btn" data-add="' + r.id + '" aria-label="Add ' + r.name + ' to basket"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div></div></article>';
  }).join('');
}
