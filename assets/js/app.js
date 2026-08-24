import { renderProducts, refreshProductReviewStats } from './modules/products.js?v=20260819-seo-clusters';
import { renderReviews, setupReviewDrawer } from './modules/reviews.js?v=20260824-verified-review-photos';
import { renderCart, initCart } from './modules/cart.js?v=20260819-restore-traffic';
import { initAgeGate } from './modules/ageGate.js';
import { setupHeaderScroll, setupActiveNav, setupMobileStickyCta } from './modules/ui.js?v=20260813-catalogue';
import { setupLightbox } from './modules/lightbox.js';
import { setupExitIntent } from './modules/exitIntent.js?v=20260625-alerts';
import { setupNewsletter } from './modules/newsletter.js';
import { initAuthGate, setupAuthForms, setupPasswordStrength, setupGoogleAuth, setupForgotPassword, setupProfileDropdown, initAuth } from './modules/auth.js?v=20260819-restore-traffic';
import { setupTracking } from './modules/tracking.js';
import { renderProductDetail, refreshProductDetailData, renderRelatedProducts } from './modules/productDetail.js?v=20260823-live-stock-fix';
import { setupAccountPage } from './modules/account.js?v=20260731-account-reorder';
import { updateHeroBatchChips } from './modules/heroBatch.js?v=20260813-catalogue';
import { refreshLiveStock } from './data/products.js?v=20260819-seo-clusters';
import { setupCoaPage } from './modules/coaPage.js?v=20260816-stat-links';
import { setupAnalytics } from './modules/analytics.js?v=20260819-restore-traffic';
import { setupWhatsAppSupport } from './modules/whatsappSupport.js?v=20260822-international-enquiries';
import { setupHomeProof } from './modules/homeProof.js?v=20260816-home-depth';

document.addEventListener('DOMContentLoaded', () => {
  setupAnalytics();
  setupWhatsAppSupport();
  setupHomeProof();
  initAuth();
  initAgeGate();

  // Paint bundled product data immediately. Live stock and verified review
  // totals are refreshed in parallel below, so the catalogue never waits on
  // two network requests before becoming useful.
  updateHeroBatchChips();
  renderProducts();
  renderReviews();
  setupReviewDrawer();
  renderCart();
  initCart();
  renderProductDetail();
  renderRelatedProducts();
  setupHeaderScroll();
  setupActiveNav();
  setupMobileStickyCta();
  setupLightbox();
  setupExitIntent();
  import('./modules/siteNotice.js?v=20260819-restore-traffic').then(({ setupCookieBanner }) => setupCookieBanner()).catch(() => {});
  setupNewsletter();
  initAuthGate();
  setupAuthForms();
  setupPasswordStrength();
  setupGoogleAuth();
  setupForgotPassword();
  setupProfileDropdown();
  setupTracking();
  setupAccountPage();
  setupCoaPage();

  Promise.all([refreshLiveStock(), refreshProductReviewStats()]).then(([stockUpdated, reviewsUpdated]) => {
    if (!stockUpdated && !reviewsUpdated) return;
    updateHeroBatchChips();
    renderProducts();
    renderCart();
    refreshProductDetailData();
    renderRelatedProducts();
  }).catch(() => {});
});
