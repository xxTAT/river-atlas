import fs from 'node:fs';
import path from 'node:path';

const siteRoot = path.resolve(process.cwd());
const catalogRoot = path.join(siteRoot, 'data', 'structures', 'catalog');
const catalogFiles = ['global-representative.json', 'local-feature.json', 'well-folded.json', 'alternative.json'];

if (path.basename(siteRoot) !== 'river-atlas' || !fs.existsSync(catalogRoot)) {
  throw new Error('Run this script from the river-atlas site root.');
}

const parseCtPairs = (filePath, genomeLength) => {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter((line) => line.trim());
  const pairs = [];
  for (const line of lines.slice(1)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 5) continue;
    const left = Number(columns[0]);
    const right = Number(columns[4]);
    if (!Number.isInteger(left) || !Number.isInteger(right) || left < 1 || right <= left || right > genomeLength) continue;
    pairs.push([left, right]);
  }
  return pairs;
};

let generated = 0;
for (const catalogName of catalogFiles) {
  const catalogPath = path.join(catalogRoot, catalogName);
  const records = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  for (const record of records) {
    const ctWebPath = record.files?.ct;
    if (!ctWebPath || !record.heatmapDataset || !record.id) continue;
    const ctPath = path.join(siteRoot, ...ctWebPath.split('/'));
    if (!fs.existsSync(ctPath)) continue;
    const structureDir = path.dirname(ctPath);
    const genomeLength = Number(record.genomeLength);
    if (!Number.isFinite(genomeLength) || genomeLength < 1) continue;
    const chromosome = record.referenceAccession || String(record.virus || 'genome').replace(/\s+/g, '_');
    const pairs = parseCtPairs(ctPath, genomeLength);
    const lines = ['chrom1\tstart1\tend1\tchrom2\tstart2\tend2', ...pairs.map(([left, right]) => `${chromosome}\t${left - 1}\t${left}\t${chromosome}\t${right - 1}\t${right}`)];
    const basePairsPath = path.join(structureDir, 'base-pairs.bedpe');
    fs.writeFileSync(basePairsPath, `${lines.join('\n')}\n`, 'utf8');
    record.files = { ...(record.files || {}), basePairs: ctWebPath.replace(/structure\.ct$/, 'base-pairs.bedpe') };
    generated += 1;
  }
  fs.writeFileSync(catalogPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
}

console.log(`Generated ${generated} structure base-pair BEDPE files.`);
