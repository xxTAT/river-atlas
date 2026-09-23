const STRUCTURE_TYPE_INDEX_URL = 'data/structures/catalog/index.json';
const DEFAULT_STRUCTURE_TYPE = 'global-representative';
const structureTypeCache = new Map();
const structureDetailCache = new Map();
let structureTypeIndexPromise = null;
const ui = (english, chinese) => window.RiverI18n?.pick(english, chinese) ?? english;
const localizedTypeLabel = (type) => {
  const chinese = { 'global-representative': '全局代表性结构', 'local-feature': '局部结构特征', 'well-folded': 'Well-folded 结构', alternative: 'Alternative 结构' };
  return ui(type?.label || type?.id || '', chinese[type?.id] || type?.label || type?.id || '');
};

async function loadStructureTypeIndex() {
  if (!structureTypeIndexPromise) {
    structureTypeIndexPromise = fetch(STRUCTURE_TYPE_INDEX_URL).then(async (response) => {
      if (!response.ok) throw new Error(`structure catalog HTTP ${response.status}`);
      const index = await response.json();
      if (!Array.isArray(index.types) || !index.types.length) throw new Error('structure catalog has no types');
      return index;
    });
  }
  return structureTypeIndexPromise;
}

async function loadStructureType(typeId) {
  const index = await loadStructureTypeIndex();
  const type = index.types.find((item) => item.id === typeId) || index.types.find((item) => item.id === index.defaultType) || index.types[0];
  if (!structureTypeCache.has(type.id)) {
    const request = fetch(new URL(type.file, new URL(STRUCTURE_TYPE_INDEX_URL, window.location.href))).then(async (response) => {
      if (!response.ok) throw new Error(`${type.file}: HTTP ${response.status}`);
      const records = await response.json();
      if (!Array.isArray(records)) throw new Error(`${type.file}: expected a JSON array`);
      return records.map((record) => {
        const numeric = (value) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
        const files = record.files && typeof record.files === 'object'
          ? Object.fromEntries(Object.entries(record.files).filter(([, value]) => value && value !== '-'))
          : record.files;
        if (files && typeof files === 'object' && !files.basePairs && files.bedpe) files.basePairs = files.bedpe;
        return {
          ...record,
          files,
          support: numeric(record.support),
          supportPct: numeric(record.supportPct),
          entropy: numeric(record.entropy ?? record.ambiguity),
          ambiguity: numeric(record.ambiguity ?? record.entropy),
          conservation: numeric(record.conservation),
          span: numeric(record.span),
          wellfolded: record.wellfolded === true || String(record.wellfolded).toLowerCase() === 'true',
          structureType: type.id
        };
      });
    });
    structureTypeCache.set(type.id, request);
  }
  return structureTypeCache.get(type.id);
}

async function loadAllStructureTypes() {
  const index = await loadStructureTypeIndex();
  return (await Promise.all(index.types.map((type) => loadStructureType(type.id)))).flat();
}

const structureRecordKey = (record) => `${record?.heatmapDataset || ''}::${record?.id || ''}`;

function alternativePairInfo(record) {
  const match = String(record?.id || '').match(/^(.*?)(\d+)([ab])$/i);
  if (!match) return null;
  const [, prefix, number, sideValue] = match;
  const side = sideValue.toLowerCase();
  return {
    prefix,
    number,
    pairNumber: Number(number),
    side,
    pairKey: `${prefix}${number}`,
    otherId: `${prefix}${number}${side === 'a' ? 'b' : 'a'}`
  };
}

function sortAlternativeRecords(records) {
  const groups = new Map();
  const unpaired = [];
  records.forEach((record) => {
    const info = alternativePairInfo(record);
    if (!info) { unpaired.push(record); return; }
    const key = `${record.heatmapDataset || ''}::${info.pairKey}`;
    if (!groups.has(key)) groups.set(key, { info, records: [] });
    groups.get(key).records.push(record);
  });
  const grouped = [...groups.values()].sort((a, b) => {
    const datasetOrder = String(a.records[0]?.heatmapDataset || '').localeCompare(String(b.records[0]?.heatmapDataset || ''));
    return datasetOrder || a.info.pairNumber - b.info.pairNumber || a.info.pairKey.localeCompare(b.info.pairKey);
  });
  return grouped.flatMap((group) => group.records.sort((a, b) => {
    const aSide = alternativePairInfo(a)?.side === 'a' ? 0 : 1;
    const bSide = alternativePairInfo(b)?.side === 'a' ? 0 : 1;
    return aSide - bSide || a.id.localeCompare(b.id);
  })).concat(unpaired.sort((a, b) => a.id.localeCompare(b.id)));
}

function pairedAlternativeRecord(record, records) {
  const info = alternativePairInfo(record);
  if (!info) return null;
  return records.find((candidate) => candidate.id === info.otherId && candidate.heatmapDataset === record.heatmapDataset) || null;
}

async function findStructureById(id, typeHint = '', datasetHint = '') {
  if (!id) return null;
  const index = await loadStructureTypeIndex();
  const orderedTypes = typeHint
    ? [typeHint, ...index.types.map((type) => type.id).filter((typeId) => typeId !== typeHint)]
    : index.types.map((type) => type.id);
  for (const typeId of orderedTypes) {
    const candidates = (await loadStructureType(typeId)).filter((item) => item.id === id);
    const record = candidates.find((item) => !datasetHint || item.heatmapDataset === datasetHint) || (!datasetHint ? candidates[0] : null);
    if (record) return record;
  }
  return null;
}

const structureLink = (page, record) => {
  const query = new URLSearchParams({ id: record.id, type: record.structureType || DEFAULT_STRUCTURE_TYPE });
  if (record.heatmapDataset) query.set(page === 'heatmap.html' ? 'map' : 'dataset', record.heatmapDataset);
  return `${page}?${query}`;
};
const structureFile = (record, kind) => {
  if (record?.files && typeof record.files === 'object') {
    const value = record.files[kind] || (kind === 'basePairs' ? record.files.bedpe : '');
    return value && value !== '-' ? value : '';
  }
  if (kind === 'svg') return record?.svg || '';
  if (typeof record?.files === 'string' && ['ct', 'dbn', 'bpseq'].includes(kind)) return `data/files/${record.files}.${kind}`;
  return '';
};

async function loadStructureDetails(record) {
  if (!record?.detailFile) return record;
  if (!structureDetailCache.has(record.detailFile)) {
    structureDetailCache.set(record.detailFile, fetch(new URL(record.detailFile, window.location.href)).then(async (response) => {
      if (!response.ok) throw new Error(`${record.detailFile}: HTTP ${response.status}`);
      return response.json();
    }));
  }
  return { ...record, ...(await structureDetailCache.get(record.detailFile)) };
}

function structureDownloadLinks(record, compact = false) {
  const labels = { ct: 'CT', dbn: 'DBN', bpseq: 'BPSEQ', basePairs: ui('Base-pair BEDPE', '碱基对 BEDPE') };
  const extensions = { ct: 'ct', dbn: 'dbn', bpseq: 'bpseq', basePairs: 'base-pairs.bedpe' };
  return Object.keys(labels).map((kind) => {
    const href = structureFile(record, kind); if (!href) return '';
    const label = compact ? labels[kind] : `${labels[kind]}${kind === 'dbn' ? ui(' / dot-bracket', ' / 点括号') : kind === 'ct' ? ui(' structure', ' 结构') : ''}`;
    return `<a class="${compact ? 'file-link' : ''}" href="${escapeHtml(href)}" download="${escapeHtml(record.id)}.${extensions[kind]}">${label}${compact ? ' ↓' : ` <span>↓ .${extensions[kind]}</span>`}</a>`;
  }).join('');
}

const $ = (selector, root = document) => root.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const unique = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
const params = new URLSearchParams(window.location.search);
const positionOf = (record) => {
  const regions = record.mapRegions || [];
  const explicit = record.position || {};
  return {
    leftStart: explicit.leftStart ?? regions[0]?.start ?? null,
    leftEnd: explicit.leftEnd ?? regions[0]?.end ?? null,
    rightStart: explicit.rightStart ?? regions[1]?.start ?? null,
    rightEnd: explicit.rightEnd ?? regions[1]?.end ?? null
  };
};
const coordinateValue = (value) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const displayCoordinate = (value) => value == null ? '—' : Number(value).toLocaleString();

function fillSelect(id, values, label) {
  const select = document.getElementById(id);
  if (!select) return;
  const currentValue = select.value;
  select.innerHTML = `<option value="">${label}</option>` + unique(values).map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
  const requestedValue = currentValue || params.get(id.replace('filter-', '')) || '';
  select.value = [...select.options].some((option) => option.value === requestedValue) ? requestedValue : '';
}

function queryState() {
  return {
    virus: $('#filter-virus')?.value || '',
    context: $('#filter-context')?.value || '',
    method: $('#filter-method')?.value || '',
    range: $('#filter-range')?.value || '',
    query: $('#filter-query')?.value.trim().toLowerCase() || '',
    left: coordinateValue($('#filter-left')?.value),
    right: coordinateValue($('#filter-right')?.value)
  };
}

function writeQuery(state) {
  const next = new URLSearchParams();
  const type = $('#structure-type')?.value || DEFAULT_STRUCTURE_TYPE;
  if (type !== DEFAULT_STRUCTURE_TYPE) next.set('type', type);
  Object.entries(state).forEach(([key, value]) => { if (value !== '' && value != null) next.set(key, value); });
  const sort = $('#sort-by')?.value;
  const defaultSort = type === DEFAULT_STRUCTURE_TYPE ? 'genomeLength' : 'support';
  if (sort && sort !== defaultSort) next.set('sort', sort);
  history.replaceState(null, '', `${window.location.pathname}${next.toString() ? `?${next}` : ''}`);
}

function matches(record, state) {
  const position = positionOf(record);
  const leftMatch = state.left == null || (position.leftStart != null && position.leftEnd != null && position.leftStart < state.left && state.left < position.leftEnd);
  const rightMatch = state.right == null || (position.rightStart != null && position.rightEnd != null && position.rightStart < state.right && state.right < position.rightEnd);
  return (!state.virus || record.virus === state.virus) && (!state.context || record.context === state.context) && (!state.method || record.method === state.method) && (!state.range || record.range === state.range) && (!state.query || `${record.id} ${record.title} ${record.region} ${record.coordinates}`.toLowerCase().includes(state.query)) && leftMatch && rightMatch;
}

function sortRecords(records, sort) {
  const copy = [...records];
  const direction = ['entropy', 'start'].includes(sort) ? 1 : -1;
  return copy.sort((a, b) => {
    if (['id', 'virus', 'context', 'method'].includes(sort)) return String(a[sort] || '').localeCompare(String(b[sort] || '')) || a.id.localeCompare(b.id);
    const metric = (record) => sort === 'entropy' ? record.entropy ?? record.ambiguity : record[sort];
    const av = sort === 'start' ? Number(positionOf(a).leftStart || 0) : Number(metric(a) || 0);
    const bv = sort === 'start' ? Number(positionOf(b).leftStart || 0) : Number(metric(b) || 0);
    return (av - bv) * direction || a.id.localeCompare(b.id);
  });
}

let currentStructureRecords = [];
let currentStructureTypeLabel = '';
let currentStructureTypeId = DEFAULT_STRUCTURE_TYPE;

function configureResultsTable(isGlobal) {
  const head = $('#results-head'); const sortSelect = $('#sort-by');
  $('.results-table')?.classList.toggle('global-results-table', isGlobal);
  if (head) head.innerHTML = isGlobal
    ? `<tr><th>Structure ID</th><th>Virus / context</th><th>Type</th><th>Genome length</th><th>Downloads</th></tr>`
    : `<tr><th>Structure ID</th><th>Virus / context</th><th>Type</th><th>left start</th><th>left end</th><th>right start</th><th>right end</th><th>${ui('Support', '支持度')}</th><th>${ui('Ambiguity', '歧义')}</th><th>${ui('Downloads', '下载')}</th></tr>`;
  if (sortSelect) {
    const requestedSort = params.get('sort');
    sortSelect.innerHTML = isGlobal
      ? `<option value="genomeLength">Genome length ↓</option><option value="virus">${ui('Virus name ↑', '病毒名称 ↑')}</option><option value="context">${ui('Context ↑', '细胞 / 样本 ↑')}</option>`
      : `<option value="support">${ui('Interaction support ↓', '互作支持度 ↓')}</option><option value="entropy">${ui('Pairing ambiguity ↑', '配对歧义 ↑')}</option><option value="conservation">${ui('Conservation ↓', '保守性 ↓')}</option><option value="span">${ui('Structure span ↓', '结构跨度 ↓')}</option><option value="start">${ui('Genomic coordinate ↑', '基因组坐标 ↑')}</option>`;
    if ([...sortSelect.options].some((option) => option.value === requestedSort)) sortSelect.value = requestedSort;
  }
  const positionSearch = $('.position-search'); if (positionSearch) positionSearch.hidden = isGlobal;
  if (isGlobal) { if ($('#filter-left')) $('#filter-left').value = ''; if ($('#filter-right')) $('#filter-right').value = ''; }
}

function renderResults() {
  const body = $('#results-body');
  if (!body) return;
  const state = queryState();
  writeQuery(state);
  const isGlobal = currentStructureTypeId === DEFAULT_STRUCTURE_TYPE;
  const sort = $('#sort-by')?.value || (isGlobal ? 'genomeLength' : 'support');
  let records = sortRecords(currentStructureRecords.filter((record) => matches(record, state)), sort);
  if (currentStructureTypeId === 'alternative') records = sortAlternativeRecords(records);
  const positionHint = state.left != null || state.right != null ? ` · ${ui('position filter', '位置筛选')} left=${state.left == null ? '—' : state.left.toLocaleString()} / right=${state.right == null ? '—' : state.right.toLocaleString()}` : '';
  const sortLabels = { support: ui('interaction support', '互作支持度'), entropy: ui('pairing ambiguity', '配对歧义'), conservation: ui('conservation', '保守性'), span: ui('structure span', '结构跨度'), start: ui('genomic coordinate', '基因组坐标'), genomeLength: 'Genome length', virus: ui('virus name', '病毒名称'), context: ui('context', '细胞 / 样本') };
  $('#result-summary').textContent = `${currentStructureTypeLabel} · ${ui('showing', '显示')} ${records.length} / ${currentStructureRecords.length} ${ui('structures', '个结构')} · ${ui('sorted by', '当前排序')} ${sortLabels[sort] || sort}${isGlobal ? ` · ${ui('one representative model per dataset', '每个数据集一个代表性结构')}` : positionHint}`;
  if (!records.length) { body.innerHTML = `<tr><td class="empty" colspan="${isGlobal ? 5 : 10}">${ui('No records match these filters. Clear a filter and try again.', '没有符合条件的条目。可以清除筛选条件后重试。')}</td></tr>`; return; }
  if (isGlobal) {
    body.innerHTML = records.map((record) => `<tr>
      <td><a class="id-link" href="${structureLink('structure.html', record)}">${escapeHtml(record.id)}</a><span class="subline">${escapeHtml(record.title)}</span></td>
      <td><strong>${escapeHtml(record.virus)}</strong><span class="subline">${escapeHtml(record.context)} · ${escapeHtml(record.method)}</span></td>
      <td><span class="tag blue">Global representative</span><span class="subline">one model per dataset</span></td>
      <td class="coordinate-cell">${Number(record.genomeLength).toLocaleString()} nt</td>
      <td class="result-downloads">${structureDownloadLinks(record, true) || `<span class="subline">${ui('No files', '暂无文件')}</span>`}</td>
    </tr>`).join('');
    return;
  }
  body.innerHTML = records.map((record) => {
    const pairInfo = currentStructureTypeId === 'alternative' ? alternativePairInfo(record) : null;
    const pairedRecord = pairInfo ? pairedAlternativeRecord(record, currentStructureRecords) : null;
    const pairNav = pairInfo && pairedRecord
      ? `<span class="pair-nav"><span>pair ${pairInfo.number}${pairInfo.side}</span><a href="${structureLink('structure.html', pairedRecord)}" title="${ui('Open paired conformation', '打开配对构象')} ${escapeHtml(pairedRecord.id)}">${ui('Other conformation', '另一构象')} ${pairInfo.side === 'a' ? 'b' : 'a'} ↗</a></span>`
      : pairInfo ? `<span class="pair-nav"><span>pair ${pairInfo.number}${pairInfo.side}</span><small>${ui('Pair not found', '配对构象未收录')}</small></span>` : '';
    const support = Number.isFinite(record.support) ? record.support.toFixed(2) : '—';
    const supportRank = Number.isFinite(record.supportPct) ? `${record.supportPct}th pct` : 'raw support';
    const ambiguity = Number.isFinite(record.entropy) ? record.entropy.toFixed(2) : '—';
    return `<tr>
    <td><a class="id-link" href="${structureLink('structure.html', record)}">${escapeHtml(record.id)}</a><span class="subline">${escapeHtml(record.title)}</span>${pairNav}</td>
    <td><strong>${escapeHtml(record.virus)}</strong><span class="subline">${escapeHtml(record.context)} · ${escapeHtml(record.method)}</span></td>
    <td><span class="tag ${record.scope === 'Alternative' ? 'coral' : record.scope === 'Global representative' ? 'blue' : ''}">${escapeHtml(record.scope)}</span><span class="subline">${escapeHtml(record.range)}${record.topology ? ` · ${escapeHtml(record.topology)}` : ''}</span></td>
    <td class="coordinate-cell">${displayCoordinate(positionOf(record).leftStart)}</td>
    <td class="coordinate-cell">${displayCoordinate(positionOf(record).leftEnd)}<span class="subline">${escapeHtml(record.region)}</span></td>
    <td class="coordinate-cell">${displayCoordinate(positionOf(record).rightStart)}</td>
    <td class="coordinate-cell">${displayCoordinate(positionOf(record).rightEnd)}<span class="subline">${positionOf(record).rightStart == null ? 'single arm / local' : escapeHtml(record.coordinates)}</span></td>
    <td><span class="metric">${support}</span><span class="subline">${supportRank}</span></td>
    <td><span class="metric">${ambiguity}</span><span class="subline">lower is more specific</span></td>
    <td class="result-downloads">${structureDownloadLinks(record, true) || `<span class="subline">${ui('No files', '暂无文件')}</span>`}</td>
  </tr>`;
  }).join('');
}

async function initResults() {
  const body = $('#results-body');
  const typeSelect = $('#structure-type');
  const fieldMap = { virus: 'filter-virus', context: 'filter-context', method: 'filter-method', range: 'filter-range', query: 'filter-query', left: 'filter-left', right: 'filter-right' };
  Object.entries(fieldMap).forEach(([key, id]) => { const element = document.getElementById(id); if (element && params.get(key)) element.value = params.get(key); element?.addEventListener('input', renderResults); element?.addEventListener('change', renderResults); });
  $('#sort-by')?.addEventListener('change', renderResults);
  $('#reset-filters')?.addEventListener('click', () => { Object.values(fieldMap).forEach((id) => { const element = document.getElementById(id); if (element) element.value = ''; }); $('#sort-by').value = currentStructureTypeId === DEFAULT_STRUCTURE_TYPE ? 'genomeLength' : 'support'; renderResults(); });
  try {
    const index = await loadStructureTypeIndex();
    typeSelect.innerHTML = index.types.map((type) => `<option value="${escapeHtml(type.id)}">${escapeHtml(localizedTypeLabel(type))}</option>`).join('');
    const requestedType = index.types.some((type) => type.id === params.get('type')) ? params.get('type') : (index.defaultType || DEFAULT_STRUCTURE_TYPE);
    let loadToken = 0;
    const selectType = async (typeId) => {
      const token = ++loadToken;
      const type = index.types.find((item) => item.id === typeId) || index.types[0];
      typeSelect.value = type.id;
      currentStructureTypeId = type.id;
      configureResultsTable(type.id === DEFAULT_STRUCTURE_TYPE);
      body.innerHTML = `<tr><td class="empty" colspan="${type.id === DEFAULT_STRUCTURE_TYPE ? 5 : 10}">${ui('Loading this structure catalog…', '正在加载该类型的结构目录…')}</td></tr>`;
      $('#result-summary').textContent = `${ui('Loading', '正在加载')} ${localizedTypeLabel(type)}…`;
      try {
        const records = await loadStructureType(type.id);
        if (token !== loadToken) return;
        currentStructureRecords = records;
        currentStructureTypeLabel = localizedTypeLabel(type);
        fillSelect('filter-virus', records.map((item) => item.virus), ui('All viruses', '全部病毒'));
        fillSelect('filter-context', records.map((item) => item.context), ui('All contexts', '全部细胞 / 样本'));
        fillSelect('filter-method', records.map((item) => item.method), ui('All methods', '全部方法'));
        renderResults();
      } catch (error) {
        if (token !== loadToken) return;
        $('#result-summary').textContent = `${localizedTypeLabel(type)} ${ui('failed to load', '加载失败')}：${error.message}`;
        body.innerHTML = `<tr><td class="empty" colspan="10">${ui('Could not read this structure catalog. Use a local static server or GitHub Pages.', '无法读取结构分类文件。请通过本地静态服务器或 GitHub Pages 访问。')}</td></tr>`;
      }
    };
    typeSelect.addEventListener('change', () => selectType(typeSelect.value));
    await selectType(requestedType);
  } catch (error) {
    $('#result-summary').textContent = `${ui('Structure catalog failed to load', '结构目录加载失败')}：${error.message}`;
    body.innerHTML = `<tr><td class="empty" colspan="10">${ui('Could not read data/structures/catalog/index.json.', '无法读取 data/structures/catalog/index.json。')}</td></tr>`;
  }
}

async function renderStructure() {
  const target = $('#structure-content');
  if (!target) return;
  let record = null;
  try {
    const id = params.get('id');
    if (id) record = await findStructureById(id, params.get('type') || '', params.get('dataset') || params.get('map') || '');
    else record = (await loadStructureType(DEFAULT_STRUCTURE_TYPE))[0] || null;
  } catch (error) {
    target.innerHTML = `<div class="error-box">${ui('Structure data failed to load', '结构数据加载失败')}：${escapeHtml(error.message)}。${ui('Use a local static server or GitHub Pages.', '请通过本地静态服务器或 GitHub Pages 访问。')}</div>`;
    return;
  }
  if (!record) { $('#structure-title').textContent = ui('Structure not found', '未找到结构'); $('#structure-subtitle').textContent = `Structure ID: ${params.get('id') || '—'}`; target.innerHTML = `<div class="error-box">${ui('This structure is not in the current catalog. Return to the results explorer and choose another record.', '当前结构目录中没有该条目。请返回结果探索器重新选择。')}</div>`; return; }
  try { record = await loadStructureDetails(record); }
  catch (error) { target.innerHTML = `<div class="error-box">${ui('Structure detail failed to load', '结构详情加载失败')}：${escapeHtml(error.message)}</div>`; return; }
  const isGlobal = record.scope === 'Global representative';
  let pairInfo = null;
  let pairedRecord = null;
  if (record.structureType === 'alternative') {
    pairInfo = alternativePairInfo(record);
    if (pairInfo) {
      try {
        const sameTypeRecords = await loadStructureType(record.structureType);
        pairedRecord = pairedAlternativeRecord(record, sameTypeRecords);
      } catch (error) {
        console.warn('Alternative pair lookup failed', error);
      }
    }
  }
  const hasDotBracket = typeof record.sequence === 'string' && typeof record.dotBracket === 'string' && record.sequence !== '-' && record.dotBracket !== '-' && record.sequence.length === record.dotBracket.length;
  const pairSource = Array.isArray(record.pairs) ? record.pairs : Array.isArray(record.basePairs) ? record.basePairs : [];
  const basePairs = pairSource.map((pair) => {
    const left = Number(Array.isArray(pair) ? pair[0] : pair?.left ?? pair?.i ?? pair?.start1);
    const right = Number(Array.isArray(pair) ? pair[1] : pair?.right ?? pair?.j ?? pair?.start2);
    return Number.isFinite(left) && Number.isFinite(right) ? [left, right] : null;
  }).filter(Boolean);
  const pairLimit = 240;
  const basePairPanel = basePairs.length ? `<article class="panel panel-pad base-pair-panel" style="margin-top:20px"><div class="base-pair-heading"><div><h2>${ui('Base-pair positions', '碱基对位置')}</h2><p class="muted">${ui('From structure.json pairs / basePairs:', '来自 structure.json 的 pairs / basePairs，共')} ${basePairs.length.toLocaleString()} ${ui('pairs.', '对。')}</p></div><span class="tag blue">${basePairs.length.toLocaleString()} pairs</span></div><div class="base-pair-list">${basePairs.slice(0, pairLimit).map(([left, right]) => `<span>${left.toLocaleString()}–${right.toLocaleString()}</span>`).join('')}</div>${basePairs.length > pairLimit ? `<p class="viewer-caption">${ui(`Showing the first ${pairLimit} pairs; download Base-pair BEDPE for all coordinates.`, `当前预览前 ${pairLimit} 对；完整坐标请下载 Base-pair BEDPE。`)}</p>` : ''}</article>` : '';
  const svg = structureFile(record, 'svg');
  const preview = svg ? `<div class="viewer"><img src="${escapeHtml(svg)}" alt="${escapeHtml(record.title)} structure" /></div><p class="viewer-caption">${ui('Structure preview; download the complete files on the right.', '结构预览图；完整结构可在右侧下载。')}</p>` : `<div class="viewer viewer-empty"><p>${ui('No SVG preview is available. Download the CT or DBN file.', '该结构暂未提供 SVG 预览，可下载 CT 或 DBN 文件。')}</p></div>`;
  const dbn = hasDotBracket ? `<pre class="dbn">${escapeHtml(record.dotBracket)}</pre>` : `<div class="info-box">${ui('This record has no dot-bracket string matching its sequence length; downloadable files are still available, but online drawing is unavailable.', '当前记录没有与序列等长的点括号结构；下载文件仍保留，但在线结构绘制暂不可用。')}</div>`;
  const warnings = (record.validationWarnings || []).map((warning) => `<div class="error-box structure-warning">${escapeHtml(warning)}</div>`).join('');
  const metricValue = (value, digits = 2) => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';
  const evidence = Array.isArray(record.evidence) ? record.evidence : [];
  const metricPanel = isGlobal
    ? `<article class="panel panel-pad" style="margin-top:20px"><h2>${ui('Representative model', '代表性模型说明')}</h2><div class="info-box">${ui('Each interaction dataset contributes one global representative structure. Support, ambiguity, and conservation rankings are omitted to avoid misleading cross-dataset comparisons.', '每个互作数据集只产生一个全局代表性结构，不展示支持度、歧义或保守性排名，以免造成跨数据集比较的误解。')}</div></article>`
    : `<article class="panel panel-pad" style="margin-top:20px"><h2>${ui('Evidence metrics', '证据指标')}</h2><div class="metric-list"><div class="metric-row"><span>Interaction support</span><strong>${metricValue(record.support)}${record.supportPct != null && record.supportPct !== '' && Number.isFinite(Number(record.supportPct)) ? ` · ${record.supportPct}th pct` : ''}</strong></div><div class="metric-row"><span>Pairing ambiguity</span><strong>${metricValue(record.entropy ?? record.ambiguity)}</strong></div><div class="metric-row"><span>Conservation</span><strong>${metricValue(record.conservation)}</strong></div><div class="metric-row"><span>Genomic span</span><strong>${record.span != null && record.span !== '' && Number.isFinite(Number(record.span)) ? `${Number(record.span).toLocaleString()} nt` : '—'}</strong></div></div>${evidence.length ? `<h3 style="margin-top:23px">Evidence tags</h3><p>${evidence.map((item) => `<span class="tag" style="margin:0 5px 6px 0">${escapeHtml(item)}</span>`).join('')}</p>` : ''}</article>`;
  const viewerLink = hasDotBracket ? `<a href="${structureLink('viewer.html', record)}">${ui('Open online viewer', '在线查看')} <span>Fornac ↗</span></a>` : '';
  const downloads = structureDownloadLinks(record) || `<p class="muted">${ui('No downloadable structure files.', '暂无可下载结构文件。')}</p>`;
  const pairPanel = pairInfo ? `<article class="panel panel-pad alternative-pair-panel" style="margin-top:20px"><div class="pair-panel-heading"><div><p class="eyebrow">ALTERNATIVE PAIR</p><h2>${ui('Paired conformation', '配对构象')}</h2><p class="muted">${ui(`The two alternative conformations with pair number ${pairInfo.number} belong together.`, `编号 ${escapeHtml(pairInfo.number)} 的两个 alternative 构象属于同一对。`)}</p></div><span class="tag coral">${escapeHtml(pairInfo.side.toUpperCase())}</span></div>${pairedRecord ? `<div class="pair-links"><span class="pair-current">${ui('Current:', '当前：')} ${escapeHtml(record.id)}</span><a class="pair-link" href="${structureLink('structure.html', pairedRecord)}">${ui('View other conformation', '查看另一构象')} ${escapeHtml(pairInfo.side === 'a' ? 'B' : 'A')} · ${escapeHtml(pairedRecord.id)} ↗</a></div>` : `<p class="muted">${ui('The paired conformation is not in the current catalog.', '当前目录中未找到另一构象。')}</p>`}</article>` : '';
  $('#structure-title').textContent = record.title;
  $('#structure-subtitle').textContent = `${record.id} · ${record.virus} · ${record.context} · ${record.method}`;
  target.innerHTML = `<section class="detail-grid">
    <div><article class="panel panel-pad">${preview}</article><article class="panel panel-pad" style="margin-top:20px"><h2>${ui('Dot-bracket structure', '点括号结构')}</h2><p class="muted">${ui('The DBN string is shown here; download the complete files on the right.', '本页面展示 DBN 点括号；完整文件可从右侧下载。')}</p>${dbn}</article>${basePairPanel}${pairPanel}${warnings}</div>
    <aside><article class="panel panel-pad"><h2>${ui('Structure metadata', '结构元数据')}</h2><div class="meta-grid"><div class="meta-item"><span>${ui('Virus', '病毒')}</span><strong>${escapeHtml(record.virus)}</strong></div><div class="meta-item"><span>${ui('Context', '背景')}</span><strong>${escapeHtml(record.context)}</strong></div><div class="meta-item"><span>${ui('Interaction method', '互作方法')}</span><strong>${escapeHtml(record.method)}</strong></div><div class="meta-item"><span>Dataset</span><strong>${escapeHtml(record.heatmapDataset || '—')}</strong></div><div class="meta-item"><span>${ui('Structure type', '结构类型')}</span><strong>${escapeHtml(record.scope)}${record.topology ? ` · ${escapeHtml(record.topology)}` : ''}</strong></div><div class="meta-item"><span>${ui('Region', '区域')}</span><strong>${escapeHtml(record.region)}</strong></div><div class="meta-item"><span>${isGlobal ? 'Genome length' : ui('Coordinates', '坐标')}</span><strong>${isGlobal ? `${Number(record.genomeLength).toLocaleString()} nt` : escapeHtml(record.coordinates)}</strong></div><div class="meta-item"><span>${ui('Base pairs', '碱基对')}</span><strong>${basePairs.length.toLocaleString()} pairs</strong></div></div></article>${metricPanel}<article class="panel panel-pad" style="margin-top:20px"><h2>${ui('Downloads & visualization', '下载与可视化')}</h2><div class="download-list">${viewerLink}<a href="${structureLink('heatmap.html', record)}">${ui('Locate in heatmap', '定位热图')} <span>map ↗</span></a>${downloads}</div></article></aside>
  </section>`;
}

async function initViewer() {
  const select = $('#viewer-structure');
  const typeSelect = $('#viewer-structure-type');
  const canvas = $('#fornac-canvas');
  if (!select || !typeSelect || !canvas) return;
  let viewerRecords = [];
  let renderToken = 0;
  const viewerOptions = (records) => {
    const ordered = records[0]?.structureType === 'alternative' ? sortAlternativeRecords(records) : records;
    return ordered.map((record) => {
      const pairInfo = record.structureType === 'alternative' ? alternativePairInfo(record) : null;
      const pairLabel = pairInfo ? ` · pair ${pairInfo.number}${pairInfo.side}` : '';
      return `<option value="${escapeHtml(structureRecordKey(record))}">${escapeHtml(record.title)}${pairLabel} · ${escapeHtml(record.context)} · ${escapeHtml(record.method)}</option>`;
    }).join('');
  };

  async function render() {
    const summaryRecord = viewerRecords.find((item) => structureRecordKey(item) === select.value) || viewerRecords[0];
    if (!summaryRecord) return;
    const token = ++renderToken;
    $('#viewer-status').textContent = `${ui('Loading structure detail for', '正在读取')} ${summaryRecord.id}…`;
    let record;
    try { record = await loadStructureDetails(summaryRecord); }
    catch (error) {
      if (token !== renderToken) return;
      $('#viewer-status').textContent = `${ui('Structure detail failed to load', '结构详情加载失败')}：${error.message}`;
      $('#viewer-fallback').hidden = false;
      return;
    }
    if (token !== renderToken) return;
    const animation = $('#viewer-animation')?.value === 'true';
    const labelInterval = Number($('#viewer-label-interval')?.value || 10);
    const next = new URLSearchParams(window.location.search);
    next.set('id', record.id);
    next.set('type', record.structureType);
    if (record.heatmapDataset) next.set('dataset', record.heatmapDataset);
    history.replaceState(null, '', `${window.location.pathname}?${next}`);
    $('#viewer-title').textContent = record.title;
    $('#viewer-status').textContent = `${record.virus} · ${record.context} · ${record.scope} · ${record.coordinates}`;
    const support = Number.isFinite(Number(record.support)) ? Number(record.support).toFixed(2) : '—';
    const ambiguity = Number.isFinite(Number(record.entropy ?? record.ambiguity)) ? Number(record.entropy ?? record.ambiguity).toFixed(2) : '—';
    const pairCount = (Array.isArray(record.pairs) ? record.pairs : Array.isArray(record.basePairs) ? record.basePairs : []).length;
    $('#viewer-meta').innerHTML = `<strong>${escapeHtml(record.id)}</strong>${escapeHtml(record.context)} · ${escapeHtml(record.method)} · ${escapeHtml(record.region)}<br />support ${support} · ambiguity ${ambiguity} · ${pairCount.toLocaleString()} pairs`;
    $('#viewer-detail-link').href = structureLink('structure.html', record);
    const hasDotBracket = typeof record.sequence === 'string' && typeof record.dotBracket === 'string' && record.sequence !== '-' && record.dotBracket !== '-' && record.sequence.length === record.dotBracket.length;
    $('#viewer-fallback-dbn').textContent = hasDotBracket ? record.dotBracket : ui('No dot-bracket string is available for this structure.', '当前结构没有可用的点括号记录。');
    $('#viewer-fallback').hidden = true;
    canvas.innerHTML = '';
    if (!hasDotBracket) {
      $('#viewer-status').textContent = ui('This structure has no dot-bracket string matching its sequence length, so it cannot be drawn online.', '当前结构没有与序列等长的点括号记录，无法在线绘制。');
      $('#viewer-fallback').hidden = false;
      return;
    }
    if (!window.fornac || typeof window.fornac.FornaContainer !== 'function') {
      $('#viewer-status').textContent = ui('Fornac did not load; showing the dot-bracket fallback.', 'Fornac 脚本未加载，已切换到点括号回退模式。');
      $('#viewer-fallback').hidden = false;
      return;
    }
    try {
      const container = new window.fornac.FornaContainer('#fornac-canvas', { animation, zoomable: true, initialSize: [900, 510], labelInterval });
      container.addRNA(record.dotBracket, { sequence: record.sequence, name: record.title });
      $('#viewer-status').textContent = `${ui('Loaded', '已加载')} ${record.id} · ${ui('drag, zoom, and inspect base labels', '可拖动、缩放和查看碱基编号')}`;
    } catch (error) {
      $('#viewer-status').textContent = ui('Fornac could not draw this structure; showing the dot-bracket fallback.', 'Fornac 绘制失败，已切换到点括号回退模式。');
      $('#viewer-fallback').hidden = false;
      console.warn('Fornac render failed', error);
    }
  }

  select.addEventListener('change', render);
  typeSelect.addEventListener('change', async () => {
    $('#viewer-status').textContent = ui('Loading this structure type…', '正在加载该类型的结构…');
    viewerRecords = await loadStructureType(typeSelect.value);
    if (typeSelect.value === 'alternative') viewerRecords = sortAlternativeRecords(viewerRecords);
    select.innerHTML = viewerOptions(viewerRecords);
    render();
  });
  $('#viewer-animation')?.addEventListener('change', render);
  $('#viewer-label-interval')?.addEventListener('change', render);
  $('#viewer-reset')?.addEventListener('click', render);
  try {
    const index = await loadStructureTypeIndex();
    typeSelect.innerHTML = index.types.map((type) => `<option value="${escapeHtml(type.id)}">${escapeHtml(localizedTypeLabel(type))}</option>`).join('');
    const requestedRecord = params.get('id') ? await findStructureById(params.get('id'), params.get('type') || '', params.get('dataset') || params.get('map') || '') : null;
    const initialType = requestedRecord?.structureType || (index.types.some((type) => type.id === params.get('type')) ? params.get('type') : index.defaultType);
    typeSelect.value = initialType;
    viewerRecords = await loadStructureType(initialType);
    if (initialType === 'alternative') viewerRecords = sortAlternativeRecords(viewerRecords);
    select.innerHTML = viewerOptions(viewerRecords);
    select.value = requestedRecord ? structureRecordKey(requestedRecord) : viewerRecords[0] ? structureRecordKey(viewerRecords[0]) : '';
    render();
  } catch (error) {
    $('#viewer-status').textContent = `${ui('Structure catalog failed to load', '结构目录加载失败')}：${error.message}`;
    $('#viewer-fallback').hidden = false;
  }
}

function initHeatmap() {
  const canvas = $('#heatmap-canvas');
  const overviewCanvas = $('#heatmap-overview-canvas');
  const tableBody = $('#heatmap-table-body');
  const workspace = $('#heatmap-workspace');
  const resolutionSelect = $('#heatmap-resolution');
  const zoomInput = $('#heatmap-zoom');
  const colorMaxInput = $('#heatmap-color-max');
  const catalogSearch = $('#heatmap-catalog-search');
  const structureSearch = $('#heatmap-structure-search');
  const featureControls = $('#heatmap-feature-controls');
  const featureVisibleInput = $('#heatmap-features-visible');
  const featureSelectedOnlyInput = $('#heatmap-features-selected-only');
  const featureSearch = $('#heatmap-feature-search');
  if (!canvas || !tableBody || !workspace || !resolutionSelect) return;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const formatCoordinate = (value) => Math.round(value).toLocaleString();
  const normalizedText = (value) => String(value || '').toLowerCase().replace(/[\s_-]+/g, '');
  const state = {
    datasets: [], dataset: null, matrixMeta: null, matrixData: null,
    structures: [], structureById: new Map(),
    matrixCache: new Map(), featureCache: new Map(), view: null, structure: null,
    features: [], featureHeader: ['chrom1', 'start1', 'end1', 'chrom2', 'start2', 'end2'], featureSource: null,
    selectedFeature: null, featuresVisible: false, selectedFeatureOnly: false, featureSkipped: 0, featureLoading: false, featureError: '',
    structureBasePairs: [], basePairSource: null, basePairLoading: false, structureLoadingToken: 0,
    colorMax: null, autoColorMax: null,
    dragging: null, suppressClick: false, loadingToken: 0, featureLoadingToken: 0, drawQueued: false
  };

  const matrixLabel = (matrix) => `${matrix.binSize.toLocaleString()} nt · ${matrix.matrixType === 'raw' || String(matrix.normalization).toLowerCase() === 'none' ? 'raw' : matrix.normalization}`;
  const datasetStructures = (dataset) => state.structures.filter((record) => {
    if (record.heatmapDataset) return record.heatmapDataset === dataset.id;
    return normalizedText(record.virus) === normalizedText(dataset.virus) && normalizedText(record.context) === normalizedText(dataset.context) && normalizedText(record.method) === normalizedText(dataset.method);
  });
  const structureRegions0 = () => {
    if (!state.structure || !state.dataset) return [];
    if (Array.isArray(state.structure.mapRegions) && state.structure.mapRegions.length) {
      const offset = state.structure.coordinateSystem === '0-based' ? 0 : 1;
      return state.structure.mapRegions.map((region) => ({ start: Math.max(0, Number(region.start) - offset), end: Number(region.end) }));
    }
    if (state.structure.scope === 'Global representative') return [{ start: 0, end: Number(state.dataset.genomeLength) }];
    return [];
  };
  const featureSourceFor = (dataset, matrix) => {
    const source = matrix?.structureFeatures || dataset?.structureFeatures || dataset?.features;
    return typeof source === 'string' ? { file: source, format: 'BEDPE', coordinateSystem: '0-based' } : source || null;
  };
  const featureLabel = (feature) => feature.name || `Feature ${feature.index + 1}`;
  const featureCoordinates = (feature) => `${feature.chrom1}:${feature.start1.toLocaleString()}–${feature.end1.toLocaleString()} ↔ ${feature.chrom2}:${feature.start2.toLocaleString()}–${feature.end2.toLocaleString()}`;

  function parseBedpe(text, dataset) {
    const defaultHeader = ['chrom1', 'start1', 'end1', 'chrom2', 'start2', 'end2'];
    let header = defaultHeader; let skipped = 0; const records = [];
    text.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim(); if (!trimmed || trimmed.startsWith('#')) return;
      const columns = line.includes('\t') ? line.replace(/\r$/, '').split('\t') : trimmed.split(/\s+/);
      const firstSix = columns.slice(0, 6).map((value) => String(value).trim().toLowerCase());
      if (firstSix.join('|') === defaultHeader.join('|')) { header = columns.map((value) => value.trim()); return; }
      if (columns.length < 6) { skipped += 1; return; }
      const start1 = Number(columns[1]); const end1 = Number(columns[2]); const start2 = Number(columns[4]); const end2 = Number(columns[5]);
      if (![start1, end1, start2, end2].every(Number.isFinite) || start1 < 0 || start2 < 0 || end1 <= start1 || end2 <= start2 || end1 > dataset.genomeLength || end2 > dataset.genomeLength) { skipped += 1; return; }
      const index = records.length; const nameColumn = String(columns[6] || '').trim();
      records.push({
        id: `feature-${index + 1}`, index, chrom1: String(columns[0]).trim(), start1: Math.floor(start1), end1: Math.floor(end1),
        chrom2: String(columns[3]).trim(), start2: Math.floor(start2), end2: Math.floor(end2),
        name: nameColumn && nameColumn !== '.' ? nameColumn : '', columns: columns.map((value) => String(value).trim())
      });
    });
    return { records, header, skipped };
  }

  function downloadBedpe(records, suffix) {
    if (!records.length || !state.dataset) return;
    const lines = [state.featureHeader.join('\t'), ...records.map((feature) => feature.columns.join('\t'))];
    const blob = new Blob([`${lines.join('\n')}\n`], { type: 'text/tab-separated-values;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `${state.dataset.id}_structure-features${suffix}.bedpe`; document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function fullView(dataset) {
    const genomeLength = Number(dataset.genomeLength) || 30000;
    return { x0: 0, x1: genomeLength, y0: 0, y1: genomeLength };
  }

  function clampView(view, dataset) {
    const genomeLength = Number(dataset.genomeLength) || 30000;
    const binSize = Number(state.matrixMeta?.binSize) || 1;
    const span = clamp(Math.max(view.x1 - view.x0, view.y1 - view.y0), Math.max(32, binSize * 8), genomeLength);
    const centerX = (view.x0 + view.x1) / 2;
    const centerY = (view.y0 + view.y1) / 2;
    const x0 = clamp(centerX - span / 2, 0, genomeLength - span);
    const y0 = clamp(centerY - span / 2, 0, genomeLength - span);
    return { x0, x1: x0 + span, y0, y1: y0 + span };
  }

  function currentZoom(dataset) {
    if (!state.view) return 1;
    return (Number(dataset.genomeLength) || 30000) / (state.view.x1 - state.view.x0);
  }

  function syncUrl() {
    if (!state.dataset) return;
    const next = new URLSearchParams();
    next.set('map', state.dataset.id);
    if (state.matrixMeta) next.set('matrix', state.matrixMeta.id);
    if (state.structure) next.set('id', state.structure.id);
    if (state.view) {
      next.set('zoom', currentZoom(state.dataset).toFixed(2));
      next.set('cx', String(Math.round((state.view.x0 + state.view.x1) / 2)));
      next.set('cy', String(Math.round((state.view.y0 + state.view.y1) / 2)));
    }
    history.replaceState(null, '', `${window.location.pathname}?${next}`);
  }

  function heatColor(intensity) {
    const value = clamp(intensity, 0, 1);
    const stops = [[255, 250, 248], [254, 229, 217], [252, 174, 145], [251, 106, 74], [203, 24, 29], [165, 15, 21]];
    const scaled = value * (stops.length - 1); const index = Math.min(stops.length - 2, Math.floor(scaled)); const fraction = scaled - index;
    const rgb = stops[index].map((channel, channelIndex) => Math.round(channel + (stops[index + 1][channelIndex] - channel) * fraction));
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  }

  const formatSignalValue = (value) => {
    if (!Number.isFinite(value)) return '—';
    if (value !== 0 && (Math.abs(value) < .001 || Math.abs(value) >= 100000)) return value.toExponential(3);
    return value.toLocaleString(undefined, { maximumSignificantDigits: 5 });
  };

  function percentile(values, fraction = .99) {
    if (!values.length) return 1;
    values.sort((a, b) => a - b);
    return values[Math.min(values.length - 1, Math.floor(values.length * fraction))] || 1;
  }

  async function parseSparseMatrix(response, dataset, matrix, onProgress) {
    let capacity = 262144;
    let left = new Uint32Array(capacity);
    let right = new Uint32Array(capacity);
    let values = new Float32Array(capacity);
    let count = 0; let skipped = 0; let received = 0; let lastProgress = 0;
    const totalBytes = Number(response.headers.get('content-length')) || 0;
    const samples = [];
    const isOneBased = (matrix.coordinateSystem || dataset.coordinateSystem) === '1-based';

    const grow = () => {
      capacity *= 2;
      const nextLeft = new Uint32Array(capacity); nextLeft.set(left); left = nextLeft;
      const nextRight = new Uint32Array(capacity); nextRight.set(right); right = nextRight;
      const nextValues = new Float32Array(capacity); nextValues.set(values); values = nextValues;
    };
    const consumeLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const columns = trimmed.split(/\s+/);
      if (columns.length < 3) { skipped += 1; return; }
      let x = Number(columns[0]); let y = Number(columns[1]); const value = Number(columns[2]);
      if (isOneBased) { x -= 1; y -= 1; }
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(value) || value <= 0 || x < 0 || y < 0 || x >= dataset.genomeLength || y >= dataset.genomeLength) { skipped += 1; return; }
      if (count >= capacity) grow();
      left[count] = Math.floor(x); right[count] = Math.floor(y); values[count] = value;
      if ((count & 31) === 0 && samples.length < 150000) samples.push(value);
      count += 1;
    };

    if (response.body?.getReader) {
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let remainder = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        received += value.byteLength;
        const chunk = remainder + decoder.decode(value, { stream: true });
        const lines = chunk.split(/\r?\n/); remainder = lines.pop() || '';
        lines.forEach(consumeLine);
        const now = performance.now();
        if (now - lastProgress > 250) { onProgress?.(received, totalBytes, count); lastProgress = now; }
      }
      remainder += decoder.decode(); if (remainder) consumeLine(remainder);
    } else {
      const text = await response.text(); received = text.length;
      text.split(/\r?\n/).forEach(consumeLine);
    }
    return { left: left.slice(0, count), right: right.slice(0, count), values: values.slice(0, count), count, skipped, scaleMax: percentile(samples), overview: null };
  }

  function buildOverview(dataset, matrix, data) {
    if (data.overview) return data.overview;
    const bins = 96; const grid = new Float32Array(bins * bins); const genomeLength = Number(dataset.genomeLength);
    const upper = (matrix.triangle || dataset.matrixFormat?.triangle || 'upper') === 'upper';
    const add = (x, y, value) => {
      const column = clamp(Math.floor(x / genomeLength * bins), 0, bins - 1);
      const row = clamp(Math.floor(y / genomeLength * bins), 0, bins - 1);
      grid[row * bins + column] += value;
    };
    for (let i = 0; i < data.count; i += 1) {
      const x = data.left[i]; const y = data.right[i]; const value = data.values[i];
      add(x, y, value); if (upper && x !== y) add(y, x, value);
    }
    const nonzero = Array.from(grid).filter((value) => value > 0);
    data.overview = { bins, grid, scaleMax: percentile(nonzero) };
    return data.overview;
  }

  function niceTickStep(span) {
    const target = span / 5; const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, target))); const normalized = target / magnitude;
    return (normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1) * magnitude;
  }

  function drawAxes(ctx, size, view) {
    const span = view.x1 - view.x0; const step = niceTickStep(span);
    ctx.font = '9px DM Mono, monospace'; ctx.fillStyle = '#71808b'; ctx.lineWidth = 1; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (let coordinate = Math.ceil(view.x0 / step) * step; coordinate <= view.x1; coordinate += step) {
      const position = (coordinate - view.x0) / span * size; ctx.strokeStyle = 'rgba(16, 41, 56, .08)';
      ctx.beginPath(); ctx.moveTo(position, 0); ctx.lineTo(position, size); ctx.stroke(); ctx.fillText(formatCoordinate(coordinate), clamp(position + 2, 2, size - 40), 4);
    }
    for (let coordinate = Math.ceil(view.y0 / step) * step; coordinate <= view.y1; coordinate += step) {
      const position = (coordinate - view.y0) / span * size; ctx.strokeStyle = 'rgba(16, 41, 56, .08)';
      ctx.beginPath(); ctx.moveTo(0, position); ctx.lineTo(size, position); ctx.stroke(); ctx.save(); ctx.translate(5, clamp(position + 3, 16, size - 3)); ctx.rotate(-Math.PI / 2); ctx.fillText(formatCoordinate(coordinate), 0, 0); ctx.restore();
    }
  }

  function drawSelectedRect(ctx, regionX, regionY, geometry) {
    const { size, view } = geometry; const span = view.x1 - view.x0;
    const x0 = clamp((regionX.start - view.x0) / span * size, 0, size); const x1 = clamp((regionX.end - view.x0) / span * size, 0, size);
    const y0 = clamp((regionY.start - view.y0) / span * size, 0, size); const y1 = clamp((regionY.end - view.y0) / span * size, 0, size);
    if (x1 <= x0 || y1 <= y0) return;
    ctx.fillStyle = 'rgba(234, 119, 95, .16)'; ctx.fillRect(x0, y0, Math.max(2, x1 - x0), Math.max(2, y1 - y0));
    ctx.strokeStyle = '#ea775f'; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, Math.max(2, x1 - x0), Math.max(2, y1 - y0));
  }

  function visibleFeatures() {
    if (!state.featuresVisible) return [];
    if (state.selectedFeatureOnly) return state.selectedFeature ? [state.selectedFeature] : [];
    return state.features;
  }

  function drawFeatureRect(ctx, regionX, regionY, geometry, selected = false) {
    const { size, view } = geometry; const span = view.x1 - view.x0;
    if (regionX.end <= view.x0 || regionX.start >= view.x1 || regionY.end <= view.y0 || regionY.start >= view.y1) return;
    const x0 = clamp((regionX.start - view.x0) / span * size, 0, size); const x1 = clamp((regionX.end - view.x0) / span * size, 0, size);
    const y0 = clamp((regionY.start - view.y0) / span * size, 0, size); const y1 = clamp((regionY.end - view.y0) / span * size, 0, size);
    const width = Math.max(selected ? 4 : 2, x1 - x0); const height = Math.max(selected ? 4 : 2, y1 - y0);
    ctx.fillStyle = selected ? 'rgba(240,162,59,.24)' : 'rgba(49,111,179,.10)'; ctx.fillRect(x0, y0, width, height);
    ctx.strokeStyle = selected ? '#e49a2f' : '#316fb3'; ctx.lineWidth = selected ? 3 : 1.5; ctx.strokeRect(x0, y0, width, height);
  }

  function drawPoint(ctx, x, y, geometry, color, radius = 3) {
    const { size, view } = geometry; const span = view.x1 - view.x0;
    if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) return;
    const px = (x - view.x0) / span * size; const py = (y - view.y0) / span * size;
    ctx.beginPath(); ctx.arc(px, py, radius + 1.5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fill();
    ctx.beginPath(); ctx.arc(px, py, radius, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  }

  function drawFeaturePoint(ctx, feature, geometry, selected = false) {
    const x = (feature.start1 + feature.end1) / 2; const y = (feature.start2 + feature.end2) / 2;
    drawPoint(ctx, x, y, geometry, selected ? '#e49a2f' : '#316fb3', selected ? 4 : 2.8);
    const upper = (state.matrixMeta?.triangle || state.dataset?.matrixFormat?.triangle || 'upper') === 'upper';
    if (upper && (feature.start1 !== feature.start2 || feature.end1 !== feature.end2)) drawPoint(ctx, y, x, geometry, selected ? '#e49a2f' : '#316fb3', selected ? 4 : 2.8);
  }

  function drawFeature(ctx, feature, geometry, selected = false) {
    drawFeaturePoint(ctx, feature, geometry, selected);
  }

  function drawBasePairPoints(ctx, geometry) {
    if (!state.structureBasePairs.length) return;
    const upper = (state.matrixMeta?.triangle || state.dataset?.matrixFormat?.triangle || 'upper') === 'upper';
    state.structureBasePairs.forEach((pair) => {
      const x = (pair.start1 + pair.end1) / 2; const y = (pair.start2 + pair.end2) / 2;
      drawPoint(ctx, x, y, geometry, '#7149a6', 2.6);
      if (upper && (pair.start1 !== pair.start2 || pair.end1 !== pair.end2)) drawPoint(ctx, y, x, geometry, '#7149a6', 2.6);
    });
  }

  function draw() {
    if (!state.dataset || !state.matrixMeta || !state.matrixData) return;
    const dataset = state.dataset; const matrix = state.matrixMeta; const data = state.matrixData;
    const bounds = canvas.getBoundingClientRect(); const size = Math.max(320, Math.floor(Math.min(bounds.width || 640, bounds.height || 640))); const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr; canvas.height = size * dpr; canvas.style.width = `${size}px`; canvas.style.height = `${size}px`;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size, size);
    state.view = clampView(state.view || fullView(dataset), dataset);
    const view = state.view; const span = view.x1 - view.x0; const cells = clamp(Math.ceil(span / matrix.binSize), 4, 640); const cellSize = size / cells;
    const grid = new Float32Array(cells * cells); const upper = (matrix.triangle || dataset.matrixFormat?.triangle || 'upper') === 'upper';
    const add = (x, y, value) => {
      if (x < view.x0 || x >= view.x1 || y < view.y0 || y >= view.y1) return;
      const column = clamp(Math.floor((x - view.x0) / span * cells), 0, cells - 1); const row = clamp(Math.floor((y - view.y0) / span * cells), 0, cells - 1);
      grid[row * cells + column] += value;
    };
    for (let i = 0; i < data.count; i += 1) {
      const x = data.left[i]; const y = data.right[i]; const value = data.values[i];
      add(x, y, value); if (upper && x !== y) add(y, x, value);
    }
    const nonzero = Array.from(grid).filter((value) => value > 0); const automaticMax = percentile(nonzero); const scaleMax = state.colorMax || automaticMax; const logMax = Math.log1p(scaleMax || 1);
    state.autoColorMax = automaticMax;
    ctx.fillStyle = heatColor(0); ctx.fillRect(0, 0, size, size);
    for (let row = 0; row < cells; row += 1) for (let column = 0; column < cells; column += 1) {
      const value = grid[row * cells + column]; if (value <= 0) continue;
      ctx.fillStyle = heatColor(Math.log1p(Math.min(value, scaleMax)) / logMax); ctx.fillRect(column * cellSize, row * cellSize, Math.ceil(cellSize + .25), Math.ceil(cellSize + .25));
    }
    drawAxes(ctx, size, view);
    const regions = structureRegions0(); const geometry = { size, genomeLength: dataset.genomeLength, regions, view, cells, effectiveResolution: span / cells };
    const features = visibleFeatures();
    features.filter((feature) => feature !== state.selectedFeature).forEach((feature) => drawFeature(ctx, feature, geometry, false));
    if (regions.length === 1) drawSelectedRect(ctx, regions[0], regions[0], geometry);
    if (regions.length > 1) { drawSelectedRect(ctx, regions[0], regions[1], geometry); drawSelectedRect(ctx, regions[1], regions[0], geometry); }
    drawBasePairPoints(ctx, geometry);
    if (features.includes(state.selectedFeature)) drawFeature(ctx, state.selectedFeature, geometry, true);
    canvas._heatmapGeometry = geometry; drawOverview(); updateControls();
  }

  function scheduleDraw() {
    if (state.drawQueued) return; state.drawQueued = true;
    requestAnimationFrame(() => { state.drawQueued = false; draw(); });
  }

  function drawOverview() {
    if (!overviewCanvas || !state.matrixData) return;
    const dataset = state.dataset; const overview = buildOverview(dataset, state.matrixMeta, state.matrixData);
    const bounds = overviewCanvas.getBoundingClientRect(); const width = Math.max(220, Math.floor(bounds.width || 640)); const height = Math.max(42, Math.floor(bounds.height || 54)); const dpr = window.devicePixelRatio || 1;
    overviewCanvas.width = width * dpr; overviewCanvas.height = height * dpr;
    const ctx = overviewCanvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
    const cellW = width / overview.bins; const cellH = height / overview.bins; const overviewScaleMax = state.colorMax || overview.scaleMax; const logMax = Math.log1p(overviewScaleMax || 1);
    ctx.fillStyle = heatColor(0); ctx.fillRect(0, 0, width, height);
    for (let row = 0; row < overview.bins; row += 1) for (let column = 0; column < overview.bins; column += 1) {
      const value = overview.grid[row * overview.bins + column]; if (value <= 0) continue;
      ctx.fillStyle = heatColor(Math.log1p(Math.min(value, overviewScaleMax)) / logMax); ctx.fillRect(column * cellW, row * cellH, Math.ceil(cellW + .2), Math.ceil(cellH + .2));
    }
    const genomeLength = Number(dataset.genomeLength); const regions = structureRegions0();
    const miniRect = (regionX, regionY) => {
      const x = regionX.start / genomeLength * width; const y = regionY.start / genomeLength * height; const w = Math.max(3, (regionX.end - regionX.start) / genomeLength * width); const h = Math.max(3, (regionY.end - regionY.start) / genomeLength * height);
      ctx.fillStyle = 'rgba(234,119,95,.22)'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#ea775f'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
    };
    if (regions.length === 1) miniRect(regions[0], regions[0]);
    if (regions.length > 1) { miniRect(regions[0], regions[1]); miniRect(regions[1], regions[0]); }
    if (state.featuresVisible && state.selectedFeature) {
      const feature = state.selectedFeature; const left = { start: feature.start1, end: feature.end1 }; const right = { start: feature.start2, end: feature.end2 };
      const miniFeature = (regionX, regionY) => {
        const x = (regionX.start + regionX.end) / 2 / genomeLength * width; const y = (regionY.start + regionY.end) / 2 / genomeLength * height;
        ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fillStyle = '#e49a2f'; ctx.fill();
      };
      miniFeature(left, right);
      if (feature.start1 !== feature.start2 || feature.end1 !== feature.end2) miniFeature(right, left);
    }
    if (state.structureBasePairs.length) {
      ctx.fillStyle = 'rgba(113,73,166,.72)';
      state.structureBasePairs.forEach((pair) => {
        const x = (pair.start1 + pair.end1) / 2 / genomeLength * width; const y = (pair.start2 + pair.end2) / 2 / genomeLength * height;
        ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
        if (pair.start1 !== pair.start2 || pair.end1 !== pair.end2) ctx.fillRect(Math.round(y), Math.round(x), 2, 2);
      });
    }
    const view = state.view || fullView(dataset); ctx.fillStyle = 'rgba(22,61,74,.10)'; ctx.fillRect(view.x0 / genomeLength * width, view.y0 / genomeLength * height, (view.x1 - view.x0) / genomeLength * width, (view.y1 - view.y0) / genomeLength * height);
    ctx.strokeStyle = '#163d4a'; ctx.lineWidth = 2; ctx.strokeRect(view.x0 / genomeLength * width, view.y0 / genomeLength * height, Math.max(3, (view.x1 - view.x0) / genomeLength * width), Math.max(3, (view.y1 - view.y0) / genomeLength * height));
    overviewCanvas._overviewGeometry = { width, height, genomeLength };
  }

  function updateControls() {
    if (!state.dataset || !state.matrixMeta || !state.matrixData) return;
    const view = state.view || fullView(state.dataset); const zoom = currentZoom(state.dataset); const effective = (view.x1 - view.x0) / Math.max(1, Math.min(640, Math.ceil((view.x1 - view.x0) / state.matrixMeta.binSize)));
    if (zoomInput) zoomInput.value = String(clamp(zoom, 1, 32));
    if (colorMaxInput) colorMaxInput.placeholder = `${ui('Auto', '自动')} ${formatSignalValue(state.autoColorMax)}`;
    const colorStatus = $('#heatmap-color-status');
    if (colorStatus) colorStatus.textContent = state.colorMax == null ? `${ui('Current', '当前')} ${formatSignalValue(state.autoColorMax)} (${ui('viewport P99 auto', '视口 P99 自动值')})` : `${ui('Current', '当前')} ${formatSignalValue(state.colorMax)} (${ui('manual upper bound', '手动固定上限')})`;
    $('#heatmap-overview-status').textContent = `${formatCoordinate(view.x0)}–${formatCoordinate(view.x1)} · ${zoom.toFixed(1)}×`;
    $('#heatmap-status').textContent = `${state.dataset.virus} · ${state.dataset.context} · ${state.dataset.method} · ${matrixLabel(state.matrixMeta)} · ${state.matrixData.count.toLocaleString()} non-zero entries · 0-based · color max ${formatSignalValue(state.colorMax ?? state.autoColorMax)}${state.colorMax == null ? ' auto' : ' manual'}${effective > state.matrixMeta.binSize * 1.05 ? ` · ${ui('about', '当前约')} ${Math.round(effective)} nt / pixel` : ''}`;
  }

  function renderCatalog() {
    const query = normalizedText(catalogSearch?.value); const datasets = state.datasets.filter((dataset) => !query || normalizedText(`${dataset.id} ${dataset.title} ${dataset.virus} ${dataset.context} ${dataset.method} ${dataset.referenceAccession}`).includes(query));
    $('#heatmap-catalog-summary').textContent = `${ui('Showing', '显示')} ${datasets.length} / ${state.datasets.length} ${ui('interaction map datasets · click a row to load', '个热图数据集 · 点击一行加载')}`;
    tableBody.innerHTML = datasets.map((dataset) => {
      const resolutions = dataset.matrices.map((matrix) => `${matrix.binSize} nt`).join(' / '); const normalizations = unique(dataset.matrices.map((matrix) => matrix.matrixType === 'raw' ? 'raw' : matrix.normalization)).join(' / ');
      return `<tr class="heatmap-dataset-row${state.dataset?.id === dataset.id ? ' selected' : ''}" data-dataset="${escapeHtml(dataset.id)}"><td><button type="button" class="dataset-select">${escapeHtml(dataset.title)}</button><span class="subline">${escapeHtml(dataset.id)}</span></td><td>${escapeHtml(dataset.virus)}</td><td>${escapeHtml(dataset.context)}</td><td>${escapeHtml(dataset.method)}</td><td class="coordinate-cell">${Number(dataset.genomeLength).toLocaleString()} nt</td><td>${escapeHtml(resolutions)}</td><td>${escapeHtml(normalizations)}</td><td><span class="tag">${ui('Available', '可加载')}</span></td></tr>`;
    }).join('') || `<tr><td class="empty" colspan="8">${ui('No interaction maps match this search.', '没有符合搜索条件的热图。')}</td></tr>`;
  }

  function renderSelectedDataset() {
    const dataset = state.dataset; if (!dataset) return;
    const hasFeatures = Boolean(dataset.structureFeatures || dataset.features || dataset.matrices.some((matrix) => matrix.structureFeatures));
    $('#heatmap-selected-map').innerHTML = `<div><p class="eyebrow">SELECTED DATASET</p><h2>${escapeHtml(dataset.title)}</h2><p>${escapeHtml(dataset.referenceAccession || 'reference not specified')} · ${Number(dataset.genomeLength).toLocaleString()} nt · ${escapeHtml(dataset.coordinateSystem)} coordinates · upper-triangle sparse matrices</p></div><div class="selected-map-matrices">${dataset.matrices.map((matrix) => `<span>${escapeHtml(matrixLabel(matrix))}</span>`).join('')}<span>${hasFeatures ? 'BEDPE features available' : 'No BEDPE features'}</span></div>`;
    $('#heatmap-title').textContent = `${dataset.title} · interaction map`;
  }

  function renderFeatureSearch() {
    const target = $('#heatmap-feature-results'); if (!target) return;
    if (!state.featureSource || state.featureLoading || state.featureError) { target.innerHTML = ''; return; }
    const query = normalizedText(featureSearch?.value);
    if (!query) { target.innerHTML = `<p class="structure-search-empty">${ui('Search by feature ID, chromosome, or coordinate ·', '输入 Feature 编号、染色体或坐标进行搜索 ·')} ${state.features.length.toLocaleString()} ${ui('features · you can also click a blue box on the map', '个结构特征，也可以直接点击热图中的蓝色框')}</p>`; return; }
    const matches = state.features.filter((feature) => normalizedText(`${feature.id} ${featureLabel(feature)} ${featureCoordinates(feature)} ${feature.columns.join(' ')}`).includes(query)).slice(0, 30);
    target.innerHTML = matches.map((feature) => `<button type="button" class="feature-result${state.selectedFeature?.id === feature.id ? ' selected' : ''}" data-feature="${escapeHtml(feature.id)}"><span><strong>${escapeHtml(featureLabel(feature))}</strong><small>${escapeHtml(feature.id)} · 0-based BEDPE</small></span><span class="coordinate-cell">${escapeHtml(featureCoordinates(feature))}</span></button>`).join('') || `<p class="structure-search-empty">${ui('No matching features.', '没有找到匹配的结构特征。')}</p>`;
  }

  function renderFeatureControls() {
    if (!featureControls) return;
    featureControls.hidden = !state.dataset;
    const hasSource = Boolean(state.featureSource); const ready = hasSource && !state.featureLoading && !state.featureError;
    if (featureVisibleInput) { featureVisibleInput.disabled = !ready; featureVisibleInput.checked = ready && state.featuresVisible; }
    if (featureSelectedOnlyInput) { featureSelectedOnlyInput.disabled = !ready || !state.selectedFeature; featureSelectedOnlyInput.checked = Boolean(state.selectedFeature && state.selectedFeatureOnly); }
    if (featureSearch) featureSearch.disabled = !ready;
    const clearButton = $('#heatmap-feature-clear'); if (clearButton) clearButton.disabled = !ready || !state.selectedFeature;
    const exportAll = $('#heatmap-features-export-all'); if (exportAll) exportAll.disabled = !ready || !state.features.length;
    const exportSelected = $('#heatmap-features-export-selected'); if (exportSelected) exportSelected.disabled = !ready || !state.selectedFeature;
    let status = ui('This map has no structure feature file configured in manifest.json.', '当前热图未在 manifest.json 中配置结构特征文件。');
    if (state.featureLoading) status = `${ui('Reading', '正在读取')} ${state.featureSource.file}…`;
    else if (state.featureError) status = `${ui('Feature loading failed', '结构特征加载失败')}：${state.featureError}`;
    else if (ready) {
      const demo = state.featureSource.demo ? ` · ${ui('demo data', '示例数据')}` : '';
      const skipped = state.featureSkipped ? ` · ${ui('skipped', '已跳过')} ${state.featureSkipped.toLocaleString()} ${ui('malformed or out-of-range records', '条格式错误或越界记录')}` : '';
      const selected = state.selectedFeature ? ` · ${ui('selected', '已选中')} ${featureLabel(state.selectedFeature)}: ${featureCoordinates(state.selectedFeature)}` : '';
      status = `${state.featureSource.file} · ${state.features.length.toLocaleString()} ${ui('valid features', '条有效特征')} · 0-based [start,end)${demo}${skipped}${selected}`;
    }
    $('#heatmap-feature-status').textContent = status;
    renderFeatureSearch();
  }

  function fitSelectedFeature() {
    const feature = state.selectedFeature; if (!feature || !state.dataset || !state.matrixMeta) return;
    const minSpan = Math.max(32, Number(state.matrixMeta.binSize) * 8);
    const span = Math.min(state.dataset.genomeLength, Math.max(feature.end1 - feature.start1, feature.end2 - feature.start2, minSpan) * 2);
    const centerX = (feature.start1 + feature.end1) / 2; const centerY = (feature.start2 + feature.end2) / 2;
    state.view = clampView({ x0: centerX - span / 2, x1: centerX + span / 2, y0: centerY - span / 2, y1: centerY + span / 2 }, state.dataset);
    syncUrl(); scheduleDraw();
  }

  function selectFeature(feature, fit = true) {
    if (!feature) return;
    state.selectedFeature = feature; state.featuresVisible = true;
    if (featureVisibleInput) featureVisibleInput.checked = true;
    $('#heatmap-readout').textContent = `${ui('Selected', '已选中')} ${featureLabel(feature)} · ${featureCoordinates(feature)} · 0-based [start,end)`;
    renderFeatureControls(); if (fit) fitSelectedFeature(); else scheduleDraw();
  }

  function clearFeatureSelection() {
    state.selectedFeature = null; state.selectedFeatureOnly = false;
    if (featureSelectedOnlyInput) featureSelectedOnlyInput.checked = false;
    renderFeatureControls(); scheduleDraw();
  }

  async function loadFeatures(matrix) {
    const dataset = state.dataset; if (!dataset) return;
    const token = ++state.featureLoadingToken; const source = featureSourceFor(dataset, matrix);
    state.featureSource = source; state.features = []; state.selectedFeature = null; state.selectedFeatureOnly = false; state.featureSkipped = 0; state.featureError = ''; state.featureLoading = Boolean(source); state.featuresVisible = false;
    if (featureSearch) featureSearch.value = '';
    renderFeatureControls(); scheduleDraw();
    if (!source) return;
    if ((source.coordinateSystem || '0-based') !== '0-based') {
      state.featureLoading = false; state.featureError = ui('Only 0-based BEDPE coordinates are supported.', '目前仅接受 0-based BEDPE 坐标。'); renderFeatureControls(); return;
    }
    try {
      const featureUrl = new URL(source.file, dataset._baseUrl).href; const cacheKey = featureUrl;
      let parsed = state.featureCache.get(cacheKey);
      if (!parsed) {
        const response = await fetch(featureUrl); if (!response.ok) throw new Error(`${source.file}: HTTP ${response.status}`);
        parsed = parseBedpe(await response.text(), dataset); state.featureCache.set(cacheKey, parsed);
      }
      if (token !== state.featureLoadingToken) return;
      state.features = parsed.records; state.featureHeader = parsed.header; state.featureSkipped = parsed.skipped; state.featureLoading = false;
      renderFeatureControls(); scheduleDraw();
    } catch (error) {
      if (token !== state.featureLoadingToken) return;
      state.featureLoading = false; state.featureError = error.message; renderFeatureControls(); scheduleDraw(); console.warn('Structure feature load failed', error);
    }
  }

  function renderStructureSearch() {
    const target = $('#heatmap-structure-results'); if (!target || !state.dataset) return;
    const candidates = datasetStructures(state.dataset); const query = normalizedText(structureSearch?.value);
    if (!query) { target.innerHTML = `<p class="structure-search-empty">${ui('Enter a keyword to search · this map has', '输入关键词开始搜索 · 当前热图有')} ${candidates.length} ${ui('locatable structures', '个可定位结构')}</p>`; return; }
    const matches = candidates.filter((record) => normalizedText(`${record.id} ${record.title} ${record.region} ${record.coordinates} ${record.scope}`).includes(query)).slice(0, 30);
    target.innerHTML = matches.map((record) => `<button type="button" class="structure-result${structureRecordKey(state.structure) === structureRecordKey(record) ? ' selected' : ''}" data-structure="${escapeHtml(structureRecordKey(record))}"><span><strong>${escapeHtml(record.title)}</strong><small>${escapeHtml(record.id)} · ${escapeHtml(record.context)} · ${escapeHtml(record.method)}</small></span><span class="coordinate-cell">${escapeHtml(record.coordinates)}</span></button>`).join('') || `<p class="structure-search-empty">${ui('No matching structures.', '没有找到匹配结构。')}</p>`;
  }

  function detailBasePairRecords(details) {
    const pairs = Array.isArray(details?.pairs) ? details.pairs : Array.isArray(details?.basePairs) ? details.basePairs : [];
    return pairs.map((pair, index) => {
      const left = Number(pair?.[0]); const right = Number(pair?.[1]);
      if (!Number.isInteger(left) || !Number.isInteger(right) || left < 1 || right <= left || right > Number(state.dataset?.genomeLength)) return null;
      const chrom = state.dataset.referenceAccession || state.dataset.virus || 'genome';
      return { id: `base-pair-${index + 1}`, index, chrom1: chrom, start1: left - 1, end1: left, chrom2: chrom, start2: right - 1, end2: right, columns: [chrom, String(left - 1), String(left), chrom, String(right - 1), String(right)] };
    }).filter(Boolean);
  }

  async function selectStructure(record) {
    if (!record || !state.dataset) return;
    const token = ++state.structureLoadingToken;
    state.structure = record; state.structureBasePairs = []; state.basePairSource = null; state.basePairLoading = false;
    const meta = $('#heatmap-structure-meta'); if (meta) meta.hidden = false;
    const basePairLink = $('#heatmap-base-pairs-link'); if (basePairLink) basePairLink.hidden = true;
    renderStructureSearch();
    const initialRegions = structureRegions0();
    $('#heatmap-region-label').textContent = initialRegions.length ? initialRegions.map((region) => `${Number(region.start).toLocaleString()}–${Number(region.end).toLocaleString()}`).join(' ↔ ') : ui('Reading structure detail…', '读取结构详情…');
    $('#heatmap-region-type').textContent = ui('Reading structure detail and base-pair BEDPE…', '正在读取结构详情和 BEDPE 碱基对…');
    $('#heatmap-meta').textContent = `${record.id} · ${ui('Reading structure files…', '正在读取结构文件…')}`;
    try {
      const detailed = await loadStructureDetails(record);
      if (token !== state.structureLoadingToken) return;
      state.structure = detailed;
      const regions = structureRegions0();
      const isGlobal = detailed.scope === 'Global representative';
      $('#heatmap-region-label').textContent = regions.length ? regions.map((region) => `${Number(region.start).toLocaleString()}–${Number(region.end).toLocaleString()}`).join(' ↔ ') : '—';
      const coordinateNote = detailed.coordinateSystem === '0-based' ? ui('structure and map use 0-based coordinates', '结构与热图均使用 0-based 坐标') : ui('structure coordinates are 1-based and were converted to map 0-based coordinates', '结构坐标为 1-based，叠加时已转换为热图 0-based');
      $('#heatmap-region-type').textContent = isGlobal ? ui('Global representative · map coordinates are 0-based', '全基因组代表性结构 · 坐标为热图 0-based') : `${regions.length > 1 ? ui('two-arm interaction region', '两侧 arm 的对称互作区域') : ui('local structure region', '局部结构区域')} · ${coordinateNote}`;
      const support = !isGlobal && detailed.supportPct != null ? ` · support ${detailed.supportPct}th percentile` : '';
      $('#heatmap-meta').innerHTML = `<strong>${escapeHtml(detailed.id)}</strong> · ${escapeHtml(detailed.scope || '')}${detailed.topology ? ` · ${escapeHtml(detailed.topology)}` : ''}<br />${escapeHtml(detailed.region || 'Genome-wide')}${support}`;
      $('#heatmap-viewer-link').href = structureLink('viewer.html', detailed); $('#heatmap-detail-link').href = structureLink('structure.html', detailed);
      const basePairLink = $('#heatmap-base-pairs-link'); const basePairFile = structureFile(detailed, 'basePairs');
      if (basePairLink) { basePairLink.hidden = !basePairFile; if (basePairFile) { basePairLink.href = basePairFile; basePairLink.download = `${detailed.id}.base-pairs.bedpe`; } }
      state.basePairSource = basePairFile || (Array.isArray(detailed.pairs) || Array.isArray(detailed.basePairs) ? 'detail.pairs' : null);
      state.basePairLoading = Boolean(basePairFile);
      if (basePairFile) {
        const response = await fetch(new URL(basePairFile, window.location.href));
        if (!response.ok) throw new Error(`${basePairFile}: HTTP ${response.status}`);
        const parsed = parseBedpe(await response.text(), state.dataset);
        if (token !== state.structureLoadingToken) return;
        state.structureBasePairs = parsed.records;
      } else {
        state.structureBasePairs = detailBasePairRecords(detailed);
      }
      state.basePairLoading = false;
      fitSelection(); renderStructureSearch(); syncUrl(); scheduleDraw();
    } catch (error) {
      if (token !== state.structureLoadingToken) return;
      state.basePairLoading = false;
      $('#heatmap-region-type').textContent = `${ui('Structure selected, but base-pair BEDPE failed to load', '结构已选择，但 BEDPE 碱基对读取失败')}：${error.message}`;
      fitSelection(); renderStructureSearch(); syncUrl(); scheduleDraw();
      console.warn('Structure detail or base-pair load failed', error);
    }
  }

  function clearStructure() {
    state.structureLoadingToken += 1; state.structure = null; state.structureBasePairs = []; state.basePairSource = null; if (structureSearch) structureSearch.value = ''; const basePairLink = $('#heatmap-base-pairs-link'); if (basePairLink) basePairLink.hidden = true; $('#heatmap-structure-meta').hidden = true; renderStructureSearch(); syncUrl(); scheduleDraw();
  }

  async function loadMatrix(matrix) {
    const dataset = state.dataset; if (!dataset) return;
    state.matrixMeta = matrix; state.matrixData = null; const token = ++state.loadingToken; syncUrl();
    state.colorMax = null; state.autoColorMax = null;
    if (colorMaxInput) { colorMaxInput.value = ''; colorMaxInput.removeAttribute('aria-invalid'); colorMaxInput.placeholder = ui('Auto P99', '自动 P99'); }
    const colorStatus = $('#heatmap-color-status'); if (colorStatus) colorStatus.textContent = ui('Auto-scale after loading the matrix', '矩阵加载后按当前视口自动定标');
    loadFeatures(matrix);
    resolutionSelect.value = matrix.id; $('#heatmap-status').textContent = `${ui('Reading', '正在读取')} ${matrix.file}…`;
    const cacheKey = `${dataset.id}/${matrix.id}`;
    if (state.matrixCache.has(cacheKey)) { state.matrixData = state.matrixCache.get(cacheKey); draw(); return; }
    try {
      const matrixUrl = new URL(matrix.file, dataset._baseUrl).href; const response = await fetch(matrixUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await parseSparseMatrix(response, dataset, matrix, (received, total, count) => {
        if (token !== state.loadingToken) return; const progress = total ? ` · ${Math.round(received / total * 100)}%` : '';
        $('#heatmap-status').textContent = `${ui('Reading', '正在读取')} ${matrix.file}${progress} · ${ui('parsed', '已解析')} ${count.toLocaleString()}`;
      });
      if (token !== state.loadingToken) return;
      state.matrixCache.set(cacheKey, data); state.matrixData = data; state.view = clampView(state.view || fullView(dataset), dataset);
      $('#heatmap-caption').textContent = `${matrix.file} · ${matrixLabel(matrix)} · ${matrix.coordinateSystem || dataset.coordinateSystem} · ${ui('white-to-red log scale; color max defaults to viewport P99 and can be fixed manually · upper triangle mirrored in the browser · ignored', '白–红对数色阶，color max 默认使用当前视口 P99，也可手动固定 · 上三角在浏览器中自动镜像 · 已忽略')} ${data.skipped.toLocaleString()} ${ui('invalid rows.', '条 NaN、非正值或越界记录。')}`;
      draw();
    } catch (error) {
      if (token !== state.loadingToken) return;
      $('#heatmap-status').textContent = `${ui('Matrix failed to load', '矩阵加载失败')}：${error.message}。${ui('Use a local static server or GitHub Pages and check the manifest filename.', '请通过本地静态服务器或 GitHub Pages 访问，并检查 manifest 中的文件名。')}`;
      $('#heatmap-caption').textContent = `${ui('Could not read', '未能读取')} ${matrix.file}`; console.warn('Heatmap matrix load failed', error);
    }
  }

  async function selectDataset(dataset, structureId = null) {
    state.dataset = dataset; state.structure = null; state.structureBasePairs = []; state.basePairSource = null; state.basePairLoading = false; state.structureLoadingToken += 1; state.matrixData = null; state.view = fullView(dataset); workspace.hidden = false;
    $('#heatmap-structure-meta').hidden = true; if (structureSearch) structureSearch.value = '';
    resolutionSelect.innerHTML = dataset.matrices.map((matrix) => `<option value="${escapeHtml(matrix.id)}">${escapeHtml(matrixLabel(matrix))}</option>`).join('');
    const requestedMatrix = params.get('matrix'); const matrix = dataset.matrices.find((item) => item.id === requestedMatrix) || dataset.matrices.find((item) => item.id === dataset.defaultMatrix) || [...dataset.matrices].sort((a, b) => b.binSize - a.binSize)[0];
    renderCatalog(); renderSelectedDataset(); renderStructureSearch();
    await loadMatrix(matrix);
    const linkedRecord = state.structureById.get(`${dataset.id}::${structureId}`);
    if (linkedRecord && datasetStructures(dataset).some((record) => record.id === structureId)) await selectStructure(linkedRecord);
    workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function loadCatalog() {
    try {
      state.structures = await loadAllStructureTypes();
      state.structureById = new Map(state.structures.map((record) => [structureRecordKey(record), record]));
      const catalogUrl = new URL('data/heatmaps/catalog.json', window.location.href); const response = await fetch(catalogUrl);
      if (!response.ok) throw new Error(`catalog HTTP ${response.status}`);
      const catalog = await response.json();
      const datasets = await Promise.all((catalog.datasets || []).map(async (entry) => {
        const manifestUrl = new URL(entry.manifest, catalogUrl); const manifestResponse = await fetch(manifestUrl);
        if (!manifestResponse.ok) throw new Error(`${entry.manifest}: HTTP ${manifestResponse.status}`);
        const manifest = await manifestResponse.json(); manifest._manifestUrl = manifestUrl.href; manifest._baseUrl = new URL('./', manifestUrl).href;
        manifest.matrices = manifest.matrices || (manifest.resolutions || []).map((matrix) => ({ ...matrix, id: `${matrix.binSize}bp-${String(matrix.normalization || manifest.normalization || 'raw').toLowerCase()}`, normalization: matrix.normalization || manifest.normalization || 'none', matrixType: String(matrix.normalization || manifest.normalization || 'none').toLowerCase() === 'none' ? 'raw' : 'normalized' }));
        return manifest;
      }));
      state.datasets = datasets; renderCatalog();
      const requestedId = params.get('id'); const mapHint = params.get('map') || params.get('dataset') || '';
      const linkedStructure = requestedId ? state.structures.find((record) => record.id === requestedId && (!mapHint || record.heatmapDataset === mapHint)) : null;
      const requestedMap = mapHint || linkedStructure?.heatmapDataset;
      const requestedDataset = datasets.find((dataset) => dataset.id === requestedMap);
      if (requestedDataset) await selectDataset(requestedDataset, linkedStructure?.id || null);
    } catch (error) {
      $('#heatmap-catalog-summary').textContent = `${ui('Heatmap catalog failed to load', '热图目录加载失败')}：${error.message}。${ui('Use a local static server or GitHub Pages.', '本页需要通过本地静态服务器或 GitHub Pages 访问。')}`;
      tableBody.innerHTML = `<tr><td class="empty" colspan="8">${ui('Could not read data/heatmaps/catalog.json.', '无法读取 data/heatmaps/catalog.json。')}</td></tr>`; console.warn('Heatmap catalog load failed', error);
    }
  }

  function localPoint(event) {
    const rect = canvas.getBoundingClientRect(); return { x: clamp(event.clientX - rect.left, 0, rect.width), y: clamp(event.clientY - rect.top, 0, rect.height), width: rect.width, height: rect.height };
  }

  function featureAtCoordinate(x, y, geometry) {
    const padding = Math.max(1, geometry.effectiveResolution * 2);
    const directHit = (feature) => x >= feature.start1 - padding && x < feature.end1 + padding && y >= feature.start2 - padding && y < feature.end2 + padding;
    const mirrorHit = (feature) => x >= feature.start2 - padding && x < feature.end2 + padding && y >= feature.start1 - padding && y < feature.end1 + padding;
    const features = visibleFeatures();
    const ordered = state.selectedFeature && features.includes(state.selectedFeature) ? [state.selectedFeature, ...features.filter((feature) => feature !== state.selectedFeature)] : features;
    return ordered.find((feature) => directHit(feature) || mirrorHit(feature)) || null;
  }

  function zoomAt(factor, point) {
    if (!state.dataset || !state.matrixData) return;
    const view = state.view || fullView(state.dataset); const span = view.x1 - view.x0; const focusX = view.x0 + point.x / point.width * span; const focusY = view.y0 + point.y / point.height * span;
    const nextSpan = clamp(span / factor, Math.max(32, state.matrixMeta.binSize * 8), state.dataset.genomeLength); const ux = point.x / point.width; const uy = point.y / point.height;
    state.view = clampView({ x0: focusX - ux * nextSpan, x1: focusX + (1 - ux) * nextSpan, y0: focusY - uy * nextSpan, y1: focusY + (1 - uy) * nextSpan }, state.dataset); syncUrl(); scheduleDraw();
  }

  function setZoomLevel(zoom) {
    if (!state.dataset) return; const view = state.view || fullView(state.dataset); const centerX = (view.x0 + view.x1) / 2; const centerY = (view.y0 + view.y1) / 2; const span = state.dataset.genomeLength / clamp(zoom, 1, 32);
    state.view = clampView({ x0: centerX - span / 2, x1: centerX + span / 2, y0: centerY - span / 2, y1: centerY + span / 2 }, state.dataset); syncUrl(); scheduleDraw();
  }

  function fitSelection() {
    if (!state.dataset || !state.structure) { $('#heatmap-readout').textContent = ui('Search for and select a structure below first.', '请先在下方搜索并选择一个结构。'); return; }
    const regions = structureRegions0(); const min = Math.min(...regions.map((region) => region.start)); const max = Math.max(...regions.map((region) => region.end)); const selectionSpan = Math.max(max - min, state.matrixMeta.binSize * 8); const span = Math.min(state.dataset.genomeLength, selectionSpan * 1.35); const center = (min + max) / 2;
    state.view = clampView({ x0: center - span / 2, x1: center + span / 2, y0: center - span / 2, y1: center + span / 2 }, state.dataset); syncUrl(); scheduleDraw();
  }

  function applyColorMax() {
    if (!colorMaxInput) return;
    const raw = colorMaxInput.value.trim();
    if (!raw) {
      state.colorMax = null; colorMaxInput.removeAttribute('aria-invalid'); scheduleDraw(); return;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      colorMaxInput.setAttribute('aria-invalid', 'true');
      const status = $('#heatmap-color-status'); if (status) status.textContent = ui('Color max must be a number greater than 0', 'Color max 必须是大于 0 的数值');
      return;
    }
    state.colorMax = value; colorMaxInput.removeAttribute('aria-invalid'); scheduleDraw();
  }

  tableBody.addEventListener('click', (event) => { const row = event.target.closest('[data-dataset]'); if (!row) return; const dataset = state.datasets.find((item) => item.id === row.dataset.dataset); if (dataset) selectDataset(dataset); });
  catalogSearch?.addEventListener('input', renderCatalog);
  structureSearch?.addEventListener('input', renderStructureSearch);
  $('#heatmap-structure-results')?.addEventListener('click', (event) => { const result = event.target.closest('[data-structure]'); if (!result) return; const record = state.structureById.get(result.dataset.structure); if (record) selectStructure(record); });
  $('#heatmap-structure-clear')?.addEventListener('click', clearStructure);
  featureSearch?.addEventListener('input', renderFeatureSearch);
  $('#heatmap-feature-results')?.addEventListener('click', (event) => { const result = event.target.closest('[data-feature]'); if (!result) return; const feature = state.features.find((item) => item.id === result.dataset.feature); if (feature) selectFeature(feature); });
  $('#heatmap-feature-clear')?.addEventListener('click', clearFeatureSelection);
  featureVisibleInput?.addEventListener('change', () => { state.featuresVisible = featureVisibleInput.checked; scheduleDraw(); });
  featureSelectedOnlyInput?.addEventListener('change', () => { state.selectedFeatureOnly = featureSelectedOnlyInput.checked; scheduleDraw(); });
  $('#heatmap-features-export-all')?.addEventListener('click', () => downloadBedpe(state.features, ''));
  $('#heatmap-features-export-selected')?.addEventListener('click', () => { if (state.selectedFeature) downloadBedpe([state.selectedFeature], `_${state.selectedFeature.id}`); });
  resolutionSelect.addEventListener('change', () => { const matrix = state.dataset?.matrices.find((item) => item.id === resolutionSelect.value); if (matrix) loadMatrix(matrix); });
  canvas.addEventListener('pointerdown', (event) => { if (!state.matrixData) return; canvas.setPointerCapture?.(event.pointerId); state.dragging = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, view: { ...state.view }, moved: false }; canvas.classList.add('is-panning'); });
  canvas.addEventListener('pointermove', (event) => { if (!state.dragging || state.dragging.pointerId !== event.pointerId) return; const rect = canvas.getBoundingClientRect(); const span = state.dragging.view.x1 - state.dragging.view.x0; const dx = (event.clientX - state.dragging.startX) / rect.width * span; const dy = (event.clientY - state.dragging.startY) / rect.height * span; if (Math.abs(dx) + Math.abs(dy) > 3) state.dragging.moved = true; state.view = clampView({ x0: state.dragging.view.x0 - dx, x1: state.dragging.view.x1 - dx, y0: state.dragging.view.y0 - dy, y1: state.dragging.view.y1 - dy }, state.dataset); scheduleDraw(); });
  const finishDrag = (event) => { if (!state.dragging || state.dragging.pointerId !== event.pointerId) return; state.suppressClick = state.dragging.moved; state.dragging = null; canvas.classList.remove('is-panning'); syncUrl(); };
  canvas.addEventListener('pointerup', finishDrag); canvas.addEventListener('pointercancel', finishDrag);
  canvas.addEventListener('wheel', (event) => { event.preventDefault(); zoomAt(event.deltaY < 0 ? 1.6 : 1 / 1.6, localPoint(event)); }, { passive: false });
  canvas.addEventListener('click', (event) => { if (state.suppressClick) { state.suppressClick = false; return; } const geometry = canvas._heatmapGeometry; if (!geometry) return; const point = localPoint(event); const x = geometry.view.x0 + point.x / point.width * (geometry.view.x1 - geometry.view.x0); const y = geometry.view.y0 + point.y / point.height * (geometry.view.y1 - geometry.view.y0); const feature = featureAtCoordinate(x, y, geometry); if (feature) { selectFeature(feature, false); return; } const xMatch = geometry.regions.some((region) => x >= region.start && x < region.end); const yMatch = geometry.regions.some((region) => y >= region.start && y < region.end); $('#heatmap-readout').textContent = `${ui('Clicked position (0-based)', '点击位置（0-based）')}: x=${formatCoordinate(x)} · y=${formatCoordinate(y)} · ${ui('about', '当前约')} ${Math.round(geometry.effectiveResolution)} nt / pixel${xMatch && yMatch ? ` · ${ui('inside the highlighted structure region', '位于当前结构高亮区域内')}` : ''}`; });
  overviewCanvas?.addEventListener('click', (event) => { const geometry = overviewCanvas._overviewGeometry; if (!geometry || !state.dataset) return; const rect = overviewCanvas.getBoundingClientRect(); const span = state.view.x1 - state.view.x0; const centerX = clamp(event.clientX - rect.left, 0, rect.width) / rect.width * geometry.genomeLength; const centerY = clamp(event.clientY - rect.top, 0, rect.height) / rect.height * geometry.genomeLength; state.view = clampView({ x0: centerX - span / 2, x1: centerX + span / 2, y0: centerY - span / 2, y1: centerY + span / 2 }, state.dataset); syncUrl(); scheduleDraw(); });
  zoomInput?.addEventListener('input', () => setZoomLevel(Number(zoomInput.value)));
  colorMaxInput?.addEventListener('input', applyColorMax);
  $('#heatmap-color-auto')?.addEventListener('click', () => { if (colorMaxInput) colorMaxInput.value = ''; state.colorMax = null; colorMaxInput?.removeAttribute('aria-invalid'); scheduleDraw(); });
  $('#heatmap-zoom-in')?.addEventListener('click', () => zoomAt(1.6, { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2, width: canvas.clientWidth, height: canvas.clientHeight }));
  $('#heatmap-zoom-out')?.addEventListener('click', () => zoomAt(1 / 1.6, { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2, width: canvas.clientWidth, height: canvas.clientHeight }));
  $('#heatmap-fit')?.addEventListener('click', fitSelection);
  $('#heatmap-reset')?.addEventListener('click', () => { if (!state.dataset) return; state.view = fullView(state.dataset); syncUrl(); scheduleDraw(); });
  window.addEventListener('resize', scheduleDraw);
  loadCatalog();
}

if (document.body.dataset.page === 'results') initResults();
if (document.body.dataset.page === 'structure') renderStructure();
if (document.body.dataset.page === 'viewer') initViewer();
if (document.body.dataset.page === 'heatmap') initHeatmap();
