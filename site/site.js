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
