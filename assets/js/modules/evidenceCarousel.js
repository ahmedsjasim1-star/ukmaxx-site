const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function setupCarousel(root) {
  const viewport = root.querySelector('[data-carousel-viewport]');
  const slides = [...root.querySelectorAll('.sample-slide, .report-slide')];
  const previous = root.querySelector('[data-carousel-prev]');
  const next = root.querySelector('[data-carousel-next]');
  const dots = [...root.querySelectorAll('[data-carousel-go]')];
  if (!viewport || !slides.length) return;

  let activeIndex = 0;
  let scrollFrame = 0;

  function update(index) {
    activeIndex = Math.max(0, Math.min(slides.length - 1, index));
    if (previous) previous.disabled = activeIndex === 0;
    if (next) next.disabled = activeIndex === slides.length - 1;
    dots.forEach((dot, dotIndex) => {
      if (dotIndex === activeIndex) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  }

  function goTo(index) {
    const targetIndex = Math.max(0, Math.min(slides.length - 1, index));
    viewport.scrollTo({ left: slides[targetIndex].offsetLeft, behavior: reducedMotion ? 'auto' : 'smooth' });
    update(targetIndex);
  }

  previous?.addEventListener('click', () => goTo(activeIndex - 1));
  next?.addEventListener('click', () => goTo(activeIndex + 1));
  dots.forEach((dot) => dot.addEventListener('click', () => goTo(Number(dot.dataset.carouselGo))));
  viewport.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(activeIndex - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); goTo(activeIndex + 1); }
  });
  viewport.addEventListener('scroll', () => {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
      const index = slides.reduce((closest, slide, slideIndex) => (
        Math.abs(slide.offsetLeft - viewport.scrollLeft) < Math.abs(slides[closest].offsetLeft - viewport.scrollLeft)
          ? slideIndex
          : closest
      ), 0);
      update(index);
    });
  }, { passive: true });

  update(0);
}

function setupLightbox() {
  const lightbox = document.getElementById('evidenceLightbox');
  const image = lightbox?.querySelector('img');
  const close = lightbox?.querySelector('.evidence-lightbox-close');
  if (!lightbox || !image || !close) return;

  let lastTrigger = null;
  function hide() {
    lightbox.classList.remove('is-open');
    lightbox.setAttribute('aria-hidden', 'true');
    image.removeAttribute('src');
    document.body.style.removeProperty('overflow');
    lastTrigger?.focus();
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-lightbox-src]');
    if (!trigger) return;
    lastTrigger = trigger;
    image.src = trigger.dataset.lightboxSrc;
    image.alt = trigger.dataset.lightboxAlt || '';
    lightbox.classList.add('is-open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    close.focus();
  });
  close.addEventListener('click', hide);
  lightbox.addEventListener('click', (event) => { if (event.target === lightbox) hide(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && lightbox.classList.contains('is-open')) hide(); });
}

document.querySelectorAll('[data-carousel]').forEach(setupCarousel);
setupLightbox();
