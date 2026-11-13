// The page, figures and benchmarks remain usable without JavaScript.
const figureDialog = document.getElementById('figure-dialog');
const figureViewport = document.getElementById('figure-viewport');
const figureImage = document.getElementById('figure-image');
const figureTitle = document.getElementById('figure-title');
const figureCaption = document.getElementById('figure-caption');
const figureOriginal = document.getElementById('figure-original');

if (figureDialog?.showModal && figureViewport && figureImage && figureTitle && figureCaption && figureOriginal) {
  let figureOpener;

  for (const link of document.querySelectorAll('a[data-figure]')) {
    link.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const coordinates = (link.dataset.crop || '').split(',').map(value => value.trim());
      const [x, y, width, height] = coordinates.map(Number);
      const sourceWidth = Number(link.dataset.sourceWidth);
      const sourceHeight = Number(link.dataset.sourceHeight);
      // Invalid or absent crop metadata leaves the full-resolution link usable.
      if (coordinates.length !== 4 || coordinates.some(value => value === '') ||
          ![x, y, width, height, sourceWidth, sourceHeight].every(Number.isFinite) ||
          sourceWidth <= 0 || sourceHeight <= 0 || x < 0 || y < 0 || width <= 0 || height <= 0 ||
          x + width > sourceWidth || y + height > sourceHeight) return;

      event.preventDefault();
      figureOpener = link;
      const title = link.dataset.title || 'Paper figure';
      for (const [property, value] of Object.entries({
        '--crop-x': x, '--crop-y': y, '--crop-w': width, '--crop-h': height,
        '--source-w': sourceWidth, '--source-h': sourceHeight,
      })) figureViewport.style.setProperty(property, String(value));
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
