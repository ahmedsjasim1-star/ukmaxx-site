import { PRODUCTS, CATEGORIES } from '../data/products.js';
import { money } from '../utils/money.js';
import { $, $$, byId } from '../utils/dom.js';

const CATS = CATEGORIES;

function productCard(p, bundle = false) {
  const stockLow = p.stockCount && p.stockCount <= 10;
  const stockBadge = stockLow ? `<span class="badge badge-low">Only ${p.stockCount} left</span>` : `<span class="badge badge-stock">In stock</span>`;
  const bestBadge = p.featured ? `<span class="badge badge-best">★ ${bundle ? 'Best value' : 'Top seller'}</span>` : '';
  const saveBadge = p.originalPrice ? `<span class="badge badge-new">Save ${money(p.originalPrice - p.price)}</span>` : '';
  const rating = Number(p.rating || 5);
  const starsStr = '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating));
  const priceWrap = p.originalPrice
    ? `<div class="product-price-wrap"><div class="product-price"><span class="currency">£</span>${p.price.toFixed(2)}</div><span class="product-price-original">${money(p.originalPrice)}</span></div>`
    : `<div class="product-price"><span class="currency">£</span>${p.price.toFixed(2)}</div>`;
  return `<article class="product-card${p.featured ? ' is-featured' : ''}" data-sku="${p.id}">
    <div class="product-media">
      <img loading="lazy" src="${p.image}" alt="${p.name}" width="400" height="400">
      <div class="product-badges">${bestBadge}${saveBadge}${stockBadge}</div>
    </div>
    <div class="product-body">
      <div class="product-sku">${p.id} · ${p.shortName}</div>
      <h3 class="product-name"><a href="./product.html?sku=${p.id}">${p.name}</a></h3>
      <div class="product-rating">
        <span class="stars" aria-hidden="true">${starsStr}</span>
        <span><strong>${rating.toFixed(1)}</strong></span>
        <a class="count" href="#reviews">(${p.reviewCount} reviews)</a>
      </div>
      <p class="product-desc">${p.description}</p>
      <div class="product-attrs">
        <span class="product-attr"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg> ${p.purity} purity</span>
        <span class="product-attr">${p.coa.lab}</span>
      </div>
      <div class="product-foot">
        ${priceWrap}
        <button class="add-btn" data-add="${p.id}" aria-label="Add ${p.name} to basket">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          Add
        </button>
      </div>
    </div>
  </article>`;
}

export function renderProducts() {
  const grid = byId('productsGrid');
  const bgrid = byId('bundlesGrid');
  if (!grid) return;
  const all = Object.values(PRODUCTS);
  const bundles = all.filter(p => p.category === 'bundles');
  const products = all.filter(p => p.category !== 'bundles');
  if (bgrid) {
    bgrid.innerHTML = bundles.map(p => productCard(p, true)).join('');
    grid.innerHTML = products.map(p => productCard(p)).join('');
  } else {
    grid.innerHTML = all.map(p => productCard(p, p.category === 'bundles')).join('');
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
