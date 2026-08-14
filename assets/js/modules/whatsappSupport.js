import { trackEvent } from './analytics.js?v=20260730-admin-analytics';

const WHATSAPP_NUMBER = '447438637604';
const SUPPORT_MESSAGE = 'Hi UKMAXX, I need help with an order, tracking or batch verification.';

function elementIsDisplayed(element) {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

function supportShouldHide() {
  const classOverlays = [
    '#cartDrawer.is-open',
    '#checkoutBackdrop.is-open',
    '#exitBackdrop.is-open',
    '#lightboxBackdrop.is-open',
    '#ageGate.show',
  ];

  if (classOverlays.some((selector) => document.querySelector(selector))) return true;
  const cookieBanner = document.getElementById('cookieBanner');
  if (cookieBanner?.classList.contains('is-shown') || cookieBanner?.classList.contains('is-visible')) {
    if (elementIsDisplayed(cookieBanner)) return true;
  }
  if (document.body.classList.contains('age-gate-lock') || document.body.classList.contains('pre-gate')) return true;
  if (elementIsDisplayed(document.getElementById('reviewDrawer'))) return true;
  if (elementIsDisplayed(document.getElementById('successModal'))) return true;
  return false;
}

export function setupWhatsAppSupport() {
  if (document.getElementById('whatsappSupport')) return;

  const link = document.createElement('a');
  link.id = 'whatsappSupport';
  link.className = 'whatsapp-support';
  link.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(SUPPORT_MESSAGE)}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', 'Chat with UKMAXX support on WhatsApp');
  link.innerHTML = `
    <span class="whatsapp-support-icon" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="currentColor"><path d="M16.04 3C8.85 3 3 8.77 3 15.87c0 2.52.75 4.98 2.17 7.06L3.74 28l5.23-1.37a13.14 13.14 0 0 0 7.06 2.01h.01C23.23 28.64 29 22.87 29 15.77A12.86 12.86 0 0 0 16.04 3Zm0 23.47h-.01a10.93 10.93 0 0 1-5.56-1.52l-.4-.24-3.1.82.83-3-.26-.41a10.67 10.67 0 0 1-1.68-5.73c0-5.91 4.58-10.72 10.19-10.72 2.72 0 5.27 1.12 7.19 3.14a10.58 10.58 0 0 1 2.98 7.53c0 5.91-4.58 10.72-10.18 10.72Zm5.59-8.03c-.31-.16-1.82-.95-2.1-1.06-.28-.1-.49-.16-.69.16-.21.31-.8 1.05-.98 1.27-.18.21-.36.24-.67.08-.31-.16-1.29-.5-2.46-1.6a9.25 9.25 0 0 1-1.7-2.22c-.18-.31-.02-.48.13-.64.14-.14.31-.37.46-.56.15-.18.2-.31.31-.52.1-.21.05-.4-.03-.56-.08-.16-.69-1.75-.95-2.39-.25-.61-.5-.53-.69-.54h-.59c-.21 0-.54.08-.82.4-.28.31-1.08 1.11-1.08 2.71 0 1.59 1.11 3.13 1.26 3.35.15.21 2.18 3.5 5.28 4.9.74.34 1.31.54 1.76.69.74.25 1.41.21 1.94.13.59-.09 1.82-.78 2.08-1.54.26-.77.26-1.43.18-1.56-.08-.14-.28-.22-.59-.38Z"/></svg>
    </span>
    <span class="whatsapp-support-label whatsapp-support-label-full">Chat on WhatsApp</span>
    <span class="whatsapp-support-label whatsapp-support-label-short">WhatsApp</span>`;

  document.body.appendChild(link);
  document.body.classList.toggle('has-mobile-bottom-nav', Boolean(document.querySelector('.mobile-bottom-nav')));
  document.body.classList.toggle('has-pdp-mobile-bar', Boolean(document.querySelector('.pdp-mobile-bar')));

  link.addEventListener('click', () => {
    trackEvent('whatsapp_support_click');
  });

  let frame = 0;
  const syncVisibility = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const hidden = supportShouldHide();
      link.classList.toggle('is-hidden', hidden);
      link.setAttribute('aria-hidden', String(hidden));
      link.tabIndex = hidden ? -1 : 0;
    });
  };

  const observer = new MutationObserver(syncVisibility);
  observer.observe(document.body, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ['class', 'style', 'aria-hidden'],
  });

  syncVisibility();
  requestAnimationFrame(() => link.classList.add('is-ready'));
}
