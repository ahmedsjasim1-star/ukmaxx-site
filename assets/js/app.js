import { renderProducts, refreshProductReviewStats } from './modules/products.js?v=20260903-rt20-reprice';
import { renderReviews, setupReviewDrawer } from './modules/reviews.js?v=20260831-sold-out-ux';
import { renderCart, initCart } from './modules/cart.js?v=20260903-loyalty-rewards';
import { initAgeGate } from './modules/ageGate.js';
import { setupHeaderScroll, setupActiveNav, setupMobileStickyCta } from './modules/ui.js?v=20260813-catalogue';
import { setupLightbox } from './modules/lightbox.js?v=20260903-featured-rt20';
import { setupExitIntent } from './modules/exitIntent.js?v=20260831-sold-out-ux';
import { setupNewsletter } from './modules/newsletter.js';
import { initAuthGate, setupAuthForms, setupPasswordStrength, setupPasswordToggles, setupGoogleAuth, setupForgotPassword, setupProfileDropdown, initAuth } from './modules/auth.js?v=20260903-account-rewards-preview';
import { setupTracking } from './modules/tracking.js';
import { renderProductDetail, refreshProductDetailData, renderRelatedProducts } from './modules/productDetail.js?v=20260903-rt20-reprice';
import { setupAccountPage } from './modules/account.js?v=20260903-locked-rewards';
import { updateHeroBatchChips } from './modules/heroBatch.js?v=20260901-featured-rt20';
import { refreshLiveStock } from './data/products.js?v=20260903-rt20-reprice';
import { setupCoaPage } from './modules/coaPage.js?v=20260901-retatrutide-method';
import { setupAnalytics } from './modules/analytics.js?v=20260819-restore-traffic';
import { setupWhatsAppSupport } from './modules/whatsappSupport.js?v=20260822-international-enquiries';
import { setupHomeProof } from './modules/homeProof.js?v=20260903-shared-batch-stats';

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
  setupPasswordToggles();
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
