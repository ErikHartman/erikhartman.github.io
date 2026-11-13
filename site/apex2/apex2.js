// The page, figures and benchmarks remain usable without JavaScript.
const figureDialog = document.getElementById('figure-dialog');
const figureImage = document.getElementById('figure-image');
const figureTitle = document.getElementById('figure-title');
const figureCaption = document.getElementById('figure-caption');
const figureOriginal = document.getElementById('figure-original');

if (figureDialog?.showModal && figureImage && figureTitle && figureCaption && figureOriginal) {
  let figureOpener;

  for (const link of document.querySelectorAll('a[data-figure]')) {
    link.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      figureOpener = link;
      const title = link.dataset.title || 'Paper figure';
      figureImage.src = link.href;
      figureImage.alt = link.querySelector('img')?.alt || title;
      figureTitle.textContent = title;
      figureCaption.textContent = link.dataset.caption || '';
      figureOriginal.href = link.href;
      figureDialog.showModal();
    });
  }

  figureDialog.querySelector('[data-close-figure]')?.addEventListener('click', () => figureDialog.close());
  figureDialog.addEventListener('click', event => {
    if (event.target !== figureDialog) return;
    const bounds = figureDialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
      figureDialog.close();
    }
  });
  figureDialog.addEventListener('close', () => figureOpener?.focus({ preventScroll: true }));
}

if ('IntersectionObserver' in window) {
  const navigation = [...document.querySelectorAll('.section-nav a[href^="#"]')]
    .map(link => ({ link, section: document.getElementById(link.hash.slice(1)) }))
    .filter(item => item.section);
  const visible = new Set();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
    }
    const current = navigation.find(item => visible.has(item.section));
    if (!current) return;
    for (const item of navigation) {
      if (item === current) item.link.setAttribute('aria-current', 'location');
      else item.link.removeAttribute('aria-current');
    }
  }, { rootMargin: '-15% 0px -50% 0px' });
  for (const { section } of navigation) observer.observe(section);
}
