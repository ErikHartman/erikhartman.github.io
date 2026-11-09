(() => {
  'use strict';

  const roots = [...document.querySelectorAll('[data-structure-viewer]')];
  if (!roots.length) return;

  let libraryPromise;
  function loadLibrary() {
    if (window.$3Dmol) return Promise.resolve(window.$3Dmol);
    if (libraryPromise) return libraryPromise;
    libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => finish(new Error('The 3D viewer took too long to load.')), 20000);
      function finish(error) {
        clearTimeout(timeout);
        script.onload = script.onerror = null;
        if (error) {
          script.remove();
          libraryPromise = null;
          reject(error);
        } else resolve(window.$3Dmol);
      }
      script.src = '/vendor/3Dmol-2.5.5.min.js';
      script.async = true;
      script.onload = () => finish(window.$3Dmol ? null : new Error('The 3D viewer could not start.'));
      script.onerror = () => finish(new Error('The 3D viewer could not be downloaded.'));
      document.head.append(script);
    });
    return libraryPromise;
  }

  function initialize(root) {
    const host = root.querySelector('[data-structure-canvas]');
    const status = root.querySelector('[data-structure-status]');
    const message = root.querySelector('[data-structure-message]');
    const retry = root.querySelector('[data-structure-retry]');
    const styles = [...root.querySelectorAll('[data-structure-style]')];
    const spinButton = root.querySelector('[data-structure-spin]');
    const resetButton = root.querySelector('[data-structure-reset]');
    const controls = [...styles, spinButton, resetButton];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let ascii, asciiHost, activeStyle = 'ascii';
    let config, viewer, initialView, proteinSelection, peptideSelection, displayedAtoms;
    let loading = false, ready = false, spinning = false, visible = true, surfacePending = false;
    let surfaceId = null;
    let fittedSize = '';

    function setStatus(text, canRetry = false) {
      message.textContent = text;
      retry.hidden = !canRetry;
      status.hidden = false;
    }

    function updateSpin() {
      if (ascii) ascii.set({ spin: activeStyle === 'ascii' || activeStyle === 'blend' ? (spinning && visible && !document.hidden ? 0.35 : 0) : 0 });
      if (viewer) viewer.spin(!['ascii', 'blend'].includes(activeStyle) && spinning && visible && !document.hidden ? 'vy' : false, 0.35);
      spinButton.setAttribute('aria-pressed', String(spinning));
      spinButton.textContent = spinning ? 'Pause rotation' : 'Rotate';
    }

    function stopSpin() {
      spinning = false;
      updateSpin();
    }

    function fail(text) {
      ready = false;
      stopSpin();
      root.dataset.structureState = 'error';
      host.setAttribute('aria-busy', 'false');
      controls.forEach(button => { button.disabled = true; });
      setStatus(text, true);
    }

    function showRibbon() {
      viewer.setStyle(proteinSelection, {
        cartoon: { color: config.proteinColor, arrows: true, thickness: 0.35 },
      });
      viewer.setStyle(peptideSelection, {
        cartoon: { color: config.peptideColor, thickness: 0.45 },
      });
    }

    async function changeStyle(style) {
      if (!ready || surfacePending) return;
      activeStyle = style;
      const useAscii = style === 'ascii' || style === 'blend';
      asciiHost.hidden = !useAscii;
      root.dataset.structureDisplay = useAscii ? 'ascii' : 'molecular';
      if (ascii) ascii.set({ layout: style === 'blend' ? 'lr' : 'ascii' });
      updateSpin();
      if (style === 'surface' && surfaceId === null) {
        surfacePending = true;
        styles.forEach(button => { button.disabled = true; });
        setStatus('Drawing the protein surface…');
        try {
          surfaceId = await viewer.addSurface(window.$3Dmol.SurfaceType.MS, {
            color: config.proteinColor, opacity: 1, outline: true,
          }, proteinSelection, proteinSelection);
        } catch {
          // Keep the working ribbon view available when a surface cannot be calculated.
          viewer.removeAllSurfaces();
          showRibbon();
          viewer.render();
          setStatus('The surface could not be drawn. Try again, or continue with the ribbon view.', true);
          surfacePending = false;
          styles.forEach(button => { button.disabled = false; });
          return;
        }
        surfacePending = false;
        styles.forEach(button => { button.disabled = false; });
      }
      if (!ready) return;
      showRibbon();
      if (surfaceId !== null) {
        viewer.setSurfaceMaterialStyle(surfaceId, {
          color: config.proteinColor, opacity: style === 'surface' ? 1 : 0, outline: true,
        });
      }
      if (style === 'surface') viewer.setStyle(proteinSelection, {});
      styles.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.structureStyle === style)));
      status.hidden = true;
      viewer.render();
    }

    function fitView() {
      if (!host.clientWidth || !host.clientHeight) return;
      viewer.resize();
      // Orthographic zoom is relative to width. Fit projected bounds so a wide canvas
      // cannot crop the model vertically; zoomTo retains the current rotation.
      viewer.zoomTo({ chain: [...config.proteinChains, ...config.peptideChains] });
      viewer.render();
      const view = viewer.getView();
      const center = viewer.modelToScreen({ x: -view[0], y: -view[1], z: -view[2] });
      let halfWidth = 1, halfHeight = 1;
      for (const point of viewer.modelToScreen(displayedAtoms)) {
        halfWidth = Math.max(halfWidth, Math.abs(point.x - center.x));
        halfHeight = Math.max(halfHeight, Math.abs(point.y - center.y));
      }
      viewer.zoom(0.88 * Math.min((host.clientWidth - 40) / (2 * halfWidth), (host.clientHeight - 64) / (2 * halfHeight)));
      viewer.render();
      fittedSize = `${host.clientWidth}:${host.clientHeight}`;
    }

    function resizeView() {
      if (ready && fittedSize !== `${host.clientWidth}:${host.clientHeight}`) fitView();
    }

    function resetView() {
      if (!ready) return;
      stopSpin();
      if (ascii) ascii.resetView();
      viewer.setView(initialView);
      fitView();
    }

    async function load() {
      if (loading || ready) return;
      loading = true;
      root.dataset.structureState = 'loading';
      host.setAttribute('aria-busy', 'true');
      setStatus('Loading interactive structure…');
      let stage = 'config';
      try {
        config = JSON.parse(root.querySelector('[data-structure-config]').textContent);
        if (!config.src || !config.proteinChains?.length || !config.peptideChains?.length) {
          throw new Error('The structure settings are incomplete.');
        }
        root.style.setProperty('--structure-protein', config.proteinColor || '#95aebf');
        root.style.setProperty('--structure-peptide', config.peptideColor || '#ff9274');
        config.proteinColor ||= '#95aebf';
        config.peptideColor ||= '#ff9274';
        stage = 'library';
        const mol = await loadLibrary();
        stage = 'data';
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        let data;
        try {
          const response = await fetch(config.src, { signal: controller.signal });
          if (!response.ok) throw new Error(`Structure request failed: ${response.status}`);
          data = await response.text();
        } finally { clearTimeout(timeout); }
        stage = 'graphics';
        if (!viewer) {
          // Let the library select WebGL or its offscreen renderer; failures are caught below.
          const canvas = document.createElement('canvas');
          host.replaceChildren();
          viewer = mol.createViewer(host, { canvas, backgroundColor: '#ffffff', backgroundAlpha: 0, antialias: true, disableFog: true });
          if (!viewer) throw new Error('WebGL could not start.');
          viewer.setViewStyle({ style: 'outline', color: '#42515c', width: 0.1 });
          canvas.addEventListener('webglcontextlost', event => {
            event.preventDefault();
            fail('The 3D display was interrupted. Try again to restore the structure.');
          });
          canvas.setAttribute('aria-hidden', 'true');
        }
        viewer.clear();
        surfaceId = null;
        stage = 'model';
        viewer.addModel(data, config.format || 'pdb');
        proteinSelection = { chain: config.proteinChains, hetflag: false };
        peptideSelection = { chain: config.peptideChains, hetflag: false };
        displayedAtoms = viewer.selectedAtoms({ chain: [...config.proteinChains, ...config.peptideChains], hetflag: false });
        if (!viewer.selectedAtoms(proteinSelection).length || !viewer.selectedAtoms(peptideSelection).length) {
          throw new Error('The configured protein or peptide chains were not found.');
        }
        viewer.setStyle({}, {});
        showRibbon();
        viewer.setProjection('orthographic');
        viewer.zoomTo({ chain: [...config.proteinChains, ...config.peptideChains] });
        if (config.initialQuaternion?.length === 4 && config.initialQuaternion.every(Number.isFinite)) {
          const view = viewer.getView();
          view.splice(4, 4, ...config.initialQuaternion);
          viewer.setView(view);
        }
        fitView();
        initialView = viewer.getView().slice();
        ready = true;
        styles.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.structureStyle === 'ribbon')));
        const [{ createAsciiFold }, { parsePDB }] = await Promise.all([
          import('/vendor/ascii-fold/engine.js'), import('/vendor/ascii-fold/parse.js'),
        ]);
        if (ascii) { ascii.destroy(); asciiHost.remove(); }
        asciiHost = document.createElement('div');
        asciiHost.className = 'structure-ascii';
        host.append(asciiHost);
        ascii = createAsciiFold(asciiHost, { layout: 'ascii', detail: 'medium', spin: 0, background: false });
        const lines = data.split(/\r?\n/);
        const chains = [...config.proteinChains, ...config.peptideChains].map(chain => ({
          ...parsePDB(lines.filter(line => !line.startsWith('ATOM  ') || line[21] === chain).join('\n')),
          color: config.peptideChains.includes(chain) ? config.peptideColor : config.proteinColor,
        }));
        if (chains.some(chain => chain.rows.length < 5)) throw new Error('A chain has too few residues for ASCII Fold.');
        ascii.setStructure({ chains, chain: chains.map(c => c.chain).join(', ') }, { title: `${config.proteinLabel} and ${config.peptideLabel}` });
        await changeStyle('ascii');
        root.dataset.structureState = 'ready';
        host.setAttribute('aria-busy', 'false');
        controls.forEach(button => { button.disabled = false; });
      } catch (error) {
        const messages = {
          config: 'The structure settings could not be read. You can still explore the example through the PDB link above.',
          library: 'The 3D viewer could not load. Check your connection and try again.',
          data: 'The structure file could not load. Check your connection and try again.',
          graphics: 'Interactive 3D needs WebGL. Try a browser with hardware acceleration, or explore the structure through the PDB link above.',
          model: 'The structure could not be displayed. You can explore the example through the PDB link above.',
        };
        fail(messages[stage]);
        console.warn('Structure viewer:', error);
      } finally { loading = false; }
    }

    retry.addEventListener('click', () => {
      if (ready) { status.hidden = true; changeStyle('surface'); }
      else load();
    });
    styles.forEach(button => button.addEventListener('click', () => changeStyle(button.dataset.structureStyle)));
    spinButton.addEventListener('click', () => { if (ready) { spinning = !spinning; updateSpin(); } });
    resetButton.addEventListener('click', resetView);
    host.addEventListener('pointerdown', stopSpin);
    host.addEventListener('keydown', event => {
      if (!ready || event.altKey || event.ctrlKey || event.metaKey) return;
      const useAscii = ['ascii', 'blend'].includes(activeStyle);
      if (useAscii && ascii) {
        const steps = { ArrowLeft: [-0.14, 0], ArrowRight: [0.14, 0], ArrowUp: [0, -0.14], ArrowDown: [0, 0.14] }[event.key];
        if (steps) { stopSpin(); ascii.setRotation(ascii.rotation.y + steps[0], ascii.rotation.x + steps[1]); }
        else if (['+', '='].includes(event.key)) ascii.zoomBy(1.1);
        else if (['-', '_'].includes(event.key)) ascii.zoomBy(0.9);
        else if (event.key.toLowerCase() === 'r') resetView();
        else return;
        event.preventDefault();
        return;
      }
      const rotation = { ArrowLeft: [-8, 'vy'], ArrowRight: [8, 'vy'], ArrowUp: [-8, 'vx'], ArrowDown: [8, 'vx'] }[event.key];
      if (rotation) { stopSpin(); viewer.rotate(...rotation); }
      else if (event.key === '+' || event.key === '=') viewer.zoom(1.1);
      else if (event.key === '-' || event.key === '_') viewer.zoom(0.9);
      else if (event.key.toLowerCase() === 'r') resetView();
      else return;
      event.preventDefault();
      viewer.render();
    });
    reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) stopSpin(); });
    document.addEventListener('visibilitychange', updateSpin);
    if ('ResizeObserver' in window) new ResizeObserver(resizeView).observe(host);
    else window.addEventListener('resize', resizeView);
    if ('IntersectionObserver' in window) {
      const nearViewport = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { nearViewport.disconnect(); load(); }
      }, { rootMargin: '250px' });
      nearViewport.observe(root);
      new IntersectionObserver(entries => { visible = entries[0].isIntersecting; updateSpin(); }).observe(host);
    } else load();
  }

  roots.forEach(initialize);
})();
