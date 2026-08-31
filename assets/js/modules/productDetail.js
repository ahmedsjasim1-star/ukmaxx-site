import { PRODUCTS, DETAIL_DATA, RESEARCH_FOCUS, FURTHER_READING, SAMPLE_REVIEWS, getCoaStatusLabel, getQualityLabel, getReleaseLabel, isPurchasable } from '../data/products.js?v=20260831-rt20';
import { money, tpStars } from '../utils/money.js';
import { $, $$, byId } from '../utils/dom.js';
import { renderProductReviewsSummary } from './reviews.js?v=20260827-bundle-chips';

const PRODUCT_POSITIONING = {
  GHKCU: { label: 'Copper peptide', className: 'positioning-badge--ghk' },
  BC5: { label: 'Body protection compound', className: 'positioning-badge--bpc' },
  NJ500: { label: 'Coenzyme', className: 'positioning-badge--nad' },
  RT10: { label: 'Triple receptor agonist', className: 'positioning-badge--reta' },
  RT10X3: { label: 'Triple receptor bundle', className: 'positioning-badge--reta' },
  RT20: { label: 'Triple receptor agonist', className: 'positioning-badge--reta' },
  RT20X3: { label: 'Triple receptor bundle', className: 'positioning-badge--reta' },
  BC5X3: { label: 'Body protection bundle', className: 'positioning-badge--bpc' },
  GHKCUX3: { label: 'Copper peptide bundle', className: 'positioning-badge--ghk' },
  UKXRB1: { label: 'Signature research bundle', className: 'positioning-badge--bundle' },
};

const BUNDLE_CONTENTS = {
  RT10X3: ['3× Retatrutide 10mg vials', '1× 10ml BAC Water vial'],
  RT20X3: ['3× Retatrutide 20mg vials', '1× 10ml BAC Water vial'],
  BC5X3: ['3× BPC-157 5mg vials', '1× 10ml BAC Water vial'],
  GHKCUX3: ['3× GHK-Cu 50mg vials', '1× 10ml BAC Water vial'],
  UKXRB1: ['1× RETA 10mg vial', '1× BPC-157 5mg vial', '1× GHK-Cu 50mg vial', '1× 10ml BAC Water vial'],
};

function productPositioningBadge(product) {
  if (!product) return '';
  if (product.id === 'WA10') return '<span class="badge badge-stock">In stock</span>';
  const positioning = PRODUCT_POSITIONING[product.id];
  return positioning
    ? '<span class="badge positioning-badge ' + positioning.className + '">' + positioning.label + '</span>'
    : '';
}

export function renderProductDetail() {
  const root = byId('pdpRoot');
  if (root) { renderPdpProduct(root); setupDispatchCountdown(); return; }
  const container = byId('productDetail');
  if (!container) return;
  const params = new URLSearchParams(location.search);
  const sku = params.get('sku');
  const p = PRODUCTS[sku];
  if (!p) { container.innerHTML = '<div class="product-404"><h2>Product not found</h2><p>This product does not exist or has been removed.</p><a class="btn btn-dark" href="/">Back to shop</a></div>'; return; }
  const d = DETAIL_DATA[sku] || {};
  const purchasable = isPurchasable(p);
  const priceLabel = Number.isFinite(Number(p.price)) ? money(p.price) : 'TBC';
  const rating = Number(p.rating || 0);
  const hasReviews = Number(p.reviewCount || 0) > 0 && rating > 0;
  const starsStr = hasReviews ? '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating)) : '';
  container.innerHTML = `<div class="pd-layout">
    <div class="pd-gallery">
      <div class="pd-main-img"><img src="${p.image}" alt="${p.name}" width="600" height="600"></div>
    </div>
    <div class="pd-info">
      <div class="pd-sku">${p.id} · ${p.shortName}</div>
      <h1 class="pd-title">${p.name}</h1>
      <div class="pd-rating">
        ${hasReviews ? `
        <span class="stars" aria-hidden="true">${starsStr}</span>
        <span><strong>${rating.toFixed(1)}</strong></span>
        <a class="count" href="#reviews">(${p.reviewCount} reviews)</a>` : '<span class="count">New batch · awaiting reviews</span>'}
      </div>
      <div class="pd-price-row">
        <span class="pd-price">${priceLabel}</span>
        ${p.originalPrice ? `<span class="pd-price-original">${money(p.originalPrice)}</span><span class="pd-badge">Save ${money(p.originalPrice - p.price)}</span>` : ''}
      </div>
      <div class="pd-desc">${p.description}</div>
      <div class="pd-attrs">
        <div class="pd-attr"><strong>Quality</strong><span>${getQualityLabel(p)}</span></div>
        <div class="pd-attr"><strong>Batch</strong><span>${p.batch}</span></div>
        <div class="pd-attr"><strong>Lab</strong><span>${p.coa?.status === 'REJECTED' ? p.coa.lab : purchasable ? p.coa.lab : 'Awaiting COA'}</span></div>
        <div class="pd-attr"><strong>Method</strong><span>${purchasable ? p.coa.method : getReleaseLabel(p)}</span></div>
        <div class="pd-attr"><strong>Status</strong><span class="stock-${p.stock}">${purchasable ? `${p.stockCount} ${p.category === 'bundles' ? 'bundles' : 'vials'}` : getReleaseLabel(p)}</span></div>
      </div>
      <button class="btn btn-dark btn-lg" ${purchasable ? `data-add="${p.id}"` : 'disabled aria-disabled="true"'}>${purchasable ? `Add to basket — ${priceLabel}` : `${getReleaseLabel(p)} — ${getCoaStatusLabel(p)}`}</button>
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
    <div class="pd-tab-content" data-tab="coa"><pre class="pd-pre">${(p.coaUrl || p.coa?.status === 'VERIFIED' ? d.coa : 'Awaiting COA — Third-party certificate of analysis pending for this product.')}</pre></div>
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

export function refreshProductDetailData() {
  const root = byId('pdpRoot');
  if (root) {
    renderPdpProduct(root);
    return;
  }
  if (byId('productDetail')) renderProductDetail();
}

function launchChecklist(product, purchasable) {
  if (!product || product.id === 'WA10' || !purchasable) return [];
  const lab = product.coa?.lab === 'Janoshik Analytical' ? 'Janoshik tested' : 'Third-party tested';
  if (Array.isArray(product.coas) && product.coas.length) {
    return [
      product.coas.length + ' Janoshik records',
      product.coas.length + ' batch-specific COAs',
      'UK stock',
      'Royal Mail Tracked 24',
      'Failed batches published'
    ];
  }
  return [
    lab,
    'Batch-specific COA',
    'UK stock',
    'Royal Mail Tracked 24',
    'Failed batches published'
  ];
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
  const purchasable = isPurchasable(p);
  const priceLabel = Number.isFinite(Number(p.price)) ? money(p.price) : 'TBC';
  const rating = Number(p.rating || 0);
  const hasReviews = Number(p.reviewCount || 0) > 0 && rating > 0;
  const productUrl = 'https://www.ukmaxx.co.uk/product.html?sku=' + encodeURIComponent(sku);
  const productImage = absoluteUrl(p.image);
  const qualityLabel = getQualityLabel(p);
  const metaTitle = p.seoTitle || (p.name + ' | UK Research Peptides | UKMAXX');
  const metaDescription = p.seoDescription || `${p.name}: ${p.description} ${qualityLabel}. UK stocked with Royal Mail Tracked 24 dispatch. Research use only.`;
  const metaKeywords = buildProductKeywords(p);
  setText('pageTitle', metaTitle);
  setAttr('pageDesc', 'content', metaDescription);
  setAttr('pageKeywords', 'content', metaKeywords);
  setText('ogTitle', metaTitle);
  setAttr('ogDesc', 'content', metaDescription);
  setAttr('ogUrl', 'content', productUrl);
  setAttr('ogImage', 'content', productImage);
  setAttr('twitterTitle', 'content', metaTitle);
  setAttr('twitterDesc', 'content', metaDescription);
  setAttr('twitterImage', 'content', productImage);
  setAttr('canonical', 'href', productUrl);

  const jsonLd = byId('productJsonLd');
  if (jsonLd) {
    const productSchema = {
      '@context': 'https://schema.org/',
      '@type': 'Product',
      name: p.name,
      ...(Array.isArray(p.aliases) && p.aliases.length ? { alternateName: p.aliases } : {}),
      url: productUrl,
      mainEntityOfPage: productUrl,
      image: productImage,
      description: metaDescription,
      sku: p.id,
      mpn: p.id,
      category: p.category,
      brand: { '@type': 'Brand', name: 'UKMAXX' },
      additionalProperty: [
        { '@type': 'PropertyValue', name: 'Batch', value: p.batch || '' },
        { '@type': 'PropertyValue', name: 'Quality', value: qualityLabel },
        { '@type': 'PropertyValue', name: 'COA status', value: getCoaStatusLabel(p) },
        { '@type': 'PropertyValue', name: 'Research use', value: 'Laboratory and in-vitro research use only. Not for human consumption.' }
      ].filter(function (prop) { return prop.value; }),
      offers: {
        '@type': 'Offer',
        url: productUrl,
        priceCurrency: 'GBP',
        ...(Number.isFinite(Number(p.price)) ? { price: p.price } : {}),
        availability: p.stock === 'in_stock' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        itemCondition: 'https://schema.org/NewCondition',
        seller: { '@type': 'Organization', name: 'UKMAXX', url: 'https://www.ukmaxx.co.uk/' },
        shippingDetails: {
          '@type': 'OfferShippingDetails',
          shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'GB' },
          shippingRate: { '@type': 'MonetaryAmount', value: '4.99', currency: 'GBP' },
          deliveryTime: {
            '@type': 'ShippingDeliveryTime',
            handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 1, unitCode: 'DAY' },
            transitTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 2, unitCode: 'DAY' }
          }
        },
        hasMerchantReturnPolicy: {
          '@type': 'MerchantReturnPolicy',
          applicableCountry: 'GB',
          returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted'
        }
      }
    };
    if (hasReviews) {
      productSchema.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: rating.toFixed(1),
        reviewCount: Number(p.reviewCount || 0)
      };
    }
    jsonLd.textContent = JSON.stringify(productSchema);
  }

  setText('pdpBreadcrumbCurrent', p.name);
  setText('pdpSku', p.id + ' \u00B7 ' + p.shortName);
  setText('pdpName', p.name);
  const hasNumericPrice = Number.isFinite(Number(p.price));
  setText('pdpPrice', hasNumericPrice ? p.price.toFixed(2) : 'TBC');
  const pdpCurrency = $('#pdpPriceRow .currency');
  if (pdpCurrency) pdpCurrency.style.display = hasNumericPrice ? '' : 'none';

  const comparisonPrice = Number(p.separatePrice || p.originalPrice || 0);
  if (comparisonPrice > Number(p.price)) {
    const origEl = byId('pdpPriceOriginal');
    if (origEl) {
      if (p.separatePrice) {
        origEl.style.display = 'none';
      } else {
        origEl.textContent = money(comparisonPrice);
        origEl.classList.remove('is-separate');
        origEl.style.display = '';
      }
    }
    const saveEl = byId('pdpSaveBadge');
    if (saveEl) { saveEl.textContent = 'Save ' + money(comparisonPrice - p.price); saveEl.style.display = ''; }
  } else {
    const origEl = byId('pdpPriceOriginal');
    if (origEl) origEl.style.display = 'none';
    const saveEl = byId('pdpSaveBadge');
    if (saveEl) saveEl.style.display = 'none';
  }

  const checklistEl = byId('pdpChecklist');
  if (checklistEl) {
    const checklist = launchChecklist(p, purchasable);
    checklistEl.style.display = checklist.length ? '' : 'none';
    checklistEl.innerHTML = checklist.map(function (item) {
      return '<span><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>' + item + '</span>';
    }).join('');
  }

  const starsWrap = byId('pdpStarsWrap');
  if (starsWrap) {
    const full = hasReviews ? Math.round(rating) : 0;
    let h = '';
    for (let i = 0; i < full; i++) h += '<i class="s-full"></i>';
    for (let i = full; i < 5; i++) h += '<i class="s-empty"></i>';
    starsWrap.innerHTML = h;
    starsWrap.style.display = hasReviews ? '' : 'none';
  }
  setText('pdpRating', hasReviews ? rating.toFixed(1) : 'New batch');
  setText('pdpReviewCount', hasReviews ? p.reviewCount + ' reviews' : 'Awaiting verified reviews');
  setText('pdpStockText', purchasable ? 'In stock' : getReleaseLabel(p));
  setText('pdpStockSub', purchasable ? '\u00B7 ' + p.stockCount + ' ' + (p.category === 'bundles' ? 'bundles' : 'vials') + ' ready' : '\u00B7 ' + getCoaStatusLabel(p));
  const stockDot = $('.pdp-stock-dot', root);
  if (stockDot) stockDot.className = 'pdp-stock-dot stock-' + p.stock;

  const specsMini = byId('pdpSpecsMini');
  if (specsMini) {
    specsMini.innerHTML = Array.isArray(p.coas) && p.coas.length
      ? '<span>Evidence: <strong>' + p.coas.length + ' published COAs</strong></span><span>Batches: <strong>' + p.coas.length + ' independently tracked</strong></span><span>Lab: <strong>Janoshik Analytical</strong></span>'
      : purchasable
      ? '<span>Quality: <strong>' + getQualityLabel(p) + '</strong></span><span>Batch: <strong>' + p.batch + '</strong></span><span>Lab: <strong>' + p.coa.lab + '</strong></span>'
      : '<span>Status: <strong>' + getReleaseLabel(p) + '</strong></span><span>COA: <strong>' + getCoaStatusLabel(p) + '</strong></span>';
  }

  const galleryImg = byId('pdpGalleryImg');
  if (galleryImg) { galleryImg.src = p.image; galleryImg.alt = p.name; }
  const galleryBadges = byId('pdpGalleryBadges');
  if (galleryBadges) {
    galleryBadges.innerHTML = purchasable
      ? productPositioningBadge(p)
      : '<span class="badge badge-coming">' + getReleaseLabel(p) + '</span><span class="badge badge-awaiting">' + getCoaStatusLabel(p) + '</span>';
  }
  const galleryThumbs = byId('pdpGalleryThumbs');
  if (galleryThumbs) {
    const galleryItems = Array.isArray(p.gallery) && p.gallery.length ? p.gallery : [
        { src: p.image, alt: p.name, label: p.name },
        ...(p.coaSampleImage ? [{ src: p.coaSampleImage, alt: p.name + ' Janoshik sample photo', label: 'Sample photo' }] : []),
        ...(p.coaImage ? [{ src: p.coaImage, alt: p.name + ' COA report', label: 'COA report' }] : []),
      ];
    const thumbs = p.id === 'UKXRB1'
      ? galleryItems.filter(function (thumb) { return thumb.label !== 'RETA sample'; })
      : galleryItems;
    galleryThumbs.classList.toggle('has-many', thumbs.length > 4);
    galleryThumbs.innerHTML = thumbs.map(function (thumb, index) {
      return '<button class="pdp-thumb' + (index === 0 ? ' is-active' : '') + '" type="button" aria-label="' + thumb.label + '" data-img="' + thumb.src + '" data-alt="' + thumb.alt + '"><img src="' + thumb.src + '" alt="' + thumb.alt + '" width="80" height="64" loading="lazy"></button>';
    }).join('');
    galleryThumbs.querySelectorAll('.pdp-thumb').forEach(function (thumb) {
      thumb.onclick = function () {
        if (galleryImg) {
          galleryImg.src = thumb.dataset.img || p.image;
          galleryImg.alt = thumb.dataset.alt || p.name;
        }
        galleryThumbs.querySelectorAll('.pdp-thumb').forEach(function (btn) { btn.classList.remove('is-active'); });
        thumb.classList.add('is-active');
      };
    });
  }

  const addBtn = byId('pdpAddBtn');
  const addBtnLabel = byId('pdpAddBtnLabel');
  if (addBtn) {
    if (purchasable) {
      addBtn.dataset.add = p.id;
      addBtn.dataset.qtyInput = 'pdpQtyInput';
      addBtn.disabled = false;
      if (addBtnLabel) addBtnLabel.textContent = 'Add to basket';
    } else {
      delete addBtn.dataset.add;
      delete addBtn.dataset.qtyInput;
      addBtn.disabled = true;
      if (addBtnLabel) addBtnLabel.textContent = getReleaseLabel(p);
    }
  }
  setText('pdpMobileName', p.name);
  setText('pdpMobilePrice', priceLabel);
  const mobileAdd = byId('pdpMobileAdd');
  if (mobileAdd) {
    if (purchasable) {
      mobileAdd.dataset.add = p.id;
      mobileAdd.dataset.qtyInput = 'pdpMobileQtyInput';
      mobileAdd.disabled = false;
      setText('pdpMobileAddLabel', 'Add');
    } else {
      delete mobileAdd.dataset.add;
      delete mobileAdd.dataset.qtyInput;
      mobileAdd.disabled = true;
      setText('pdpMobileAddLabel', 'Soon');
    }
  }

  const dec = byId('pdpQtyDec');
  const inc = byId('pdpQtyInc');
  const inp = byId('pdpQtyInput');
  const clamp = (v) => Math.max(1, Math.min(99, Number(v) || 1));
  const sync = () => { if (inp) inp.value = clamp(inp.value); };
  if (dec) dec.onclick = () => { if (inp) inp.value = clamp(Number(inp.value) - 1); sync(); };
  if (inc) inc.onclick = () => { if (inp) inp.value = clamp(Number(inp.value) + 1); sync(); };
  if (inp) inp.onchange = sync;

  const mDec = byId('pdpMobileQtyDec');
  const mInc = byId('pdpMobileQtyInc');
  const mInp = byId('pdpMobileQtyInput');
  const mSync = () => { if (mInp) mInp.value = clamp(mInp.value); };
  if (mDec) mDec.onclick = () => { if (mInp) mInp.value = clamp(Number(mInp.value) - 1); mSync(); };
  if (mInc) mInc.onclick = () => { if (mInp) mInp.value = clamp(Number(mInp.value) + 1); mSync(); };
  if (mInp) mInp.onchange = mSync;

  const buyNowBtn = byId('pdpBuyNow');
  if (buyNowBtn) {
    buyNowBtn.disabled = !purchasable;
    buyNowBtn.innerHTML = purchasable
      ? '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Buy now — secure checkout'
      : getReleaseLabel(p) + ' — ' + getCoaStatusLabel(p);
    buyNowBtn.onclick = purchasable ? function () {
      const qty = Number(byId('pdpQtyInput')?.value || 1);
      window.addSkuQty(p.id, qty);
      setTimeout(function () {
        if (typeof window.openCheckout === 'function') {
          window.openCheckout();
        } else {
          byId('cartBtn')?.click();
        }
      }, 300);
    } : null;
  }

  const upsellSkus = ['RT10', 'BC5', 'IP5', 'GHKCU', 'NJ500'];
  const upsell = byId('pdpUpsell');
  if (upsellSkus.includes(sku)) {
    if (upsell) upsell.style.display = '';
    const upsellBtn = byId('pdpUpsellBtn');
    if (upsellBtn) upsellBtn.onclick = function () { window.addSku('WA10'); };
  } else {
    if (upsell) upsell.style.display = 'none';
  }

  const overviewText = byId('pdpOverviewText');
  if (overviewText) {
    overviewText.innerHTML = Array.isArray(p.coas) && p.coas.length
      ? '<p>' + p.description + '</p><p>The three compounds are each connected to a separate released batch and original <strong>Janoshik Analytical</strong> report. Open the verification section below to compare every assay, purity result and batch code.</p>'
      : purchasable
      ? (p.id === 'WA10'
        ? '<p>' + p.description + '</p><p>Quality: <strong>' + getQualityLabel(p) + '</strong>. Batch: <strong>' + p.batch + '</strong>.</p>'
        : '<p>' + p.description + '</p><p>This batch was independently tested by <strong>' + p.coa.lab + '</strong> using <strong>' + p.coa.method + '</strong>. Purity verified at <strong>' + p.purity + '</strong>. Batch: <strong>' + p.batch + '</strong>.</p>')
      : (p.coa?.status === 'REJECTED'
        ? '<p>' + p.description + '</p><p><strong>' + getReleaseLabel(p) + '.</strong> The tested batch was QC rejected and not released for sale. A new batch will be listed after it passes UKMAXX release checks.</p>'
        : '<p>' + p.description + '</p><p><strong>' + getReleaseLabel(p) + '.</strong> This product is awaiting its COA before release, so ordering is disabled until the batch documentation is ready.</p>');
  }
  const featureList = byId('pdpFeatureList');
  if (featureList) {
    let features = BUNDLE_CONTENTS[sku] ? [...BUNDLE_CONTENTS[sku]] : [
      '1\u00D7 ' + p.name + ' vial',
    ];
    features = features.concat([
      'Discreet, tamper-evident packaging',
      'Free UK Tracked 24 over \u00A3100'
    ]);
    featureList.innerHTML = features.map(function (f) {
      return '<li><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> ' + f + '</li>';
    }).join('');
  }

  const scienceText = byId('pdpScienceText');
  if (scienceText) {
    const focus = RESEARCH_FOCUS[sku] || d.science || 'Research data available upon request.';
    scienceText.innerHTML = '<p>' + focus + '</p>' + renderFurtherReading(FURTHER_READING[sku]);
  }

  const specsGrid = byId('pdpSpecsGrid');
  if (specsGrid && d.specs) {
    specsGrid.innerHTML = d.specs.split('\n').map(function (line) {
      var parts = line.split(':');
      if (parts.length < 2) return '<div class="pdp-spec-row"><span class="pdp-spec-value" style="grid-column:1/-1">' + line + '</span></div>';
      return '<div class="pdp-spec-row"><span class="pdp-spec-label">' + parts[0].trim() + '</span><span class="pdp-spec-value">' + parts.slice(1).join(':').trim() + '</span></div>';
    }).join('');
  }

  const coaRows = byId('pdpCoaRows');
  const coaHeading = byId('pdpCoaHeading');
  const coaSubheading = byId('pdpCoaSubheading');
  if (coaRows) {
    if (Array.isArray(p.coas) && p.coas.length) {
      if (coaHeading) coaHeading.textContent = 'Three batches, independently verified';
      if (coaSubheading) coaSubheading.textContent = 'Each compound links to its own Janoshik Analytical record';
      coaRows.innerHTML = p.coas.map(function (record) {
        return '<article class="pdp-multi-coa"><div><span>' + record.product + '</span><strong>' + record.batch + '</strong></div><dl><div><dt>Result</dt><dd>' + record.result + '</dd></div><div><dt>Purity</dt><dd>' + record.purity + '</dd></div><div><dt>Method</dt><dd>' + record.method + '</dd></div></dl><a href="' + record.url + '" target="_blank" rel="noopener">Open Janoshik record →</a></article>';
      }).join('');
    } else if (d.coa && (p.coaUrl || p.coa?.status === 'VERIFIED' || p.coa?.status === 'REJECTED')) {
      if (coaHeading) coaHeading.textContent = 'This batch has been third-party verified';
      if (coaSubheading) coaSubheading.textContent = 'Independent laboratory analysis by Janoshik Analytical';
      coaRows.innerHTML = d.coa.split('\n').map(function (line) {
        var parts = line.split(':');
        if (parts.length < 2) return '';
        return '<div class="pdp-coa-row"><strong>' + parts[0].trim() + '</strong><span>' + parts.slice(1).join(':').trim() + '</span></div>';
      }).join('');
    } else {
      if (coaHeading) coaHeading.textContent = 'Batch verification pending';
      if (coaSubheading) coaSubheading.textContent = 'This product is unavailable until its verification record is published';
      coaRows.innerHTML = '<div class="pdp-coa-row" style="opacity:.6;font-style:italic"><strong>Awaiting COA</strong><span>Third-party certificate of analysis pending for this product.</span></div>';
    }
  }
  var coaCertImg = byId('pdpCoaCertImg');
  var coaCertParent = coaCertImg ? coaCertImg.closest('.pdp-coa-cert') : null;
  if (p.coaImage) {
    if (coaCertImg) { coaCertImg.src = p.coaImage; coaCertImg.alt = p.name + ' COA'; }
    if (coaCertParent) coaCertParent.style.display = '';
  } else {
    if (coaCertParent) coaCertParent.style.display = 'none';
  }
  var coaViewBtn = byId('pdpCoaView');
  var coaCtaWrap = coaViewBtn ? coaViewBtn.closest('.pdp-coa-cta') : null;
  if (Array.isArray(p.coas) && p.coas.length) {
    if (coaCtaWrap) coaCtaWrap.innerHTML = '<div class="left"><strong>Three independent records</strong>Each compound remains linked to its own released batch and original report.</div><a class="btn btn-ghost" href="/coa.html">Open batch checker</a>';
  } else if (!p.coaUrl && !p.coaImage) {
    if (coaCtaWrap) coaCtaWrap.innerHTML = p.coa?.status === 'VERIFIED'
      ? '<div class="left"><strong>' + getQualityLabel(p) + '</strong> Batch quality details are listed above.</div>'
      : '<div class="left"><strong>Awaiting COA</strong> Certificate of analysis pending for this product.</div>';
  } else if (coaViewBtn) {
    coaViewBtn.onclick = function () {
      if (p.coaUrl) { window.open(p.coaUrl, '_blank', 'noopener'); return; }
      var lb = byId('lightboxOverlay') || byId('lbBackdrop');
      var img = byId('lightboxImg') || byId('lbImg');
      if (lb && img) { img.src = p.coaImage || ''; img.alt = p.name + ' COA'; lb.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
    };
  }

  setText('pdpScoreNum', hasReviews ? rating.toFixed(1) : '—');
  var scoreStars = byId('pdpScoreStars');
  if (scoreStars) {
    var sh = '';
    for (var i = 0; i < (hasReviews ? Math.round(rating) : 0); i++) sh += '<i></i>';
    for (var i = (hasReviews ? Math.round(rating) : 0); i < 5; i++) sh += '<i class="empty"></i>';
    scoreStars.innerHTML = sh;
    scoreStars.style.display = hasReviews ? '' : 'none';
  }
  setText('pdpScoreText', hasReviews ? p.reviewCount + ' verified reviews' : 'Verified customer feedback coming soon');

  var rbList = byId('pdpRbList');
  if (rbList) {
    rbList.innerHTML = '';
    if (hasReviews) {
      var basePct = Math.round(rating / 5 * 80);
      for (var s = 5; s >= 1; s--) {
        var barPct = s <= Math.round(rating) ? Math.max(20, basePct + (s - Math.round(rating)) * 5) : Math.max(5, basePct - (Math.round(rating) - s) * 10);
        rbList.innerHTML += '<div class="pdp-rb-row"><span class="pdp-rb-label">' + s + '</span><div class="pdp-rb-bar"><div class="pdp-rb-bar-fill" style="width:' + barPct + '%"></div></div><span class="pdp-rb-pct">' + barPct + '%</span></div>';
      }
    } else {
      rbList.innerHTML = '<p class="pdp-reviews-empty">No verified reviews yet for this product.</p>';
    }
  }

  var reviewsList = byId('pdpReviewsList');
  if (reviewsList) {
    var productReviews = SAMPLE_REVIEWS.filter(function (r) { return r.product === p.id || r.product === p.name; });
    if (productReviews.length) {
      reviewsList.innerHTML = productReviews.map(function (r) {
        return '<article class="review-card"><div class="review-card-head"><span>' + r.product + '</span><span>' + r.date + '</span></div>' + tpStars(Number(r.rating) || 5) + '<div class="review-card-badge"><svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Verified order</div><p class="review-card-text">' + r.text + '</p><div class="review-card-author">\u2014 ' + r.initials + '</div></article>';
      }).join('');
    } else {
      reviewsList.innerHTML = '<p class="pdp-reviews-empty">No reviews yet for this product.</p>';
    }
  }

  var relatedGrid = byId('pdpRelated');
  if (relatedGrid) {
    var related = Object.values(PRODUCTS).filter(function (x) { return x.id !== p.id && isPurchasable(x) && (x.category === p.category || x.category === 'support'); }).slice(0, 4);
    relatedGrid.innerHTML = related.map(function (r) {
      return '<article class="product-card" data-sku="' + r.id + '"><div class="product-media"><img loading="lazy" src="' + r.image + '" alt="' + r.name + '" width="400" height="400"><div class="product-badges">' + productPositioningBadge(r) + '</div></div><div class="product-body"><h3 class="product-name"><a href="./product.html?sku=' + r.id + '">' + r.name + '</a></h3><div class="product-rating"><span class="count">New batch · awaiting reviews</span></div><div class="product-foot"><div class="product-price"><span class="currency">\u00A3</span>' + r.price.toFixed(2) + '</div><button class="add-btn" data-add="' + r.id + '" aria-label="Add ' + r.name + ' to basket"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div></div></article>';
    }).join('');
  }

  setupPdpTabs();
  renderProductReviewsSummary(p.id);
}

function buildProductKeywords(product) {
  const base = [
    'UK peptides',
    'ukpeptides',
    'research peptides UK',
    'UK research compounds',
    'COA verified peptides',
    'biohacking UK',
    'biohack UK',
    'Royal Mail Tracked 24 dispatch'
  ];
  return [...new Set([...(product?.aliases || []), product?.name, product?.shortName, product?.id, product?.batch, ...base].filter(Boolean))].join(', ');
}

function getUkTimeParts() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(new Date()).reduce(function (acc, part) {
    if (part.type !== 'literal') acc[part.type] = Number(part.value);
    return acc;
  }, {});
  return {
    hour: Number(parts.hour || 0),
    minute: Number(parts.minute || 0),
    second: Number(parts.second || 0)
  };
}

function formatDispatchCountdown(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return hours + 'h ' + String(minutes).padStart(2, '0') + 'm';
  return Math.max(1, minutes) + 'm';
}

function setupDispatchCountdown() {
  const el = byId('pdpDispatchCountdown');
  if (!el) return;
  const update = function () {
    const uk = getUkTimeParts();
    const secondsNow = (uk.hour * 3600) + (uk.minute * 60) + uk.second;
    const secondsUntilCutoff = (14 * 3600) - secondsNow;
    el.textContent = secondsUntilCutoff > 0
      ? 'Free over £100 · order within ' + formatDispatchCountdown(secondsUntilCutoff) + ' for same-day dispatch'
      : 'Free over £100 · order before 2PM UK time for same-day dispatch';
  };
  update();
  setInterval(update, 60000);
}

function renderFurtherReading(links) {
  if (!Array.isArray(links) || !links.length) return '';
  return '<div class="pdp-reading-card">'
    + '<div class="pdp-reading-kicker">Further reading</div>'
    + '<p>Independent research links for context. These are educational references, not usage guidance.</p>'
    + '<div class="pdp-reading-links">'
    + links.map(function (link) {
      var external = /^https?:\/\//i.test(link.url);
      return '<a href="' + link.url + '"' + (external ? ' target="_blank" rel="noopener noreferrer"' : '') + '>'
        + '<span>' + link.label + '</span>'
        + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>'
        + '</a>';
    }).join('')
    + '</div>'
    + '</div>';
}

function setupPdpTabs() {
  var tabContainer = byId('pdpTabs');
  var sections = byId('pdpSections');
  if (!tabContainer || !sections) return;
  if (tabContainer.dataset.initialized === 'true') return;
  tabContainer.dataset.initialized = 'true';
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

function absoluteUrl(path) {
  if (!path) return 'https://www.ukmaxx.co.uk/images/og-ukmaxx.jpg?v=20260708-products';
  if (/^https?:\/\//i.test(path)) return path;
  return 'https://www.ukmaxx.co.uk/' + String(path).replace(/^\.?\//, '');
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
  var related = Object.values(PRODUCTS).filter(function (x) { return x.id !== p.id && isPurchasable(x) && (x.category === p.category || x.category === 'support'); }).slice(0, 4);
  grid.innerHTML = related.map(function (r) {
    return '<article class="product-card" data-sku="' + r.id + '"><div class="product-media"><img loading="lazy" src="' + r.image + '" alt="' + r.name + '" width="400" height="400"><div class="product-badges">' + productPositioningBadge(r) + '</div></div><div class="product-body"><h3 class="product-name"><a href="./product.html?sku=' + r.id + '">' + r.name + '</a></h3><div class="product-rating"><span class="count">New batch · awaiting reviews</span></div><div class="product-foot"><div class="product-price"><span class="currency">\u00A3</span>' + r.price.toFixed(2) + '</div><button class="add-btn" data-add="' + r.id + '" aria-label="Add ' + r.name + ' to basket"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div></div></article>';
  }).join('');
}
