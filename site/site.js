const filters = document.querySelector('[data-publication-filters]');
if (filters) {
  filters.hidden = false;
  const search = filters.querySelector('input');
  const buttons = [...filters.querySelectorAll('[data-filter]')];
  const entries = [...document.querySelectorAll('[data-publication]')];
  const groups = [...document.querySelectorAll('[data-year-group]')];
  const count = document.querySelector('[data-result-count]');
  const empty = document.querySelector('[data-empty]');
  let type = 'All';
  function update() {
    const words = search.value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    let visible = 0;
    entries.forEach(entry => {
      const match = (type === 'All' || entry.dataset.type === type) && words.every(word => entry.dataset.search.includes(word));
      entry.hidden = !match;
      if (match) visible++;
    });
    groups.forEach(group => { group.hidden = ![...group.querySelectorAll('[data-publication]')].some(entry => !entry.hidden); });
    count.textContent = `${visible} ${visible === 1 ? 'publication' : 'publications'}`;
    empty.hidden = visible !== 0;
  }
  search.addEventListener('input', update);
  buttons.forEach(button => button.addEventListener('click', () => {
    type = button.dataset.filter;
    buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    update();
  }));
  document.querySelector('[data-reset]')?.addEventListener('click', () => {
    search.value = '';
    buttons[0].click();
    search.focus();
  });
  update();
}

document.querySelectorAll('[data-copy]').forEach(button => {
  if (!navigator.clipboard) return;
  button.hidden = false;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.parentElement.querySelector('code').textContent);
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Select the citation to copy';
    }
    setTimeout(() => { button.textContent = 'Copy BibTeX'; }, 2500);
  });
});

const publicationImages = document.querySelectorAll('[data-publication-image]');
if (publicationImages.length && typeof HTMLDialogElement !== 'undefined') {
  const dialog = document.createElement('dialog');
  dialog.className = 'figure-dialog';
  dialog.setAttribute('aria-labelledby', 'figure-dialog-title');
  dialog.innerHTML = `<div class="figure-dialog-header"><h2 id="figure-dialog-title"></h2><button type="button" autofocus>Close</button></div><figure><img alt=""><figcaption><p class="figure-dialog-caption"></p><p class="figure-dialog-credit"></p><a class="figure-dialog-source">Figure source</a></figcaption></figure>`;
  document.body.append(dialog);
  const close = () => dialog.close();
  dialog.querySelector('button').addEventListener('click', close);
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  });
  publicationImages.forEach(link => link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    dialog.querySelector('h2').textContent = link.dataset.title;
    const image = dialog.querySelector('img');
    image.src = link.href;
    image.alt = link.querySelector('img').alt;
    dialog.querySelector('.figure-dialog-caption').textContent = link.dataset.caption;
    const credit = dialog.querySelector('.figure-dialog-credit');
    credit.textContent = link.dataset.credit;
    if (link.dataset.licenseUrl) {
      const license = document.createElement('a');
      license.href = link.dataset.licenseUrl;
      license.textContent = link.dataset.license;
      credit.append(' · ', license);
    }
    credit.hidden = !credit.textContent;
    dialog.querySelector('.figure-dialog-source').href = link.dataset.source;
    dialog.showModal();
  }));
}
