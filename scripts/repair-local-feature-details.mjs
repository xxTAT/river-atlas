import fs from 'node:fs';
import path from 'node:path';

const siteRoot = path.resolve(process.cwd());
const catalogPath = path.join(siteRoot, 'data', 'structures', 'catalog', 'local-feature.json');

if (path.basename(siteRoot) !== 'river-atlas' || !fs.existsSync(catalogPath)) {
  throw new Error('Run this script from the river-atlas site root.');
}

const resolveWebPath = (webPath) => path.join(siteRoot, ...String(webPath).split('/'));

function readFasta(record) {
  const webPath = record.files?.fasta;
  if (!webPath || webPath === '-') return null;
  const filePath = resolveWebPath(webPath);
  if (!fs.existsSync(filePath)) return null;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 3 || !lines[0].startsWith('>')) return null;
  const sequence = lines[1];
  const dotBracket = lines[2];
  if (!sequence || sequence.length !== dotBracket.length) return null;
  return { sequence, dotBracket, sourceFormat: 'FASTA + dot-bracket' };
}

function readCt(record) {
  const webPath = record.files?.ct;
  if (!webPath || webPath === '-') return null;
  const filePath = resolveWebPath(webPath);
  if (!fs.existsSync(filePath)) return null;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter((line) => line.trim());
  const declaredLength = Number(lines[0].trim().split(/\s+/)[0]);
  const rows = lines.slice(1).map((line) => line.trim().split(/\s+/)).filter((columns) => columns.length >= 5);
  const length = Number.isInteger(declaredLength) && declaredLength > 0 ? Math.min(declaredLength, rows.length) : rows.length;
  if (!length) return null;
  const sequence = rows.slice(0, length).map((columns) => columns[1]).join('');
  const pairs = rows.slice(0, length).map((columns) => [Number(columns[0]), Number(columns[4])]).filter(([left, right]) => Number.isInteger(left) && Number.isInteger(right) && left >= 1 && right > left && right <= length);
  const symbols = [['(', ')'], ['[', ']'], ['{', '}'], ['<', '>']];
  const layers = [];
  const assignments = [];
  const crosses = ([left, right], [otherLeft, otherRight]) => (left < otherLeft && otherLeft < right && right < otherRight) || (otherLeft < left && left < otherRight && otherRight < right);
  for (const pair of pairs) {
    let layer = layers.findIndex((existing) => existing.every((other) => !crosses(pair, other)));
    if (layer < 0) { layer = layers.length; layers.push([]); }
    layers[layer].push(pair); assignments.push([pair, layer]);
  }
  const dot = Array(length).fill('.');
  for (const [[left, right], layer] of assignments) {
    if (layer >= symbols.length) continue;
    dot[left - 1] = symbols[layer][0]; dot[right - 1] = symbols[layer][1];
  }
  const warnings = [];
  if (rows.length !== declaredLength) warnings.push(`CT declares ${declaredLength} nt but contains ${rows.length} rows.`);
  if (layers.length > symbols.length) warnings.push(`${layers.length - symbols.length} pseudoknot layers exceed supported dot-bracket symbols and were omitted.`);
  return { sequence, dotBracket: dot.join(''), sourceFormat: 'CT', warnings };
}

const records = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
let fromFasta = 0;
let fromCt = 0;
let failed = 0;

for (const record of records) {
  record.coordinateSystem = record.coordinateSystem || '0-based';
  const parsedFasta = readFasta(record);
  const parsedCt = readCt(record);
  const parsed = parsedCt || parsedFasta;
  if (!parsed) { failed += 1; continue; }
  if (parsedCt) fromCt += 1; else fromFasta += 1;
  const detail = {
    schemaVersion: '1.0',
    id: record.id,
    sequence: parsed.sequence,
    dotBracket: parsed.dotBracket,
    description: record.title || '',
    wellfolded: record.wellfolded === true || String(record.wellfolded).toLowerCase() === 'true',
    evidence: [],
    sourceFormat: parsed.sourceFormat
  };
  if (parsed.warnings?.length) detail.validationWarnings = parsed.warnings;
  const detailPath = resolveWebPath(record.detailFile);
  fs.mkdirSync(path.dirname(detailPath), { recursive: true });
  fs.writeFileSync(detailPath, `${JSON.stringify(detail, null, 2)}\n`, 'utf8');
  if (record.files?.bedpe && record.files.bedpe !== '-') record.files.basePairs = record.files.bedpe;
}

fs.writeFileSync(catalogPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ records: records.length, fromFasta, fromCt, failed }));
