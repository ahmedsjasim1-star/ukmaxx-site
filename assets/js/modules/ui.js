import { PRODUCTS } from '../data/products.js';
import { money } from '../utils/money.js';
import { $, $$, byId } from '../utils/dom.js';
import { addSku } from './cart.js';

export function setupHeaderScroll() {
  const h = byId('siteHeader');
  if (!h) return;
  window.addEventListener('scroll', () => {
    h.classList.toggle('is-scrolled', window.scrollY > 8);
  }, { passive: true });
}

export function setupActiveNav() {
  const links = $$('.primary-nav .nav-link');
  const sections = links.map(l => {
    const h = l.getAttribute('href');
    if (!h || !h.startsWith('#')) return null;
    try { return document.querySelector(h); } catch { return null; }
  }).filter(Boolean);
  if (!sections.length) return;
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const id = '#' + e.target.id;
        links.forEach(l => l.classList.toggle('is-active', l.getAttribute('href') === id));
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  sections.forEach(s => obs.observe(s));
}

export function setupMobileStickyCta() {
  const products = byId('products');
  const cta = byId('mobileStickyCta');
  if (!products || !cta) return;
  const cards = [...document.querySelectorAll('#productsGrid .product-card')];
  const obs = new IntersectionObserver((entries) => {
    const visible = entries.filter(e => e.isIntersecting).map(e => e.target);
    if (visible.length) {
      const sku = visible[0].dataset.sku;
      const p = PRODUCTS[sku];
      if (p) {
        byId('msName').textContent = p.name;
        byId('msPrice').textContent = money(p.price);
        byId('msAdd').onclick = () => addSku(sku);
        cta.classList.add('is-shown');
        cta.setAttribute('aria-hidden', 'false');
      }
    } else {
      cta.classList.remove('is-shown');
      cta.setAttribute('aria-hidden', 'true');
    }
  }, { rootMargin: '-30% 0px -50% 0px', threshold: 0 });
  cards.forEach(c => obs.observe(c));
}
