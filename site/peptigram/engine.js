const sequencePattern = /^[ACDEFGHIKLMNPQRSTVWYBXZJUO]+$/;
const sequenceHeaders = new Set(['sequence', 'peptide', 'peptide sequence', 'amino acid sequence']);
const abundanceHeaders = new Set(['abundance', 'intensity', 'area', 'quantity', 'signal']);
const sampleHeaders = new Set(['sample', 'sample name', 'group', 'condition', 'replicate']);
const nameHeaders = new Set(['name', 'label', 'peptide name', 'peptide id']);
const maxAggregateAbundance = Number.MAX_VALUE / 4;
const metadataHeaders = new Set([
  ...sequenceHeaders, ...nameHeaders, 'uniprot id', 'accession', 'protein', 'protein id',
  'proteins', 'leading razor protein', 'start', 'end', 'start position', 'end position',
  'length', 'mass', 'charge', 'modifications', 'modified sequence', 'reverse',
  'potential contaminant', 'contaminant', 'unique', 'unique (groups)', 'unique (proteins)',
]);

const trimInput = (text) => text.replace(/^\uFEFF/, '').trim();
const headerName = (text) => text.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

function fastaRecords(text) {
  const records = [];
  for (const [index, line] of text.split(/\r?\n|\r/).entries()) {
    const value = line.trim();
    if (value.startsWith('>')) {
      records.push({ name: value.slice(1).trim(), sequence: '', row: index + 1 });
    } else if (value && !value.startsWith(';')) {
      records.at(-1).sequence += value;
    }
  }
  return records;
}

export function parseProteins(text) {
  const input = trimInput(text);
  if (!input) throw new Error('Enter a parent protein sequence or FASTA file.');

  const records = input.startsWith('>') ? fastaRecords(input) : [{ name: '', sequence: input }];
  return records.map((record, index) => {
    const name = record.name || (records.length === 1 ? 'Parent protein' : `Protein ${index + 1}`);
    const id = record.name.split(/\s+/)[0] || name;
    const sequence = record.sequence.replace(/\s/g, '').replace(/\*$/, '').toUpperCase();
    if (!sequencePattern.test(sequence)) {
      throw new Error(`“${name}” needs a protein sequence containing amino acid letters.`);
    }
    return { id, name, sequence };
  });
}

function tableRows(input) {
  const firstLine = input.match(/^[^\S\r\n]*\S[^\r\n]*/m)?.[0] || '';
  const outsideQuotes = firstLine.replace(/"(?:[^"]|"")*"/g, '');
  const delimiter = ['\t', ',', ';'].find((value) => outsideQuotes.includes(value));
  if (!delimiter) {
    return input.split(/\r?\n|\r/).flatMap((line, index) => {
      const value = line.trim();
      return value ? [{ cells: value.split(/\s+/), row: index + 1 }] : [];
    });
  }

  const rows = [];
  let cells = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let row = 1;
  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (character === '"') {
      if (inQuotes && input[index + 1] === '"') {
        field += '"';
        index++;
      } else if (inQuotes || !field.trim()) {
        inQuotes = !inQuotes;
      } else {
        field += character;
      }
    } else if (character === delimiter && !inQuotes) {
      cells.push(field.trim());
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && input[index + 1] === '\n') index++;
      if (inQuotes) {
        field += '\n';
      } else {
        cells.push(field.trim());
        if (cells.some(Boolean)) rows.push({ cells, row });
        cells = [];
        field = '';
        row = line + 1;
      }
      line++;
    } else {
      field += character;
    }
  }
  if (inQuotes) throw new Error(`A quoted field beginning on row ${row} is missing a closing quote.`);
  cells.push(field.trim());
  if (cells.some(Boolean)) rows.push({ cells, row });
  return rows;
}

function peptideSequence(value) {
  const letters = value.replace(/\s/g, '').toUpperCase();
  const flanked = letters.match(/^[A-Z-]\.([A-Z]+)\.[A-Z-]$/);
  return flanked ? flanked[1] : letters;
}

const missingValue = (value) => !value || /^(?:na|n\/a|nan|null|-)$/i.test(value);

function readAbundance(value) {
  if (missingValue(value)) return null;
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return NaN;
  return Number(value);
}

export function parsePeptides(text) {
  const input = text.replace(/^\uFEFF/, '');
  if (!input.trim()) throw new Error('Enter peptides or upload a peptide file.');

  const peptides = [];
  const samples = new Set();
  const warnings = [];
  let hasAbundance = false;

  function addPeptide(sequence, name, row, abundanceValue = '', sample = '') {
    let abundance = readAbundance(abundanceValue);
    if (Number.isNaN(abundance)) {
      warnings.push(`Row ${row}${sample ? ` (${sample})` : ''} has a non-numeric abundance.`);
      abundance = null;
    } else if (Math.abs(abundance) > maxAggregateAbundance) {
      warnings.push(`Row ${row}${sample ? ` (${sample})` : ''} has an abundance too large to plot.`);
      abundance = null;
    } else if (abundance !== null) {
      hasAbundance = true;
    }
    if (sample) samples.add(sample);
    peptides.push({ sequence, name: name || null, abundance, sample: sample || null, row });
  }

  function readPeptide(value, row) {
    const sequence = peptideSequence(value || '');
    if (sequencePattern.test(sequence)) return sequence;
    warnings.push(`Row ${row} was skipped because it has no valid peptide sequence.`);
    return null;
  }

  if (input.trimStart().startsWith('>')) {
    for (const record of fastaRecords(input)) {
      const sequence = readPeptide(record.sequence, record.row);
      if (sequence) addPeptide(sequence, record.name, record.row);
    }
  } else {
    const rows = tableRows(input);
    const firstCells = rows[0]?.cells || [];
    const candidateHeaders = firstCells.map(headerName);
    const headerSequenceIndex = candidateHeaders.findIndex((value) => sequenceHeaders.has(value));
    const firstCell = firstCells[0] || '';
    const normalizedFirstCell = candidateHeaders[0];
    const singleColumnHeader = rows.length > 1 && normalizedFirstCell && (
      firstCell === normalizedFirstCell || firstCell === normalizedFirstCell[0].toUpperCase() + normalizedFirstCell.slice(1)
    );
    const headerlessAbundance = headerSequenceIndex === 0 && Number.isFinite(readAbundance(firstCells[1]));
    const hasHeader = headerSequenceIndex >= 0 && (
      firstCells.length > 1 ? !headerlessAbundance : singleColumnHeader
    );
    const headers = hasHeader ? candidateHeaders : [];
    const sequenceIndex = hasHeader ? headerSequenceIndex : 0;
    const legacyTable = ['uniprot id', 'start position', 'end position'].every((value) => headers.includes(value));
    const abundanceIndex = hasHeader ? headers.findIndex((value) => abundanceHeaders.has(value)) : 1;
    const sampleIndex = hasHeader ? headers.findIndex((value) => sampleHeaders.has(value)) : 2;
    const nameIndex = headers.findIndex((value) => nameHeaders.has(value));
    const wideColumns = hasHeader && (legacyTable || (abundanceIndex < 0 && sampleIndex < 0))
      ? headers.flatMap((header, index) => header && !metadataHeaders.has(header) ? [index] : [])
      : [];

    if (hasHeader) rows.shift();
    if (sampleIndex >= 0 && hasHeader) {
      for (const { cells } of rows) {
        if (cells[sampleIndex]) samples.add(cells[sampleIndex]);
      }
    }
    for (const column of wideColumns) samples.add(firstCells[column]);

    for (const { cells, row } of rows) {
      const sequence = readPeptide(cells[sequenceIndex], row);
      if (!sequence) continue;

      if (wideColumns.length) {
        let observed = false;
        for (const column of wideColumns) {
          const value = cells[column];
          if (missingValue(value)) continue;
          addPeptide(sequence, cells[nameIndex], row, value, firstCells[column]);
          observed = true;
        }
        if (!observed) warnings.push(`Row ${row} was skipped because every sample value is missing.`);
      } else {
        addPeptide(sequence, cells[nameIndex], row, cells[abundanceIndex], cells[sampleIndex]);
      }
    }
  }

  if (!peptides.length) throw new Error('No valid peptides were found. Use one amino acid sequence per line or a table with a Peptide column.');
  return { peptides, samples: [...samples], hasAbundance, warnings };
}

export function packPeptides(placements, gap = 1) {
  const laneEnds = [];
  const ordered = [...placements].sort((a, b) => a.start - b.start || b.end - a.end || a.sequence.localeCompare(b.sequence));
  const packed = ordered.map((placement) => {
    const available = laneEnds.findIndex((end) => end + gap <= placement.start);
    const lane = available < 0 ? laneEnds.length : available;
    laneEnds[lane] = placement.end;
    return { ...placement, lane };
  });
  return { placements: packed, laneCount: laneEnds.length };
}

export function summarizeResidues(placements, length) {
  const coverage = Array(length).fill(0);
  const abundance = Array(length).fill(0);
  const abundanceMeasured = Array(length).fill(false);
  const starts = Array(length).fill(0);
  const ends = Array(length).fill(0);
  for (const { start, end, abundance: value } of placements) {
    coverage[start]++;
    starts[start]++;
    ends[end - 1]++;
    if (end < length) coverage[end]--;
    if (Number.isFinite(value)) {
      for (let position = start; position < end; position++) {
        abundance[position] += value;
        abundanceMeasured[position] = true;
      }
    }
  }

  let coveredResidues = 0;
  for (let position = 0; position < length; position++) {
    if (position) coverage[position] += coverage[position - 1];
    if (coverage[position]) coveredResidues++;
  }

  return { coverage, abundance, abundanceMeasured, starts, ends, coveredResidues, coveragePercent: length ? 100 * coveredResidues / length : 0 };
}

function sumObservations(summary, value) {
  summary.observationCount++;
  if (value === null) return;
  summary.abundance = (summary.abundance ?? 0) + value;
  if (Math.abs(summary.abundance) > maxAggregateAbundance) {
    throw new Error('Combined abundance is too large to plot. Rescale the abundance values and try again.');
  }
}

function collectObservations(peptides, sample) {
  const groups = new Map();
  for (const peptide of peptides) {
    if (sample !== null && peptide.sample !== sample) continue;

    const { sequence, name, abundance } = peptide;
    if (!groups.has(sequence)) {
      groups.set(sequence, { sequence, name, abundance: null, observationCount: 0, samples: new Map() });
    }
    const group = groups.get(sequence);
    sumObservations(group, abundance);
    if (peptide.sample === null) continue;
    if (!group.samples.has(peptide.sample)) {
      group.samples.set(peptide.sample, { sample: peptide.sample, abundance: null, observationCount: 0 });
    }
    sumObservations(group.samples.get(peptide.sample), abundance);
  }

  return [...groups.values()].map(({ samples, ...group }) => ({
    ...group, sampleCount: samples.size, sampleAbundances: [...samples.values()],
  }));
}

export function buildPeptideMap(proteinSequence, peptides, { matchIL = false, sample = null, gap = 1 } = {}) {
  const searchSequence = matchIL ? proteinSequence.replace(/I/g, 'L') : proteinSequence;
  const observations = collectObservations(peptides, sample);
  const placements = [];
  const unmatched = [];
  let minAbundance = null;
  let maxAbundance = null;
  let observationCount = 0;
  let absoluteAbundanceSum = 0;

  for (const peptide of observations) {
    observationCount += peptide.observationCount;
    const query = matchIL ? peptide.sequence.replace(/I/g, 'L') : peptide.sequence;
    const positions = [];
    let start = query ? searchSequence.indexOf(query) : -1;
    while (start !== -1) {
      positions.push(start);
      start = searchSequence.indexOf(query, start + 1);
    }

    if (!positions.length) {
      unmatched.push(peptide);
      continue;
    }
    if (peptide.abundance !== null) {
      absoluteAbundanceSum += Math.abs(peptide.abundance) * positions.length;
      if (absoluteAbundanceSum > maxAggregateAbundance) {
        throw new Error('Combined abundance is too large to plot. Rescale the abundance values and try again.');
      }
      minAbundance = Math.min(minAbundance ?? peptide.abundance, peptide.abundance);
      maxAbundance = Math.max(maxAbundance ?? peptide.abundance, peptide.abundance);
    }
    for (const position of positions) {
      placements.push({ ...peptide, start: position, end: position + query.length, ambiguous: positions.length > 1 });
    }
  }

  return {
    ...packPeptides(placements, gap),
    ...summarizeResidues(placements, proteinSequence.length),
    unmatched, mappedCount: observations.length - unmatched.length, observationCount, minAbundance, maxAbundance,
  };
}
