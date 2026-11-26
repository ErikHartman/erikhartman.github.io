const SVG_NS = 'http://www.w3.org/2000/svg';
const INK = '#252b22';
const SUBTLE_INK = '#506054';
const LINE = '#dce5da';
const AXIS = '#738676';
const FONT = 'Arial, Helvetica, sans-serif';
const MONO = 'Consolas, Menlo, Liberation Mono, monospace';
const RIGHT = 22;
const ROW = 19;
const PEPTIDE_HEIGHT = 15;
const PROFILE_HEIGHT = 88;
const ABUNDANCE_STRIP_HEIGHT = 10;
const PROFILE_STRIP_SPACE = 17;
const CLEAVAGE_HEIGHT = 32;
const KEY_HEIGHT = 32;
const KEY_WIDTH = 200;
const DEPTH_STROKE = '#376841';
const DEPTH_FILL = '#d0e4ca';
const UNIFORM_PEPTIDE = '#ccdfc6';
const PEPTIDE_OUTLINE = '#719576';

const ABUNDANCE_COLORS = {
  low: '#edf6dc',
  high: '#8bbe83',
  missing: '#e6e9e4',
};

export const RESIDUE_COLORS = {
  hydrophobic: '#55aa76',
  polar: '#74acd3',
  basic: '#947bc9',
  acidic: '#e37876',
  special: '#e5ba51',
  other: '#cbd5cd',
};

export function residueColor(residue) {
  if ('AVLIMFWY'.includes(residue)) return RESIDUE_COLORS.hydrophobic;
  if ('STNQC'.includes(residue)) return RESIDUE_COLORS.polar;
  if ('KRH'.includes(residue)) return RESIDUE_COLORS.basic;
  if ('DE'.includes(residue)) return RESIDUE_COLORS.acidic;
  if ('GP'.includes(residue)) return RESIDUE_COLORS.special;
  return RESIDUE_COLORS.other;
}

const formatNumber = new Intl.NumberFormat('en', { maximumSignificantDigits: 7 });
const formatScale = new Intl.NumberFormat('en', { maximumSignificantDigits: 4 });
const formatScientific = new Intl.NumberFormat('en', { notation: 'scientific', maximumSignificantDigits: 3 });
const isNumber = value => Number.isFinite(value);

function leftMargin(mode) {
  return mode === 'sequence' ? 22 : 59;
}

export function plotCellWidth(mode, zoom, width, length) {
  const fit = Math.max(0.01, (width - leftMargin(mode) - RIGHT) / length);
  if (zoom === 'auto' && mode !== 'coverage') return Math.max(10, Math.min(13, fit));
  if (zoom === 'auto' || zoom === 'fit') return Math.min(22, fit);
  return Number(zoom);
}

function element(name, attributes = {}, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

function label(x, y, text, attributes = {}) {
  return element('text', { x, y, fill: INK, 'font-family': FONT, 'font-size': 12, ...attributes }, text);
}

function heading(x, y, text, width, size) {
  const maxLength = Math.max(8, Math.floor(width / (size * 0.62)));
  const abbreviated = text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  const node = label(x, y, abbreviated, { 'font-size': size, 'font-weight': 700 });
  if (abbreviated !== text) node.append(element('title', {}, text));
  return node;
}

const hexRgb = hex => [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16));
const lowRgb = hexRgb(ABUNDANCE_COLORS.low);
const highRgb = hexRgb(ABUNDANCE_COLORS.high);

function palette(position) {
  const channels = lowRgb.map((low, index) => Math.round(low + position * (highRgb[index] - low)));
  return `rgb(${channels.join(',')})`;
}

function colorDomain(values) {
  let min = Infinity;
  let max = -Infinity;
  let missing = false;
  for (const value of values) {
    if (!isNumber(value)) {
      missing = true;
      continue;
    }
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max, missing };
}

function* mergedValues(items, getValues) {
  for (const item of items) yield* getValues(item);
}

function colorMapper({ min, max }, scale) {
  const transform = scale === 'log' ? value => Math.sign(value) * Math.log1p(Math.abs(value)) : value => value;
  const low = transform(min);
  const high = transform(max);
  return value => {
    if (!isNumber(value)) return ABUNDANCE_COLORS.missing;
    const relative = high === low ? 0.52 : (transform(value) - low) / (high - low);
    return palette(Math.max(0, Math.min(1, relative)));
  };
}

function* peptideValues(track) {
  for (const peptide of track.visible) yield peptide.abundance;
}

function residueAbundance(track, position) {
  return track.abundanceMeasured[position] ? track.abundance[position] : null;
}

function* profileValues(track, start, end) {
  for (let position = start; position < end; position += 1) {
    if (track.coverage[position]) yield residueAbundance(track, position);
  }
}

function scaleValue(value) {
  const magnitude = Math.abs(value);
  if (magnitude >= 1e5 || (magnitude > 0 && magnitude < 0.01)) return formatScientific.format(value);
  return formatScale.format(value);
}

function keyHeight(keys, columns) {
  return Math.ceil(keys.length / columns) * KEY_HEIGHT;
}

function drawColorKeys(svg, keys, columns, left, top, scope) {
  if (!keys.length) return;
  const legend = element('g', { 'aria-label': `${scope} abundance color keys` });
  for (const [index, { name, domain: { min, max, missing }, scale }] of keys.entries()) {
    const x = left + (index % columns) * KEY_WIDTH;
    const y = top + Math.floor(index / columns) * KEY_HEIGHT;
    const measured = isNumber(min);
    const ranged = measured && min !== max;
    const transform = scale === 'log' && ranged ? (min < 0 ? ' (signed log1p)' : ' (log1p)') : '';
    legend.append(label(x, y + 10, name + transform, { 'font-weight': 700, 'font-size': 10.5 }));
    const swatchY = y + 17;
    const valueStyle = { 'font-size': 9.5, fill: SUBTLE_INK };
    if (ranged) {
      const rampX = x + 44;
      const steps = 24;
      for (let step = 0; step < steps; step += 1) {
        legend.append(element('rect', {
          x: rampX + step * 2.5, y: swatchY, width: 2.5, height: 8, fill: palette(step / (steps - 1)),
        }));
      }
      legend.append(
        element('rect', { x: rampX, y: swatchY, width: 60, height: 8, fill: 'none', stroke: AXIS, 'stroke-width': 0.5 }),
        label(rampX - 5, y + 25, scaleValue(min), { ...valueStyle, 'text-anchor': 'end' }),
        label(rampX + 65, y + 25, scaleValue(max), valueStyle),
      );
    } else {
      legend.append(
        element('rect', {
          x, y: swatchY, width: 11, height: 8, fill: measured ? palette(0.52) : ABUNDANCE_COLORS.missing,
          stroke: AXIS, 'stroke-width': 0.5,
        }),
        label(x + 16, y + 25, measured ? scaleValue(min) : (missing ? 'Unmeasured' : 'No data'), valueStyle),
      );
    }
    if (measured && missing) {
      legend.append(
        element('rect', { x: x + 155, y: swatchY, width: 8, height: 8, fill: ABUNDANCE_COLORS.missing, stroke: AXIS, 'stroke-width': 0.5 }),
        label(x + 167, y + 25, 'NA', valueStyle),
      );
    }
  }
  svg.append(legend);
}

function rulerStep(cellWidth) {
  const target = 58 / cellWidth;
  const order = 10 ** Math.floor(Math.log10(target));
  return ([1, 2, 5, 10].find(value => value * order >= target) ?? 10) * order;
}

function drawRuler(svg, start, end, cellWidth, y, xAt, above) {
  const step = rulerStep(cellWidth);
  const ticks = [start + 1];
  const spacing = Math.max(30, String(end).length * 7 + 10);
  for (let position = Math.ceil((start + 1) / step) * step; position < end; position += step) {
    if ((position - ticks.at(-1)) * cellWidth >= spacing && (end - position) * cellWidth >= spacing) ticks.push(position);
  }
  if ((end - ticks.at(-1)) * cellWidth >= spacing) ticks.push(end);
  const axis = element('g', { 'aria-label': 'Residue position' });
  axis.append(element('path', { d: `M${xAt(start)} ${y}H${xAt(end)}`, stroke: AXIS, 'stroke-width': 0.75 }));
  for (const position of ticks) {
    const x = xAt(position - 1) + cellWidth / 2;
    axis.append(
      label(x, y + (above ? -8 : 16), position, { fill: SUBTLE_INK, 'text-anchor': 'middle', 'font-size': 10 }),
      element('path', { d: `M${x} ${y}v${above ? -4 : 4}`, stroke: AXIS, 'stroke-width': 0.75 }),
    );
  }
  svg.append(axis);
}

function drawParent(svg, sequence, start, end, cellWidth, letters, y, xAt) {
  const residues = element('g', { 'aria-label': 'Parent residues' });
  if (cellWidth < 2) {
    residues.append(element('rect', { x: xAt(start), y, width: xAt(end) - xAt(start), height: 3, fill: LINE }));
    svg.append(residues);
    return;
  }
  for (let position = start; position < end; position += 1) {
    const residue = sequence[position];
    const x = xAt(position);
    const group = element('g');
    group.append(
      element('title', {}, `${residue}${position + 1}`),
      element('rect', {
        x, y, width: cellWidth, height: 3,
        fill: residueColor(residue),
      }),
    );
    if (letters) {
      group.append(label(x + cellWidth / 2, y + 16, residue, {
        'text-anchor': 'middle', 'font-family': MONO, 'font-size': Math.min(10.5, cellWidth - 1),
        'font-weight': 550, fill: SUBTLE_INK,
      }));
    }
    residues.append(group);
  }
  svg.append(residues);
}

function drawMotifs(svg, motifs, start, end, xAt, top, bottom) {
  const group = element('g', { 'aria-label': 'Protein motif highlights' });
  for (const motif of motifs) {
    const first = Math.max(start, motif.start);
    const last = Math.min(end, motif.end);
    if (first >= last) continue;
    const rect = element('rect', {
      x: xAt(first), y: top, width: xAt(last) - xAt(first), height: bottom - top,
      fill: '#f8e4a7', 'fill-opacity': 0.36, stroke: '#bc8a24', 'stroke-opacity': 0.25,
    });
    rect.append(element('title', {}, motif.label || `Motif at residues ${motif.start + 1}–${motif.end}`));
    group.append(rect);
  }
  svg.append(group);
}

function drawCleavages(svg, sites, y, start, end, xAt) {
  const group = element('g', { 'aria-label': 'Cleavage sites' });
  group.append(
    label(xAt(start), y, 'Cleavage sites', { fill: SUBTLE_INK, 'font-size': 11, 'font-weight': 700 }),
    element('path', { d: `M${xAt(start)} ${y + 13}H${xAt(end)}`, stroke: LINE }),
  );
  const byPosition = new Map();
  for (const site of sites) {
    const position = site.position;
    if (position < start || position > end) continue;
    const siblings = byPosition.get(position);
    if (siblings) siblings.push(site);
    else byPosition.set(position, [site]);
  }
  for (const [position, siblings] of byPosition) {
    const x = xAt(position);
    const observed = siblings.find(site => site.observed);
    const first = observed || siblings[0];
    const color = first.color || (observed ? '#426c59' : '#a97b35');
    const description = siblings.map(site => site.label || 'Peptide terminus').join(', ');
    const positionLabel = position ? `After residue ${position}` : 'Protein N terminus';
    const marker = element('path', {
      d: `M${x} ${y + 8}v11`, stroke: color, 'stroke-width': observed ? 2 : 1.5,
      'stroke-dasharray': observed ? 'none' : '2 2',
    });
    marker.append(element('title', {}, `${positionLabel}\n${description}`));
    group.append(marker);
  }
  svg.append(group);
}

function coverageScale(tracks, start, end) {
  let maximum = 1;
  for (const track of tracks) {
    for (let position = start; position < end; position += 1) {
      maximum = Math.max(maximum, track.coverage[position]);
    }
  }
  const target = maximum / 4;
  const order = 10 ** Math.floor(Math.log10(target));
  const step = Math.max(1, [1, 2, 5, 10].find(value => value * order >= target) * order);
  return { maximum: step * Math.ceil(maximum / step), step };
}

function drawProfile(svg, track, y, start, end, xAt, scale, color) {
  const left = xAt(start);
  const right = xAt(end);
  const baseline = y + PROFILE_HEIGHT - 6;
  const yAt = count => baseline - (count / scale.maximum) * (PROFILE_HEIGHT - 10);
  const top = yAt(scale.maximum);
  const axisMidpoint = (top + baseline) / 2;
  const group = element('g', { 'aria-label': `Coverage · ${track.name}` });
  for (let count = 0; count <= scale.maximum; count += scale.step) {
    const tickY = yAt(count);
    group.append(
      element('path', { d: `M${left - 4} ${tickY}H${left}`, stroke: AXIS, 'stroke-width': 0.75 }),
      label(left - 8, tickY + 3.5, formatNumber.format(count), {
        fill: SUBTLE_INK, 'font-size': 10, 'text-anchor': 'end',
      }),
    );
    if (count > 0) group.append(element('path', {
      d: `M${left} ${tickY}H${right}`, stroke: LINE, 'stroke-width': 0.7,
    }));
  }
  group.append(label(14, axisMidpoint, 'Peptides per residue', {
    fill: SUBTLE_INK, 'font-size': 10, 'text-anchor': 'middle',
    transform: `rotate(-90 14 ${axisMidpoint})`,
  }));

  const outline = [];
  let previous = 0;
  for (let position = start; position < end; position += 1) {
    const count = track.coverage[position];
    if (count === previous) continue;
    if (previous === 0) outline.push(`M${xAt(position)} ${baseline}`);
    else outline.push(`H${xAt(position)}`);
    outline.push(`V${yAt(count)}`);
    previous = count;
  }
  if (previous) outline.push(`H${right}V${baseline}`);
  if (outline.length) {
    group.append(element('path', {
      d: outline.join(''), fill: DEPTH_FILL, stroke: DEPTH_STROKE, 'stroke-width': 1.15, 'stroke-linejoin': 'round',
    }));
  }
  group.append(element('path', {
    d: `M${left} ${top}V${baseline}H${right}`, fill: 'none', stroke: AXIS, 'stroke-width': 0.75,
  }));

  const stripY = baseline + 7;
  const strip = color ? element('g', { 'aria-label': `Summed residue abundance · ${track.name}` }) : null;
  strip?.append(element('rect', {
    x: left, y: stripY, width: right - left, height: ABUNDANCE_STRIP_HEIGHT, fill: '#f5f8f3',
  }));
  for (let position = start; position < end; position += 1) {
    const count = track.coverage[position];
    if (!count) continue;
    const abundance = residueAbundance(track, position);
    const x = xAt(position);
    const width = xAt(position + 1) - x;
    const description = `Residue ${position + 1}\n${count} ${count === 1 ? 'peptide' : 'peptides'}\nSummed abundance: ${isNumber(abundance) ? formatNumber.format(abundance) : 'Unmeasured'}`;
    const hit = element('rect', { x, y: top, width, height: baseline - top, fill: 'transparent' });
    hit.append(element('title', {}, description));
    group.append(hit);
    if (strip) {
      const bin = element('rect', { x, y: stripY, width, height: ABUNDANCE_STRIP_HEIGHT, fill: color(abundance) });
      bin.append(element('title', {}, description));
      strip.append(bin);
    }
  }
  if (strip) group.append(strip);
  svg.append(group);
}

function drawPlacement(group, track, peptide, lane, y, start, end, cellWidth, xAt, style, letters, selected, onSelect) {
  const first = Math.max(start, peptide.start);
  const last = Math.min(end, peptide.end);
  const x = xAt(first);
  const top = y + lane * ROW;
  const fill = style(peptide.abundance);
  const active = selected?.trackName === track.name && selected.start === peptide.start
    && selected.end === peptide.end && selected.sequence === peptide.sequence;
  const description = [
    peptide.sequence,
    `Residues ${peptide.start + 1}–${peptide.end}`,
    `Abundance: ${isNumber(peptide.abundance) ? formatNumber.format(peptide.abundance) : '—'}`,
    ...(peptide.ambiguous ? ['Maps to multiple positions'] : []),
  ].join('\n');
  const node = element('g', {
    class: 'pg-peptide',
    'data-selected': active,
    ...(onSelect ? { tabindex: 0, role: 'button', 'aria-label': description, 'aria-pressed': active } : {}),
  });
  const box = element('rect', {
    class: 'pg-peptide-box', x, y: top, width: xAt(last) - x, height: PEPTIDE_HEIGHT,
    rx: Math.min(1.5, (xAt(last) - x) / 2), fill,
    stroke: PEPTIDE_OUTLINE, 'stroke-width': Math.min(0.65, cellWidth * 0.45),
  });
  node.append(element('title', {}, description), box);
  if (letters) {
    const fragment = peptide.sequence.slice(first - peptide.start, last - peptide.start);
    const fontSize = Math.min(11.5, cellWidth - 1);
    const text = label(x, top + PEPTIDE_HEIGHT / 2 + fontSize * 0.35, '', {
      'font-family': MONO, 'font-size': fontSize,
      'font-weight': 600, 'text-anchor': 'middle', 'pointer-events': 'none',
    });
    for (let index = 0; index < fragment.length; index += 1) {
      text.append(element('tspan', { x: x + (index + 0.5) * cellWidth }, fragment[index]));
    }
    node.append(text);
  }
  if (onSelect) {
    node.addEventListener('click', () => onSelect(peptide, track, node));
    node.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onSelect(peptide, track, node);
    });
  }
  group.append(node);
}

function visualTracks(tracks, start, end, drawPeptides) {
  return tracks.map(track => {
    const placements = track.placements.filter(peptide => peptide.end > start && peptide.start < end);
    const lanes = [...new Set(placements.map(peptide => peptide.lane))].sort((left, right) => left - right);
    const laneIndex = new Map(lanes.map((lane, index) => [lane, index]));
    return {
      ...track,
      name: track.name || 'Peptides',
      visible: placements,
      laneIndex,
      alignmentHeight: drawPeptides ? Math.max(ROW + 4, lanes.length * ROW) : 0,
    };
  });
}

export function renderPlot({
  sequence, proteinName = 'Parent protein', tracks,
  start = 0, end = sequence.length, cellWidth = 14, mode = 'sequence', showLetters = true,
  colorScale = 'log', scaleScope = 'shared', colorBy = 'abundance',
  motifs = [], cleavageSites = [], onSelect, selected, presentation = 'labelled',
}) {
  const drawDepth = mode === 'coverage' || mode === 'both';
  const drawPeptides = mode === 'sequence' || mode === 'both';
  const compact = presentation === 'compact';
  const drawSampleNames = !compact || tracks.length > 1 || drawDepth;
  const headingHeight = drawSampleNames ? 23 : 0;
  const letters = showLetters && cellWidth >= 8;
  const parentLetters = letters && !compact;
  const left = leftMargin(mode);
  const xAt = position => left + (position - start) * cellWidth;
  const right = xAt(end);
  const rendered = visualTracks(tracks, start, end, drawPeptides);
  const specs = [];
  if (colorBy === 'abundance' && colorScale !== 'off') {
    if (drawDepth) specs.push({ kind: 'depth', name: 'Summed abundance', values: track => profileValues(track, start, end) });
    if (drawPeptides) specs.push({ kind: 'peptides', name: 'Peptide abundance', values: peptideValues });
  }
  const keys = specs.map(spec => ({
    ...spec, scale: colorScale, domain: colorDomain(mergedValues(rendered, spec.values)),
  })).filter(key => isNumber(key.domain.min));
  const sampleKeys = scaleScope === 'sample' && rendered.length > 1;
  const sharedKeys = sampleKeys ? [] : keys;
  const width = Math.ceil(Math.max(left + RIGHT + (keys.length ? 188 : 158), right + RIGHT));
  const availableWidth = width - left - RIGHT;
  const columns = availableWidth >= KEY_WIDTH * 2 ? 2 : 1;
  const profileSpace = drawDepth ? PROFILE_HEIGHT + (keys.some(key => key.kind === 'depth') ? PROFILE_STRIP_SPACE : 0) : 0;
  const titleHeight = compact ? 0 : 24;
  const keyTop = 12 + titleHeight;
  const featureTop = keyTop + keyHeight(sharedKeys, columns);
  const rulerY = featureTop + (mode === 'sequence' ? 32 : 16);
  const stripeY = drawPeptides ? rulerY + 4 : featureTop;
  const showParent = drawPeptides || parentLetters || motifs.length > 0;
  const plotTop = showParent ? stripeY + (parentLetters ? 25 : 12) : featureTop;
  const trackBottom = plotTop + (cleavageSites.length ? CLEAVAGE_HEIGHT : 0) + rendered.reduce((total, track) =>
    total + headingHeight + profileSpace + track.alignmentHeight + (sampleKeys ? keyHeight(keys, columns) : 0) + 10, 0);
  const height = trackBottom + (drawDepth ? 37 : 2);
  const svg = element('svg', {
    width, height, viewBox: `0 0 ${width} ${height}`,
    role: 'group', 'aria-label': `${proteinName} peptide map, residues ${start + 1} through ${end}`,
    'data-presentation': presentation,
    style: 'display:block;max-width:none;background:#fff',
  });
  svg.append(
    element('title', {}, `${proteinName} peptide map`),
    element('rect', { width, height, fill: '#fff' }),
  );
  if (!compact) svg.append(heading(left, 22, proteinName, availableWidth, 15));
  drawColorKeys(svg, sharedKeys, columns, left, keyTop, 'Shared');
  drawMotifs(svg, motifs, start, end, xAt, stripeY - 1, trackBottom - 6);
  if (mode === 'sequence') svg.append(label(left, featureTop + 6, 'Residue position', {
    fill: SUBTLE_INK, 'font-size': 10, 'font-weight': 700,
  }));
  if (drawPeptides) drawRuler(svg, start, end, cellWidth, rulerY, xAt, true);
  if (showParent) drawParent(svg, sequence, start, end, cellWidth, parentLetters, stripeY, xAt);

  let y = plotTop;
  if (cleavageSites.length) {
    drawCleavages(svg, cleavageSites, y, start, end, xAt);
    y += CLEAVAGE_HEIGHT;
  }

  const scale = drawDepth ? coverageScale(rendered, start, end) : null;
  for (const track of rendered) {
    let nextY = y;
    if (drawSampleNames) {
      svg.append(heading(left, y + 13, track.name, availableWidth, 12));
      svg.append(element('path', { d: `M${left} ${y + 18.5}H${right}`, stroke: LINE, 'stroke-width': 0.75 }));
      nextY += headingHeight;
    }
    const trackKeys = sampleKeys ? keys.map(key => ({ ...key, domain: colorDomain(key.values(track)) })) : keys;
    if (sampleKeys) {
      drawColorKeys(svg, trackKeys, columns, left, nextY, track.name);
      nextY += keyHeight(trackKeys, columns);
    }
    if (drawDepth) {
      const key = trackKeys.find(key => key.kind === 'depth');
      drawProfile(svg, track, nextY, start, end, xAt, scale, key ? colorMapper(key.domain, colorScale) : null);
      nextY += profileSpace;
    }
    if (drawPeptides) {
      const key = trackKeys.find(key => key.kind === 'peptides');
      const color = key ? colorMapper(key.domain, colorScale) : () => UNIFORM_PEPTIDE;
      const group = element('g', { 'aria-label': `Peptide alignment · ${track.name}` });
      if (!track.visible.length) {
        group.append(label(left, nextY + 13, 'No mapped peptides in this range', {
          fill: SUBTLE_INK, 'font-size': 11,
        }));
      }
      for (const peptide of track.visible) {
        const lane = track.laneIndex.get(peptide.lane);
        drawPlacement(group, track, peptide, lane, nextY, start, end, cellWidth, xAt, color, letters, selected, onSelect);
      }
      svg.append(group);
    }
    y = nextY + track.alignmentHeight + 10;
  }
  if (drawDepth) {
    drawRuler(svg, start, end, cellWidth, trackBottom, xAt, false);
    svg.append(label((left + right) / 2, trackBottom + 32, 'Residue position', {
      'text-anchor': 'middle', fill: SUBTLE_INK, 'font-weight': 700, 'font-size': 11,
    }));
  }
  return svg;
}

function svgBlob(svg) {
  const copy = svg.cloneNode(true);
  for (const peptide of copy.querySelectorAll('.pg-peptide')) {
    peptide.removeAttribute('data-selected');
    peptide.removeAttribute('tabindex');
    peptide.removeAttribute('role');
    peptide.removeAttribute('aria-pressed');
  }
  const source = new XMLSerializer().serializeToString(copy);
  return new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function downloadSvg(svg, filename = 'peptide-map.svg') {
  download(svgBlob(svg), filename);
}

export async function downloadPng(svg, filename = 'peptide-map.png') {
  const width = Number(svg.getAttribute('width'));
  const height = Number(svg.getAttribute('height'));
  const scale = Math.min(3, 8192 / width, 8192 / height, Math.sqrt(16_000_000 / (width * height)));
  if (scale < 1) throw new Error('This plot is too large for PNG export. Narrow the residue range or export SVG.');
  const image = new Image();
  const url = URL.createObjectURL(svgBlob(svg));
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('The plot could not be prepared for PNG export.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(width * scale);
    canvas.height = Math.floor(height * scale);
    const renderer = canvas.getContext('2d');
    if (!renderer) throw new Error('PNG export is unavailable in this browser.');
    renderer.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('The plot could not be saved as a PNG.');
    download(png, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}
