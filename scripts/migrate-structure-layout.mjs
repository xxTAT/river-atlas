import fs from 'node:fs';
import path from 'node:path';

const siteRoot = path.resolve(process.cwd());
const catalogRoot = path.join(siteRoot, 'data', 'structures', 'catalog');
const datasetRoot = path.join(siteRoot, 'data', 'structures', 'datasets');
const catalogFiles = ['global-representative.json', 'local-feature.json', 'well-folded.json', 'alternative.json'];
const detailKeys = ['sequence', 'dotBracket', 'description', 'evidence'];

if (path.basename(siteRoot) !== 'river-atlas' || !fs.existsSync(catalogRoot)) {
  throw new Error('Run this migration from the river-atlas site root.');
}

const sitePath = (...parts) => path.join(siteRoot, ...parts);
const relativeWebPath = (...parts) => parts.join('/');

function parseCt(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/);
  const declaredLength = Number(lines[0].trim().split(/\s+/)[0]);
  const rows = lines.slice(1).map((line) => line.trim().split(/\s+/));
  if (!Number.isInteger(declaredLength) || rows.length > declaredLength) throw new Error(`Invalid CT length: ${filePath}`);
  const sequence = rows.map((columns) => columns[1]).join('');
  const pairs = [];
  for (const columns of rows) {
    const left = Number(columns[0]); const right = Number(columns[4]);
    if (right > left) pairs.push([left, right]);
  }
  const dotBracket = Array(declaredLength).fill('.');
  for (const [left, right] of pairs) { dotBracket[left - 1] = '('; dotBracket[right - 1] = ')'; }
  return { declaredLength, sequence, dotBracket: dotBracket.join(''), pairs, complete: rows.length === declaredLength };
}

function moveIfPresent(source, destination) {
  if (!source || !fs.existsSync(source)) return false;
  if (fs.existsSync(destination)) throw new Error(`Destination already exists: ${destination}`);
  fs.renameSync(source, destination);
  return true;
}

for (const catalogName of catalogFiles) {
  const catalogPath = path.join(catalogRoot, catalogName);
  const records = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  for (const record of records) {
    if (!record.id || !record.heatmapDataset) throw new Error(`Missing id or heatmapDataset in ${catalogName}`);
    if (typeof record.files === 'object' && record.detailFile) continue;
    const structureDir = path.join(datasetRoot, record.heatmapDataset, record.id);
    fs.mkdirSync(structureDir, { recursive: true });

    const legacyPrefix = typeof record.files === 'string' ? record.files : '';
    const files = {};
    const moveMap = [
      ['ct', legacyPrefix ? sitePath('data', 'files', `${legacyPrefix}.ct`) : '', 'structure.ct'],
      ['dbn', legacyPrefix ? sitePath('data', 'files', `${legacyPrefix}.dbn`) : '', 'structure.dbn'],
      ['bpseq', legacyPrefix ? sitePath('data', 'files', `${legacyPrefix}.bpseq`) : '', 'structure.bpseq'],
      ['svg', record.svg ? sitePath(...record.svg.split('/')) : '', 'structure.svg']
    ];
    for (const [kind, source, filename] of moveMap) {
      const destination = path.join(structureDir, filename);
      if (moveIfPresent(source, destination) || fs.existsSync(destination)) files[kind] = relativeWebPath('data', 'structures', 'datasets', record.heatmapDataset, record.id, filename);
    }

    const detailPath = path.join(structureDir, 'structure.json');
    const detail = fs.existsSync(detailPath) ? JSON.parse(fs.readFileSync(detailPath, 'utf8')) : { schemaVersion: '1.0', id: record.id };
    for (const key of detailKeys) if (record[key] != null) detail[key] = record[key];
    const legacyDetailPath = sitePath('data', 'structures', `${record.id}.json`);
    if (fs.existsSync(legacyDetailPath)) {
      const legacyDetail = JSON.parse(fs.readFileSync(legacyDetailPath, 'utf8'));
      if (legacyDetail.basePairs) detail.basePairs = legacyDetail.basePairs;
      fs.unlinkSync(legacyDetailPath);
    }

    const ctPath = path.join(structureDir, 'structure.ct');
    if (record.scope === 'Global representative' && fs.existsSync(ctPath)) {
      const parsed = parseCt(ctPath);
      if (parsed.complete && parsed.declaredLength === Number(record.genomeLength)) {
        detail.sequence = parsed.sequence;
        detail.dotBracket = parsed.dotBracket;
        const dbnPath = path.join(structureDir, 'structure.dbn');
        fs.writeFileSync(dbnPath, `>${record.id}\n${parsed.sequence}\n${parsed.dotBracket}\n`, 'utf8');
        files.dbn = relativeWebPath('data', 'structures', 'datasets', record.heatmapDataset, record.id, 'structure.dbn');
      } else {
        if (!detail.sequence || !detail.dotBracket || detail.sequence.length !== detail.dotBracket.length) delete detail.dotBracket;
        detail.validationWarnings = [`CT declares ${parsed.declaredLength} nt but contains ${parsed.sequence.length} nucleotide rows; the downloadable DBN is preserved but cannot be used for online structure rendering until a matching dot-bracket line is supplied.`];
      }
      const chromosome = record.referenceAccession || record.virus.replace(/\s+/g, '_');
      const bedpeLines = ['chrom1\tstart1\tend1\tchrom2\tstart2\tend2'];
      for (const [left, right] of parsed.pairs) if (right <= Number(record.genomeLength)) bedpeLines.push(`${chromosome}\t${left - 1}\t${left}\t${chromosome}\t${right - 1}\t${right}`);
      fs.writeFileSync(path.join(structureDir, 'base-pairs.bedpe'), `${bedpeLines.join('\n')}\n`, 'utf8');
      files.basePairs = relativeWebPath('data', 'structures', 'datasets', record.heatmapDataset, record.id, 'base-pairs.bedpe');
    }

    fs.writeFileSync(detailPath, `${JSON.stringify(detail, null, 2)}\n`, 'utf8');
    record.detailFile = relativeWebPath('data', 'structures', 'datasets', record.heatmapDataset, record.id, 'structure.json');
    record.files = files;
    delete record.svg;
    for (const key of detailKeys) delete record[key];
    if (record.scope === 'Global representative') {
      delete record.mapRegions;
      delete record.span;
      delete record.support;
      delete record.supportPct;
      delete record.entropy;
      delete record.conservation;
      record.coordinates = 'full genome';
    }
  }
  fs.writeFileSync(catalogPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
}

console.log('Structure files migrated to data/structures/datasets/.');
