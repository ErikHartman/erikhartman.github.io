import { buildPeptideMap, packPeptides, parsePeptides, parseProteins, summarizeResidues } from './engine.js';
import { examplePeptideText, exampleProteinText } from './example.js';
import { downloadPng, downloadSvg, plotCellWidth, renderPlot } from './plot.js';

const get = id => document.getElementById(id);
const numberFormat = new Intl.NumberFormat('en', { maximumSignificantDigits: 6 });
const percentFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
const formatNumber = value => Number.isFinite(value) ? numberFormat.format(value) : '—';
const viewButtons = [...document.querySelectorAll('[data-view]')];
const template = 'peptide,abundance,sample\nWVTFISLL,420,Control\nLLFLFSS,180,Control\nWVTFISLL,980,Treatment\n';
const plotSlot = get('plot-slot');
const plotScroll = get('plot-scroll');
const plotOverview = get('protein-overview');

let dataset;
let current;
let view = 'sequence';
let selected;
let display;
let svg;
let renderFrame;

function feedback(id, message = '', tone = '') {
  const target = get(id);
  target.hidden = !message;
  target.textContent = message;
  target.dataset.tone = tone;
}

function downloadText(text, name, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.download = name;
  link.href = url;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function csvCell(value) {
  if (value == null) return '';
  if (typeof value === 'number') return String(value);
  const safe = /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(value) ? "'" + value : value;
  return /[",\r\n]/.test(safe) ? '"' + safe.replaceAll('"', '""') + '"' : safe;
}

function downloadCsv(rows, name) {
  downloadText(rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n', name);
}

function startMapping() {
  try {
    const proteins = parseProteins(get('protein-text').value);
    const peptideData = parsePeptides(get('peptide-text').value);
    const grouped = new Map(peptideData.samples.map(sample => [sample, []]));
    for (const peptide of peptideData.peptides) {
      if (!grouped.has(peptide.sample)) grouped.set(peptide.sample, []);
      grouped.get(peptide.sample).push(peptide);
    }
    let unnamed = grouped.size === 1 ? 'Peptides' : 'Unlabeled peptides';
    while (grouped.has(unnamed)) unnamed += ' (blank sample)';
    const samples = [...grouped].map(([sample, peptides], index) => ({
      name: sample ?? unnamed, index, peptides, included: true,
    }));
    const next = {
      proteins, peptideData, samples, matchIL: get('match-il').checked,
    };
    const first = mapProtein(next, 0);
    dataset = next;
    const picker = get('protein-select');
    picker.replaceChildren(...proteins.map((protein, index) => new Option(protein.name, index)));
    get('protein-picker').hidden = proteins.length === 1;
    makeSampleOptions();
    for (const id of ['peptide-search', 'parent-motif', 'min-abundance', 'max-abundance']) get(id).value = '';
    get('empty-state').hidden = true;
    get('results').hidden = false;
    get('toggle-inputs').hidden = false;
    showProtein(first);
    feedback('input-feedback');
  } catch (error) {
    feedback('input-feedback', error.message, 'error');
  }
}

function mapProtein(data, index) {
  const protein = data.proteins[index];
  const options = { matchIL: data.matchIL };
  const map = buildPeptideMap(protein.sequence, data.peptideData.peptides, options);
  const tracks = data.samples.map(sample => ({
    ...(data.samples.length === 1 ? map : buildPeptideMap(protein.sequence, sample.peptides, options)),
    name: sample.name, index: sample.index,
  }));
  return { protein, map, tracks, index };
}

function showProtein(mapping) {
  current = mapping;
  const { protein } = current;
  selected = null;
  showSelection();
  get('plot-heading').textContent = protein.name;
  get('result-subtitle').textContent = formatNumber(protein.sequence.length) + ' residues' +
    (dataset.proteins.length > 1 ? ' · ' + dataset.proteins.length + ' parent proteins' : '');
  get('metric-peptides').textContent = formatNumber(current.map.mappedCount);
  get('metric-coverage').textContent = percentFormat.format(current.map.coveragePercent) + '%';
  get('metric-samples').textContent = formatNumber(dataset.samples.length);
  for (const id of ['region-start', 'region-end']) get(id).max = protein.sequence.length;
  setRegion(1, Math.min(500, protein.sequence.length));
  updateDiagnostics();
  feedback('export-status');
  updatePlot(true);
}

function makeSampleOptions() {
  get('sample-menu').hidden = dataset.samples.length <= 1;
  get('sample-menu').open = false;
  get('sample-options').replaceChildren(...dataset.samples.map(sample => {
    const label = document.createElement('label');
    label.className = 'check-line';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = sample.included;
    checkbox.addEventListener('change', () => {
      sample.included = checkbox.checked;
      updatePlot();
    });
    label.append(checkbox, sample.name);
    return label;
  }));
}

function updateDiagnostics() {
  const { unmatched, placements } = current.map;
  const ambiguous = new Set(placements.filter(peptide => peptide.ambiguous).map(peptide => peptide.sequence)).size;
  const notes = [...dataset.peptideData.warnings];
  if (ambiguous) notes.unshift(ambiguous + ' peptide sequence' + (ambiguous === 1 ? ' maps' : 's map') +
    ' to multiple positions. Each placement contributes to coverage and summed abundance.');
  if (unmatched.length) {
    const preview = unmatched.slice(0, 12).map(peptide => peptide.sequence).join(', ');
    notes.unshift(unmatched.length + ' peptide sequence' + (unmatched.length === 1 ? ' did' : 's did') +
      ' not match the parent: ' + preview + (unmatched.length > 12 ? ', …' : ''));
  }
  get('diagnostics').hidden = !notes.length;
  get('diagnostics').open = !current.map.mappedCount && notes.length > 0;
  get('diagnostic-summary').textContent = notes.length ? 'Mapping notes (' + formatNumber(notes.length) + ')' : 'Mapping notes';
  const visible = notes.slice(0, 50);
  if (notes.length > 50) visible.push(formatNumber(notes.length - 50) + ' additional row warnings.');
  get('diagnostic-list').replaceChildren(...visible.map(note => {
    const item = document.createElement('li');
    item.textContent = note;
    return item;
  }));
  get('download-unmapped').hidden = !unmatched.length;
}

function setRegion(start, end) {
  get('region-start').value = start;
  get('region-end').value = end;
}

function region() {
  const length = current.protein.sequence.length;
  const start = Math.min(length, Math.max(1, Math.trunc(get('region-start').valueAsNumber) || 1));
  const end = Math.min(length, Math.max(start, Math.trunc(get('region-end').valueAsNumber) || length));
  setRegion(start, end);
  return { start: start - 1, end };
}

function query(id) {
  const input = get(id);
  const value = input.value.trim();
  if (!value) return null;
  if (value.length > 120) throw new Error('Keep search patterns at or below 120 characters.');
  if (!get('regex-search').checked) return value.toUpperCase();
  try {
    return new RegExp(value, 'i');
  } catch {
    throw new Error((id === 'parent-motif' ? 'Parent motif' : 'Peptide search') + ' has an invalid regular expression.');
  }
}

function motifSpans(sequence, motif, start, end) {
  if (!motif) return [];
  if (motif instanceof RegExp) {
    return [...sequence.matchAll(new RegExp(motif.source, 'gi'))].flatMap(match => {
      const length = match[0].length;
      return length && match.index < end && match.index + length > start
        ? [{ start: match.index, end: match.index + length, label: match[0] }]
        : [];
    });
  }
  const spans = [];
  let position = sequence.indexOf(motif, Math.max(0, start - motif.length + 1));
  while (position !== -1 && position < end) {
    spans.push({ start: position, end: position + motif.length, label: motif });
    position = sequence.indexOf(motif, position + 1);
  }
  return spans;
}

function cleavageMarkers(sequence, tracks, type) {
  if (type === 'none') return [];
  const rules = {
    observed: { label: 'Peptide terminus', matches: (_, __, seen) => seen },
    trypsin: { label: 'Trypsin', matches: (previous, next) => 'KR'.includes(previous) && next !== 'P' },
    lysc: { label: 'Lys-C', matches: previous => previous === 'K' },
    gluc: { label: 'Glu-C', matches: previous => previous === 'E' },
  };
  const rule = rules[type];
  const observed = new Set();
  for (const track of tracks) {
    for (const peptide of track.placements) {
      observed.add(peptide.start);
      observed.add(peptide.end);
    }
  }
  const sites = [];
  for (let position = 1; position < sequence.length; position++) {
    const seen = observed.has(position);
    if (rule.matches(sequence[position - 1], sequence[position], seen)) {
      sites.push({ position, label: rule.label, observed: seen });
    }
  }
  return sites;
}

function filteredTracks(search, minimum, maximum) {
  const includes = new Set(dataset.samples.filter(sample => sample.included).map(sample => sample.index));
  return current.tracks.filter(track => includes.has(track.index)).map(track => {
    if (!search && !Number.isFinite(minimum) && !Number.isFinite(maximum)) return track;
    const matches = track.placements.filter(peptide => {
      if (Number.isFinite(minimum) && (peptide.abundance === null || peptide.abundance < minimum)) return false;
      if (Number.isFinite(maximum) && (peptide.abundance === null || peptide.abundance > maximum)) return false;
      return !search || (typeof search === 'string' ? peptide.sequence.includes(search) : search.test(peptide.sequence));
    });
    return { ...track, ...packPeptides(matches), ...summarizeResidues(matches, current.protein.sequence.length) };
  });
}

function drawOverview(tracks, length, start, end) {
  plotOverview.hidden = !tracks.length;
  if (!tracks.length) return;
  const canvas = get('coverage-strip');
  const context = canvas.getContext('2d');
  if (!context) {
    plotOverview.hidden = true;
    return;
  }
  const { width, height } = canvas;
  const bins = new Uint8Array(width);
  for (const { coverage } of tracks) {
    for (let position = 0; position < length; position++) {
      if (!coverage[position]) continue;
      const left = Math.floor(position * width / length);
      const right = Math.ceil((position + 1) * width / length);
      bins.fill(1, left, right);
    }
  }
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#edf1eb';
  context.fillRect(0, 5, width, height - 10);
  context.fillStyle = '#a8c69b';
  for (let bin = 0; bin < width; bin++) {
    if (bins[bin]) context.fillRect(bin, 5, 1, height - 10);
  }
  const left = Math.round(start * width / length);
  const right = Math.round(end * width / length);
  context.fillStyle = '#ffffffa8';
  context.fillRect(0, 5, left, height - 10);
  context.fillRect(right, 5, width - right, height - 10);
  context.strokeStyle = '#507954';
  context.strokeRect(Math.min(left, width - 2) + 0.5, 2.5, Math.max(1, right - left - 1), height - 5);
  canvas.setAttribute('aria-label', `Parent protein, ${length} residues. Displayed region ${start + 1} to ${end}. Green marks covered residues.`);
}

function updatePlot(resetScroll = false) {
  if (!current) return;
  const { sequence, name } = current.protein;
  const { start, end } = region();
  const rangeLength = end - start;
  try {
    const minimum = get('min-abundance').valueAsNumber;
    const maximum = get('max-abundance').valueAsNumber;
    if (minimum > maximum) throw new Error('Minimum abundance must be at or below maximum abundance.');
    const tracks = filteredTracks(query('peptide-search'), minimum, maximum);
    const motif = query('parent-motif');
    const cellWidth = plotCellWidth(view, get('zoom').value, plotScroll.clientWidth, rangeLength);
    const [colorScale, scope] = get('color-scale').value.split('-');
    const visible = tracks.map(track => track.placements.filter(peptide => peptide.end > start && peptide.start < end));
    get('plot-caption').textContent = view === 'sequence' ? 'Sequence alignment' :
      view === 'coverage' ? 'Peptide coverage' : 'Coverage and alignment';
    get('plot-region').textContent = `Residues ${formatNumber(start + 1)}–${formatNumber(end)} of ${formatNumber(sequence.length)}`;
    drawOverview(tracks, sequence.length, start, end);
    display = { start, end, tracks, visible };
    svg = null;
    feedback('plot-feedback');
    if (!tracks.length) {
      showPlotMessage('Select a sample to display its peptide track.');
      return;
    }
    if (rangeLength > 6000 || visible.reduce((sum, peptides) => sum + peptides.length, 0) > 12000) {
      showPlotMessage('Narrow the residue range or filter the peptides to draw this plot. The selected data is still available as CSV.');
      return;
    }
    svg = renderPlot({
      sequence, proteinName: name, tracks, start, end, cellWidth, mode: view,
      showLetters: get('show-letters').checked, colorScale, scaleScope: scope === 'sample' ? 'sample' : 'shared',
      presentation: get('plot-layout').value,
      motifs: motifSpans(sequence, motif, start, end),
      cleavageSites: cleavageMarkers(sequence, tracks, get('cleavage').value),
      selected, onSelect: selectPeptide,
    });
    plotSlot.replaceChildren(svg);
    if (resetScroll) {
      plotScroll.scrollLeft = 0;
      plotScroll.scrollTop = 0;
    }
  } catch (error) {
    display = null;
    svg = null;
    plotOverview.hidden = true;
    showPlotMessage('Adjust the plot settings to continue.');
    feedback('plot-feedback', error.message, 'error');
  }
}

function showPlotMessage(text) {
  const message = document.createElement('p');
  message.className = 'plot-empty';
  message.textContent = text;
  plotSlot.replaceChildren(message);
}

function selectPeptide(peptide, track, node) {
  selected = { ...peptide, trackName: track.name };
  const previous = plotSlot.querySelector('[data-selected="true"]');
  previous?.setAttribute('data-selected', 'false');
  previous?.setAttribute('aria-pressed', 'false');
  node.setAttribute('data-selected', 'true');
  node.setAttribute('aria-pressed', 'true');
  showSelection();
}

function showSelection() {
  get('selection').hidden = !selected;
  if (!selected) return;
  get('selection-sequence').textContent = selected.sequence;
  get('selection-position').textContent = 'Residues ' + (selected.start + 1) + '–' + selected.end +
    (selected.ambiguous ? ' · Matches multiple positions' : '') + (selected.name ? ' · ' + selected.name : '');
  get('copy-selection').textContent = 'Copy sequence';
  const table = document.createElement('table');
  const row = table.createTHead().insertRow();
  for (const title of ['Sample', 'Abundance', 'Observations']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = title;
    row.append(th);
  }
  const relevant = dataset.samples.map(sample => {
    const mapping = current.tracks[sample.index].placements.find(peptide =>
      peptide.sequence === selected.sequence && peptide.start === selected.start);
    return [sample.name, formatNumber(mapping?.abundance), mapping?.observationCount ?? 0];
  });
  const body = table.createTBody();
  for (const values of relevant) {
    const tr = body.insertRow();
    for (const value of values) tr.insertCell().textContent = value;
  }
  get('selection-values').replaceChildren(table);
}

function dataFilename() {
  return current.protein.id.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 90) || 'peptide-map';
}

async function exportPlot(kind) {
  get('export-menu').open = false;
  if (!display) return;
  const filename = dataFilename();
  const { start, end, tracks, visible } = display;
  feedback('export-status');
  try {
    if (['svg', 'png', 'print'].includes(kind) && !svg) throw new Error('Draw a plot before exporting the figure.');
    if (kind === 'svg') downloadSvg(svg, filename + '-peptide-map.svg');
    if (kind === 'png') await downloadPng(svg, filename + '-peptide-map.png');
    if (kind === 'print') window.print();
    if (kind === 'csv') {
      const rows = [['sample', 'peptide', 'start', 'end', 'abundance', 'observations', 'multiple_positions']];
      for (const [index, track] of tracks.entries()) {
        for (const peptide of visible[index]) {
          rows.push([track.name, peptide.sequence, peptide.start + 1, peptide.end, peptide.abundance,
            peptide.observationCount, peptide.ambiguous ? 'yes' : 'no']);
        }
      }
      downloadCsv(rows, filename + '-peptides.csv');
    }
    if (kind === 'coverage') {
      const rows = [['sample', 'position', 'residue', 'peptide_count', 'summed_abundance', 'peptide_starts', 'peptide_ends']];
      for (const track of tracks) {
        for (let position = start; position < end; position++) {
          rows.push([track.name, position + 1, current.protein.sequence[position], track.coverage[position],
            track.abundanceMeasured[position] ? track.abundance[position] : null,
            track.starts[position], track.ends[position]]);
        }
      }
      downloadCsv(rows, filename + '-coverage.csv');
    }
  } catch (error) {
    feedback('export-status', error.message, 'error');
  }
}

function loadExample() {
  get('protein-text').value = exampleProteinText;
  get('peptide-text').value = examplePeptideText;
  get('match-il').checked = false;
  startMapping();
}

get('data-form').addEventListener('submit', event => {
  event.preventDefault();
  startMapping();
});
get('load-example').addEventListener('click', loadExample);
get('toggle-inputs').addEventListener('click', event => {
  const panel = get('input-panel');
  panel.hidden = !panel.hidden;
  get('workspace').dataset.inputsHidden = String(panel.hidden);
  get('toggle-inputs-label').textContent = panel.hidden ? 'Show inputs' : 'Hide inputs';
  event.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
});
get('download-template').addEventListener('click', () => downloadText(template, 'peptide-template.csv'));
for (const button of document.querySelectorAll('[data-file]')) {
  const file = get(button.dataset.file);
  const field = get(button.dataset.file.replace('-file', '-text'));
  button.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const selectedFile = file.files[0];
    if (!selectedFile) return;
    try {
      if (selectedFile.size > 12_000_000) throw new Error('Choose a text file up to 12 MB.');
      field.value = await selectedFile.text();
      feedback('input-feedback', 'Loaded ' + selectedFile.name + '. Map peptides to update the plot.', 'success');
    } catch (error) {
      feedback('input-feedback', error.message, 'error');
    } finally {
      file.value = '';
    }
  });
}
get('protein-select').addEventListener('change', event => {
  try {
    showProtein(mapProtein(dataset, Number(event.target.value)));
    feedback('input-feedback');
  } catch (error) {
    event.target.value = current.index;
    feedback('input-feedback', error.message, 'error');
  }
});
for (const button of viewButtons) {
  button.addEventListener('click', () => {
    view = button.dataset.view;
    for (const tab of viewButtons) tab.setAttribute('aria-pressed', tab === button);
    updatePlot(true);
  });
}
for (const id of ['region-start', 'region-end', 'zoom', 'peptide-search', 'parent-motif',
  'min-abundance', 'max-abundance', 'color-scale', 'cleavage', 'regex-search', 'show-letters', 'plot-layout']) {
  get(id).addEventListener('change', () => updatePlot(id === 'region-start' || id === 'region-end'));
  if (id.endsWith('search') || id === 'parent-motif') {
    get(id).addEventListener('keydown', event => {
      if (event.key === 'Enter') updatePlot();
    });
  }
}
get('reset-range').addEventListener('click', () => {
  setRegion(1, current.protein.sequence.length);
  updatePlot(true);
});
get('close-selection').addEventListener('click', () => {
  selected = null;
  showSelection();
  updatePlot();
});
get('focus-selection').addEventListener('click', () => {
  if (!selected) return;
  setRegion(Math.max(1, selected.start - 2), Math.min(current.protein.sequence.length, selected.end + 3));
  updatePlot(true);
});
get('copy-selection').addEventListener('click', async () => {
  if (!selected) return;
  try {
    await navigator.clipboard.writeText(selected.sequence);
    get('copy-selection').textContent = 'Copied';
  } catch {
    const range = document.createRange();
    range.selectNodeContents(get('selection-sequence'));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    get('copy-selection').textContent = 'Sequence selected';
  }
});
for (const button of document.querySelectorAll('[data-export]')) {
  button.addEventListener('click', () => exportPlot(button.dataset.export));
}
get('download-unmapped').addEventListener('click', () => {
  downloadCsv([['peptide', 'abundance', 'observations'], ...current.map.unmatched.map(peptide =>
    [peptide.sequence, peptide.abundance, peptide.observationCount])], dataFilename() + '-unmapped.csv');
});
for (const menu of [get('export-menu'), get('sample-menu')]) {
  document.addEventListener('click', event => {
    if (!menu.contains(event.target)) menu.open = false;
  });
  menu.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    menu.open = false;
    menu.querySelector('summary').focus();
  });
}
let plotWidth = 0;
const resizePlot = () => {
  const width = plotScroll.clientWidth;
  if (width === plotWidth) return;
  plotWidth = width;
  if (!['auto', 'fit'].includes(get('zoom').value)) return;
  cancelAnimationFrame(renderFrame);
  renderFrame = requestAnimationFrame(() => updatePlot());
};
const plotResizeObserver = new ResizeObserver(resizePlot);
plotResizeObserver.observe(plotScroll);

loadExample();
