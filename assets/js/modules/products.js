import { PRODUCTS, CATEGORIES, getCoaStatusLabel, getQualityLabel, getReleaseLabel, isPurchasable } from '../data/products.js?v=20260827-ghk-bundle';
import { money } from '../utils/money.js';
import { byId } from '../utils/dom.js';

const CATS = CATEGORIES;
const REVIEWS_ENDPOINT = '/api/track-order?type=reviews';
const CATALOGUE_CARD_CONTENT = {
  GHKCU: { chip: 'Copper peptide', className: 'catalogue-chip--ghk', description: 'Studied in copper signalling and extracellular-matrix research.' },
  BC5: { chip: 'Body protection compound', className: 'catalogue-chip--bpc', description: 'Studied in preclinical tissue-protection and repair models.' },
  NJ500: { chip: 'Coenzyme', className: 'catalogue-chip--nad', description: 'Studied in cellular energy, redox and mitochondrial research.' },
  RT10: { chip: 'Triple receptor agonist', className: 'catalogue-chip--reta', description: 'Targets GIP, GLP-1 and glucagon receptors in metabolic research.' },
  RT10X3: { chip: 'Research bundle', className: 'catalogue-chip--bundle', description: 'Three RT10 vials from one verified batch, plus one BAC Water.' },
  BC5X3: { chip: 'Research bundle', className: 'catalogue-chip--bundle', description: 'Three BPC-157 5mg vials from one verified batch, plus one BAC Water.' },
  GHKCUX3: { chip: 'Copper peptide bundle', className: 'catalogue-chip--bundle', description: 'Three GHK-Cu 50mg vials from one verified batch, plus one BAC Water.' },
  WA10: { chip: 'In stock', className: 'badge-stock', description: 'Support water for compatible laboratory reconstitution workflows.' },
};

export async function refreshProductReviewStats() {
  try {
    const res = await fetch(REVIEWS_ENDPOINT, { headers: { Accept: 'application/json' } });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    const rows = Array.isArray(data.reviews) ? data.reviews : [];
    const stats = {};
    rows.forEach((review) => {
      const sku = String(review.product || '').trim().toUpperCase();
      if (!PRODUCTS[sku]) return;
      if (!stats[sku]) stats[sku] = { count: 0, total: 0 };
      stats[sku].count += 1;
      stats[sku].total += Number(review.rating || 0);
    });
    Object.entries(stats).forEach(([sku, stat]) => {
      PRODUCTS[sku].reviewCount = stat.count;
      PRODUCTS[sku].rating = stat.count ? stat.total / stat.count : 0;
    });
    return true;
  } catch {
    return false;
  }
}

function productCard(p, bundle = false) {
  const catalogueMode = document.body?.dataset.catalogueCards === 'true';
  const catalogueContent = catalogueMode ? CATALOGUE_CARD_CONTENT[p.id] : null;
  const purchasable = isPurchasable(p);
  const stockLow = p.stockCount && p.stockCount <= 10;
  const stockUnit = p.category === 'bundles' ? 'bundles' : 'left';
  const stockBadge = catalogueMode
    ? ''
    : purchasable
    ? (stockLow ? `<span class="badge badge-low">Only ${p.stockCount} ${stockUnit}</span>` : `<span class="badge badge-stock">In stock</span>`)
    : `<span class="badge badge-coming">${p.coa?.status === 'REJECTED' ? 'Not available' : getReleaseLabel(p)}</span>`;
  const coaBadge = !p.coaUrl && !purchasable ? `<span class="badge badge-awaiting">${getCoaStatusLabel(p)}</span>` : '';
  const bestBadge = !catalogueMode && p.featured ? `<span class="badge badge-best">★ ${bundle ? 'Best value' : 'Featured'}</span>` : '';
  const comparisonPrice = Number(p.separatePrice || p.originalPrice || 0);
  const saveBadge = !catalogueMode && comparisonPrice > Number(p.price) ? `<span class="badge badge-new">Save ${money(comparisonPrice - p.price)}</span>` : '';
  const catalogueBadge = catalogueContent?.chip ? `<span class="badge catalogue-chip ${catalogueContent.className}">${catalogueContent.chip}</span>` : '';
  const rating = Number(p.rating || 0);
  const hasReviews = Number(p.reviewCount || 0) > 0 && rating > 0;
  const starsStr = hasReviews ? '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating)) : '';
  const primaryAttr = getQualityLabel(p);
  const secondaryAttr = purchasable ? p.coa.lab : getReleaseLabel(p);
  const attrs = [primaryAttr, secondaryAttr].filter((value, index, list) => value && list.indexOf(value) === index);
  const hasPrice = Number.isFinite(Number(p.price));
  const priceWrap = !hasPrice
    ? `<div class="product-price product-price--tbc">TBC</div>`
    : comparisonPrice > Number(p.price) && !p.separatePrice
    ? `<div class="product-price-wrap"><div class="product-price"><span class="currency">£</span>${p.price.toFixed(2)}</div><span class="product-price-original">${money(comparisonPrice)}</span></div>`
    : `<div class="product-price"><span class="currency">£</span>${p.price.toFixed(2)}</div>`;

  return `<article class="product-card${p.featured ? ' is-featured' : ''}" data-sku="${p.id}">
    <div class="product-media">
      <img loading="lazy" src="${p.image}" alt="${p.name}" width="400" height="400">
      <div class="product-badges">${catalogueBadge}${bestBadge}${saveBadge}${stockBadge}${coaBadge}</div>
    </div>
    <div class="product-body">
      <div class="product-sku">${p.id} · ${p.shortName}</div>
      <h3 class="product-name"><a href="./product.html?sku=${p.id}">${p.name}</a></h3>
      <div class="product-rating">
        ${hasReviews ? `<span class="stars" aria-hidden="true">${starsStr}</span><span><strong>${rating.toFixed(1)}</strong></span><a class="count" href="/#reviews">(${p.reviewCount} reviews)</a>` : '<span class="count">New batch · awaiting reviews</span>'}
      </div>
      <p class="product-desc">${catalogueContent?.description || p.description}</p>
      <div class="product-attrs">
        ${attrs.map((attr, index) => `<span class="product-attr">${index === 0 ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg> ' : ''}${attr}</span>`).join('')}
      </div>
      <div class="product-foot">
        ${priceWrap}
        <button class="add-btn${purchasable ? '' : ' is-disabled'}" ${purchasable ? `data-add="${p.id}" aria-label="Add ${p.name} to basket"` : `disabled aria-disabled="true" aria-label="${p.name} coming soon"`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          ${purchasable ? 'Add' : 'Soon'}
        </button>
      </div>
    </div>
  </article>`;
}

const CATALOGUE_ORDER = {
  WA10: 10,
  GHKCU: 20,
  BC5: 30,
  NJ500: 40,
  RT10: 50,
  RT10X3: 60,
  BC5X3: 70,
  GHKCUX3: 80,
  IP5: 90,
};

function productDisplayRank(p) {
  return isPurchasable(p) ? 0 : 1;
}

function sortForProductGrid(items) {
  return [...items].sort((a, b) =>
    productDisplayRank(a) - productDisplayRank(b) ||
    Number(CATALOGUE_ORDER[a.id] ?? a.sortOrder ?? 999) - Number(CATALOGUE_ORDER[b.id] ?? b.sortOrder ?? 999) ||
    a.name.localeCompare(b.name)
  );
}

export function renderProducts() {
  const grid = byId('productsGrid');
  const bgrid = byId('bundlesGrid');
  if (!grid) return;
  const excludedSkus = new Set(String(document.body?.dataset.excludedSkus || '').split(',').map(s => s.trim()).filter(Boolean));
  const all = Object.values(PRODUCTS).filter(p => !excludedSkus.has(p.id));
  const bundles = sortForProductGrid(all.filter(p => p.category === 'bundles'));
  const products = sortForProductGrid(all.filter(p => p.category !== 'bundles'));
  if (bgrid) {
    bgrid.innerHTML = bundles.map(p => productCard(p, true)).join('');
    grid.innerHTML = products.map(p => productCard(p)).join('');
  } else {
    grid.innerHTML = sortForProductGrid(all).map(p => productCard(p, p.category === 'bundles')).join('');
  }

  const tabs = byId('filterTabs');
  if (tabs) {
    const list = CATS.filter(c => c.id !== 'bundles');
    tabs.innerHTML = list.map(c =>
      `<button class="filter-tab${c.id === 'all' ? ' is-active' : ''}" data-cat="${c.id}" type="button" role="tab" aria-selected="${c.id === 'all'}">${c.label}</button>`
    ).join('');

    const applyFilter = (cat) => {
      tabs.querySelectorAll('.filter-tab').forEach(x => {
        const active = x.dataset.cat === cat;
        x.classList.toggle('is-active', active);
        x.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      grid.querySelectorAll('.product-card').forEach(card => {
        const p = PRODUCTS[card.dataset.sku];
        if (!p) return;
        const show = cat === 'all' || p.category === cat;
        card.style.display = show ? '' : 'none';
      });
    };

    tabs.querySelectorAll('.filter-tab').forEach(btn => btn.addEventListener('click', () => {
      applyFilter(btn.dataset.cat);
      const url = new URL(location.href);
      if (btn.dataset.cat === 'all') url.searchParams.delete('cat');
      else url.searchParams.set('cat', btn.dataset.cat);
      history.replaceState({}, '', url);
    }));

    const initialCat = new URLSearchParams(location.search).get('cat');
    if (initialCat && list.some(c => c.id === initialCat)) {
      applyFilter(initialCat);
    }
  }
}
