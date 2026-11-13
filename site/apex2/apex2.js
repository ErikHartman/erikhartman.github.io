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
