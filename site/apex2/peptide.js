// Reuse the homepage's local ASCII renderer for Peptide F (PDB 1PEF).
const host = document.querySelector('[data-ascii-peptide]');
if (host) loadPeptide();

async function loadPeptide() {
  const figure = host.closest('.peptide-figure') || host.parentElement;
  const status = figure.querySelector('[data-peptide-status]');
  const spinButton = figure.querySelector('[data-peptide-spin]');
  const resetButton = figure.querySelector('[data-peptide-reset]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let view, spinning = false, visible = true;
  host.tabIndex = 0;
  host.setAttribute('aria-busy', 'true');
  if (status) {
    status.hidden = false;
    status.textContent = 'Loading peptide…';
  }

  try {
    const [{ createAsciiFold }, { parsePDB }, response] = await Promise.all([
      import('/vendor/ascii-fold/engine.js'),
      import('/vendor/ascii-fold/parse.js'),
      fetch('/structures/1pef.pdb'),
    ]);
    if (!response.ok) throw new Error('Peptide structure unavailable');
    const text = await response.text();
    const peptide = parsePDB(text.split(/\r?\n/)
      .filter(line => !line.startsWith('ATOM  ') || line[21] === 'A').join('\n'));
    if (peptide.chain !== 'A' || peptide.rows.length < 5) throw new Error('Peptide chain not found');

    view = createAsciiFold(host, {
      layout: 'ascii', detail: 34, spin: 0, background: false,
      palette: { bg: '#ffffff', ink: '#7956a2', mono: '#7956a2' },
    });
    view.setStructure({ chains: [{ ...peptide, color: '#7956a2' }], chain: 'A' }, { title: 'Peptide F' });
    view.setRotation(1.2, -0.35);
    view.element.setAttribute('aria-hidden', 'true');
    host.setAttribute('role', 'img');
    host.setAttribute('aria-label', 'Peptide F from PDB 1PEF, chain A, drawn in purple ASCII. Drag or use arrow keys to rotate, plus and minus to zoom, R to reset.');
    const initialRotation = view.rotation;

    const updateSpin = () => {
      view.set({ spin: spinning && visible && !document.hidden ? 0.35 : 0 });
      if (spinButton) {
        spinButton.setAttribute('aria-pressed', String(spinning));
        spinButton.textContent = spinning ? 'Pause rotation' : 'Rotate';
      }
    };
    const stopSpin = () => { spinning = false; updateSpin(); };
    const resetView = () => {
      stopSpin();
      view.resetView().setRotation(initialRotation.y, initialRotation.x);
    };

    spinButton?.addEventListener('click', () => { spinning = !spinning; updateSpin(); });
    resetButton?.addEventListener('click', resetView);
    host.addEventListener('pointerdown', stopSpin);
    host.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const step = { ArrowLeft: [-0.14, 0], ArrowRight: [0.14, 0], ArrowUp: [0, -0.14], ArrowDown: [0, 0.14] }[event.key];
      if (step) {
        stopSpin();
        view.setRotation(view.rotation.y + step[0], view.rotation.x + step[1]);
      } else if (['+', '='].includes(event.key)) view.zoomBy(1.1);
      else if (['-', '_'].includes(event.key)) view.zoomBy(0.9);
      else if (event.key.toLowerCase() === 'r') resetView();
      else return;
      event.preventDefault();
    });
    document.addEventListener('visibilitychange', updateSpin);
    reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) stopSpin(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        visible = entries.some(entry => entry.isIntersecting);
        updateSpin();
      }).observe(host);
    }
    for (const button of [spinButton, resetButton]) if (button) { button.hidden = false; button.disabled = false; }
    updateSpin();
    if (status) status.hidden = true;
  } catch {
    view?.destroy();
    host.removeAttribute('tabindex');
    if (status) {
      status.hidden = false;
      status.textContent = 'The peptide could not be displayed. View the example through the PDB link below.';
    }
  } finally {
    host.setAttribute('aria-busy', 'false');
  }
}
