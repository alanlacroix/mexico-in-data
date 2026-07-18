const $ = (s) => document.querySelector(s);
const enNum = (n) => Number(n).toLocaleString('en-US');
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const DATA_VERSION = '20260713';
const J = async (p) => {
  const url = `${p}${p.includes('?') ? '&' : '?'}v=${DATA_VERSION}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${p} ${response.status}`);
  return response.json();
};
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

let REG = {}, POV, STATES, ATLAS, ST = {};
let PROJ, MUNI = [], MBY = {}, SFEAT = [];
let REGISTRY_PROMISE = null, MUNICIPAL_PROMISE = null;
let LEVEL = 'states', METRIC = 'gdppc', SELSTATE = null, SEL = null, CURSTATE = null, SHOWALL = false;
const NAT = { muniPoverty2020: 43.9114 };
const STVAL = { gdppc: {}, gdp: {}, pov: {}, inf: {}, pop: {}, unemp: {} };
const MUNIVAL = { pov: {} };
const RAMP_G = ['#e7f2ec', '#b7dcc5', '#79bd96', '#3a9866', '#0a7d4d'];
const RAMP_A = ['#f4f0e6', '#e7c893', '#d99a4f', '#c26a26', '#8f4110'];

const fmtGDP = (v) => v >= 1_000_000 ? `MX$${(v / 1_000_000).toFixed(2)}tn` : `MX$${(v / 1_000).toFixed(1)}bn`;
const METRICS = {
  gdppc: { field: 'gdppc_mxn', label: 'GDP per person', unit: 'current MXN per person', fmt: (v) => `MX$${enNum(Math.round(v))}`, direction: 'higher', ramp: RAMP_G, source: 'gdp' },
  gdp: { field: 'gdp_mxn_m', label: 'Total GDP', unit: 'current MXN', fmt: fmtGDP, direction: 'higher', ramp: RAMP_G, source: 'gdp' },
  pop: { field: 'pop', label: 'Population', unit: 'people', fmt: (v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : enNum(Math.round(v)), direction: 'higher', ramp: RAMP_G, source: 'population' },
  pov: { field: 'poverty', label: 'Poverty', unit: '% of people', fmt: (v) => `${v.toFixed(1)}%`, direction: 'higher', ramp: RAMP_A, source: 'poverty' },
  inf: { field: 'informality', label: 'Informal employment', unit: '% of employed people', fmt: (v) => `${v.toFixed(1)}%`, direction: 'higher', ramp: RAMP_A, source: 'informality' },
  unemp: { field: 'unemployment', label: 'Unemployment', unit: '% of the labor force', fmt: (v) => `${v.toFixed(1)}%`, direction: 'higher', ramp: RAMP_A, source: 'unemployment' }
};

function mkProj(points, width, height, pad) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const k = Math.cos(23 * Math.PI / 180);
  for (const [lon, lat] of points) {
    const x = lon * k;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, lat); y1 = Math.max(y1, lat);
  }
  const scale = Math.min((width - 2 * pad) / (x1 - x0), (height - 2 * pad) / (y1 - y0));
  const offsetX = (width - (x1 - x0) * scale) / 2;
  const offsetY = (height - (y1 - y0) * scale) / 2;
  return ([lon, lat]) => [(lon * k - x0) * scale + offsetX, height - ((lat - y0) * scale + offsetY)];
}

function ringsPath(polygons) {
  let d = '';
  for (const polygon of polygons) for (const ring of polygon) {
    d += ring.map((coordinate, i) => {
      const [x, y] = PROJ(coordinate);
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ') + 'Z';
  }
  return d;
}

function boundsOf(polygons) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const polygon of polygons) for (const ring of polygon) for (const coordinate of ring) {
    const [x, y] = PROJ(coordinate);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
}

function decodeTopo(topology, objectName) {
  const { scale: [sx, sy], translate: [tx, ty] } = topology.transform;
  const arcs = topology.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; });
  });
  const arcByIndex = (i) => i >= 0 ? arcs[i] : arcs[~i].slice().reverse();
  const ringCoordinates = (ring) => {
    const indexes = Array.isArray(ring) ? ring : [ring];
    let result = [];
    indexes.forEach((index, i) => {
      if (typeof index !== 'number') return;
      const arc = arcByIndex(index);
      result = result.concat(i ? arc.slice(1) : arc);
    });
    return result;
  };
  return topology.objects[objectName].geometries.map((geometry) => {
    let polygons;
    if (geometry.type === 'Polygon') polygons = [geometry.arcs];
    else if (geometry.type === 'MultiPolygon') polygons = geometry.arcs;
    else return { id: geometry.properties?.id || geometry.id, polygons: [] };
    return {
      id: String(geometry.properties?.id || geometry.id).padStart(5, '0'),
      polygons: polygons.map((polygon) => (Array.isArray(polygon) ? polygon : [polygon]).map(ringCoordinates))
    };
  });
}

function computeStateValues() {
  for (const [code, state] of Object.entries(ST)) {
    STVAL.gdppc[code] = state.gdppc_mxn;
    STVAL.gdp[code] = state.gdp_mxn_m;
    STVAL.pop[code] = state.pop;
    STVAL.pov[code] = state.poverty;
    STVAL.inf[code] = state.informality;
    STVAL.unemp[code] = state.unemployment;
  }
  Object.assign(NAT, ATLAS.meta.national);
}

function computeMunicipalValues() {
  Object.assign(MUNIVAL.pov, POV?.values || {});
}

async function loadRegistry() {
  if (Object.keys(REG).length) return REG;
  if (!REGISTRY_PROMISE) {
    REGISTRY_PROMISE = J('./data/meta/municipios.json').then((registry) => {
      REG = registry.m || registry;
      return REG;
    });
  }
  return REGISTRY_PROMISE;
}

async function loadMunicipalData() {
  if (MUNI.length && POV) return;
  if (!MUNICIPAL_PROMISE) {
    MUNICIPAL_PROMISE = Promise.all([
      loadRegistry(),
      J('./data/layers/coneval-pobreza.json'),
      J('./data/geo/municipios.topojson')
    ]).then(([, poverty, topology]) => {
      POV = poverty;
      computeMunicipalValues();
      MBY = {};
      MUNI = decodeTopo(topology, Object.keys(topology.objects)[0]).map((geometry) => ({ id: geometry.id, polygons: geometry.polygons }));
      for (const municipality of MUNI) {
        if (!municipality.polygons.length) continue;
        municipality.d = ringsPath(municipality.polygons);
        municipality.bounds = boundsOf(municipality.polygons);
        (MBY[municipality.id.slice(0, 2)] ||= []).push(municipality);
      }
    });
  }
  return MUNICIPAL_PROMISE;
}

function quantiles(values, count) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const result = [];
  for (let i = 1; i < count; i += 1) result.push(sorted[Math.floor(i / count * sorted.length)]);
  return result;
}

function colorOf(value, breaks, ramp) {
  if (!Number.isFinite(value)) return '#ededea';
  let index = 0;
  while (index < breaks.length && value > breaks[index]) index += 1;
  return ramp[index];
}

function rankAmong(values, value) {
  const valid = values.filter(Number.isFinite);
  return { rank: 1 + valid.filter((candidate) => candidate > value).length, total: valid.length };
}

function sourceLink(source, label = source.label) {
  return `<a href="${source.url}" target="_blank" rel="noopener">${label} ↗</a>`;
}

function activeSource() {
  return ATLAS.meta.sources[METRICS[METRIC].source];
}

function setMetricControls(municipalMode = false) {
  $('#metricsel').querySelectorAll('button').forEach((button) => {
    const active = municipalMode ? button.dataset.m === 'pov' : button.dataset.m === METRIC;
    button.classList.toggle('on', active);
    button.setAttribute('aria-pressed', String(active));
    button.disabled = municipalMode;
  });
  if (municipalMode) {
    $('#metricmeta').textContent = 'Municipal poverty · 2020 · latest official municipal release';
  } else {
    const metric = METRICS[METRIC];
    const source = activeSource();
    $('#metricmeta').textContent = METRIC === 'gdppc'
      ? `${metric.label} · 2024 · derived output per resident, not income or wealth`
      : `${metric.label} · ${source.period} · ${source.unit}`;
  }
}

function renderLegend(values, breaks, municipalMode = false) {
  const metric = municipalMode ? METRICS.pov : METRICS[METRIC];
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  const minimum = finite[0], maximum = finite[finite.length - 1];
  const ranges = metric.ramp.map((color, index) => {
    const low = index === 0 ? minimum : breaks[index - 1];
    const high = index === metric.ramp.length - 1 ? maximum : breaks[index];
    return `<span class="legend-bin"><i style="background:${color}"></i><b>${metric.fmt(low)}–${metric.fmt(high)}</b></span>`;
  }).join('');
  const scope = municipalMode ? `quantiles within ${ST[CURSTATE].name}` : 'quantiles across 32 states';
  $('#legend').innerHTML = `<div class="lt">${metric.label} · darker = ${metric.direction} · ${scope}</div><div class="legend-bins">${ranges}</div><span class="nd"><i></i>No data</span>`;
}

function renderSourceStrip(municipalMode = false) {
  if (municipalMode) {
    $('#source-strip').innerHTML = `2020 · ${POV.meta.coverage.covered.toLocaleString('en-US')} of ${POV.meta.coverage.universe.toLocaleString('en-US')} municipalities · <a href="${POV.meta.sourceUrl}" target="_blank" rel="noopener">CONEVAL · municipal poverty 2020 ↗</a>`;
    return;
  }
  if (METRIC === 'gdppc') {
    const gdp = ATLAS.meta.sources.gdp, population = ATLAS.meta.sources.population;
    $('#source-strip').innerHTML = `Derived: ${sourceLink(gdp, 'INEGI PIBE 2024')} ÷ ${sourceLink(population, 'CONAPO 2024 mid-year population')}. This is output per resident in current pesos—not what a resident earns or owns.`;
    return;
  }
  const source = activeSource();
  $('#source-strip').innerHTML = `${source.period} · ${source.unit} · ${sourceLink(source)}`;
}

function buildStateLabels() {
  const placed = [];
  const mobile = innerWidth <= 720;
  const labelLimit = mobile ? 6 : Infinity;
  const charWidth = mobile ? 14 : 6.1;
  const overlaps = (a, b) => !(a.x1 < b.x0 || a.x0 > b.x1 || a.y1 < b.y0 || a.y0 > b.y1);
  let labels = '';
  const byArea = SFEAT.slice().sort((a, b) => ((b.bounds.x1 - b.bounds.x0) * (b.bounds.y1 - b.bounds.y0)) - ((a.bounds.x1 - a.bounds.x0) * (a.bounds.y1 - a.bounds.y0)));
  for (const feature of byArea) {
    if (placed.length >= labelLimit) break;
    const width = feature.bounds.x1 - feature.bounds.x0;
    const x = (feature.bounds.x0 + feature.bounds.x1) / 2;
    const y = (feature.bounds.y0 + feature.bounds.y1) / 2;
    const labelWidth = feature.name.length * charWidth;
    if (labelWidth > width + 18) continue;
    const rect = { x0: x - labelWidth / 2, y0: y - 7, x1: x + labelWidth / 2, y1: y + 7 };
    if (placed.some((candidate) => overlaps(rect, candidate))) continue;
    placed.push(rect);
    labels += `<text class="stlabel" x="${x.toFixed(0)}" y="${y.toFixed(0)}" text-anchor="middle" aria-hidden="true">${feature.name}</text>`;
  }
  return labels;
}

function paintStates() {
  const metric = METRICS[METRIC];
  const values = SFEAT.map((feature) => STVAL[METRIC][feature.code]);
  const breaks = quantiles(values, 5);
  const paths = SFEAT.map((feature) => {
    const value = STVAL[METRIC][feature.code];
    const selected = feature.code === SELSTATE ? ' sel' : '';
    return `<path class="${selected}" d="${feature.d}" data-code="${feature.code}" fill="${colorOf(value, breaks, metric.ramp)}" tabindex="0" focusable="true" role="button" aria-label="${feature.name}: ${metric.fmt(value)}"></path>`;
  }).join('');
  $('#map').innerHTML = `<title id="map-title">Mexico by ${metric.label.toLowerCase()}</title><desc id="map-desc">Thirty-two selectable states. Use Tab to move through states and Enter to open a profile.</desc><g class="stlayer">${paths}</g><g class="munilayer" style="display:none"></g><g class="labels" aria-hidden="true">${buildStateLabels()}</g>`;
  renderLegend(values, breaks);
  renderSourceStrip();
  wireStateMap();
}

function wireStateMap() {
  const svg = $('#map'), layer = svg.querySelector('.stlayer'), tip = $('#maptip');
  layer.addEventListener('pointermove', (event) => {
    const path = event.target.closest('path[data-code]');
    if (!path) { tip.style.opacity = 0; return; }
    const code = path.dataset.code, state = ST[code], metric = METRICS[METRIC], value = STVAL[METRIC][code];
    const { rank } = rankAmong(Object.values(STVAL[METRIC]), value);
    tip.innerHTML = `<b>${state.name}</b><br><span class="n">${metric.fmt(value)}</span><br><span class="r">Rank ${rank} of 32 by highest value</span>`;
    tip.style.left = `${Math.min(event.clientX + 14, innerWidth - 250)}px`;
    tip.style.top = `${event.clientY + 14}px`;
    tip.style.opacity = 1;
  });
  layer.addEventListener('pointerleave', () => { tip.style.opacity = 0; });
  layer.addEventListener('click', (event) => {
    const path = event.target.closest('path[data-code]');
    if (path) selectState(path.dataset.code);
  });
  layer.addEventListener('keydown', (event) => {
    const path = event.target.closest('path[data-code]');
    if (path && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectState(path.dataset.code); }
  });
}

function markState(code) {
  $('#map').querySelectorAll('.stlayer path').forEach((path) => path.classList.toggle('sel', path.dataset.code === code));
}

function renderCrumb() {
  const crumb = $('#crumb');
  if (LEVEL === 'states' && !SELSTATE) {
    crumb.innerHTML = '<span class="bc plain">All 32 states</span>';
  } else if (LEVEL === 'states') {
    crumb.innerHTML = `<button class="bc" type="button" data-back="all">← All states</button><span class="sep">/</span><span class="bc plain">${ST[SELSTATE].name}</span>`;
  } else {
    const municipality = SEL && REG[SEL] ? `<span class="sep">/</span><span class="bc plain">${REG[SEL].nom}</span>` : '';
    crumb.innerHTML = `<button class="bc" type="button" data-back="all">← All states</button><span class="sep">/</span><button class="bc" type="button" data-back="state">${ST[CURSTATE].name}</button><span class="sep">/</span><span class="bc plain">Municipal poverty</span>${municipality}`;
  }
  crumb.querySelector('[data-back="all"]')?.addEventListener('click', () => allStates());
  crumb.querySelector('[data-back="state"]')?.addEventListener('click', () => { const code = CURSTATE; allStates({ history: false }); selectState(code); });
}

function renderSummary() {
  if (LEVEL === 'muni') {
    $('#statesum').innerHTML = `<b>2020 is the latest official municipal poverty release.</b> State poverty is available for 2024, so the two should not be read as the same period.`;
    return;
  }
  if (!SELSTATE) {
    $('#statesum').textContent = 'The map and list use the same metric. Select a state for the exact value and comparison.';
    return;
  }
  const metric = METRICS[METRIC], value = STVAL[METRIC][SELSTATE];
  const { rank } = rankAmong(Object.values(STVAL[METRIC]), value);
  $('#statesum').innerHTML = `<b>${ST[SELSTATE].name}: ${metric.fmt(value)}.</b> Rank ${rank} of 32 by highest ${metric.label.toLowerCase()}.`;
}

function ppGap(value, national) {
  const difference = value - national;
  if (Math.abs(difference) < 0.05) return 'about the same as the national rate';
  return `${Math.abs(difference).toFixed(1)} percentage points ${difference > 0 ? 'above' : 'below'} the national rate`;
}

function ordinal(number) {
  const mod100 = number % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[number % 10] || 'th');
  return `${number}${suffix}`;
}

function rankPhrase(rank, total = 32) {
  if (rank === 1) return `highest of ${total}`;
  if (rank === total) return `lowest of ${total}`;
  if (rank <= total / 2) return `${ordinal(rank)}-highest of ${total}`;
  return `${ordinal(total - rank + 1)}-lowest of ${total}`;
}

function whatStandsOut(code) {
  const state = ST[code];
  const candidates = [
    { order: 0, label: 'GDP per person', value: METRICS.gdppc.fmt(state.gdppc_mxn), rank: rankAmong(Object.values(STVAL.gdppc), state.gdppc_mxn).rank, qualifier: 'by highest value' },
    { order: 1, label: 'Total GDP', value: METRICS.gdp.fmt(state.gdp_mxn_m), rank: rankAmong(Object.values(STVAL.gdp), state.gdp_mxn_m).rank, qualifier: 'by highest value' },
    { order: 4, label: 'Population', value: METRICS.pop.fmt(state.pop), rank: rankAmong(Object.values(STVAL.pop), state.pop).rank, qualifier: 'by highest' },
    { order: 2, label: 'Poverty', value: METRICS.pov.fmt(state.poverty), rank: rankAmong(Object.values(STVAL.pov), state.poverty).rank, qualifier: 'by highest rate' },
    { order: 3, label: 'Informality', value: METRICS.inf.fmt(state.informality), rank: rankAmong(Object.values(STVAL.inf), state.informality).rank, qualifier: 'by highest rate' },
    { order: 5, label: 'Unemployment', value: METRICS.unemp.fmt(state.unemployment), rank: rankAmong(Object.values(STVAL.unemp), state.unemployment).rank, qualifier: 'by highest rate' }
  ].map((candidate) => ({ ...candidate, distance: Math.abs(candidate.rank - 16.5) }))
    .sort((a, b) => b.distance - a.distance || a.order - b.order);
  const [first, second] = candidates;
  return `<div class="fstand"><div class="fstand-label">What stands out</div><div><b>${first.label}</b> is ${first.value}, ${rankPhrase(first.rank)}; <b>${second.label}</b> is ${second.value}, ${rankPhrase(second.rank)}. That is a contrast to look into, not a claim that one caused the other.</div></div>`;
}

function profileRow({ label, stamp, value, context, source }) {
  return `<div class="fmetric"><div class="fm-l">${label} · ${stamp}</div><div class="fm-v">${value}</div><div class="fm-verdict">${context}</div><div class="fm-src">${source}</div></div>`;
}

function renderStateProfile(code, municipalMode = false) {
  const state = ST[code], sources = ATLAS.meta.sources, wrap = $('#ficha-wrap');
  const gdppcRank = rankAmong(Object.values(STVAL.gdppc), state.gdppc_mxn).rank;
  const gdpRank = rankAmong(Object.values(STVAL.gdp), state.gdp_mxn_m).rank;
  const povertyRank = rankAmong(Object.values(STVAL.pov), state.poverty).rank;
  const informalityRank = rankAmong(Object.values(STVAL.inf), state.informality).rank;
  const share = state.gdp_mxn_m / NAT.gdp_mxn_m * 100;
  const rows = [
    profileRow({
      label: 'GDP per person', stamp: '2024 · derived', value: METRICS.gdppc.fmt(state.gdppc_mxn),
      context: `Rank ${gdppcRank} of 32. Mexico: ${METRICS.gdppc.fmt(NAT.gdppc_mxn)}. This is output divided by population, not personal income.`,
      source: `${sourceLink(sources.gdp, 'INEGI PIBE')} ÷ ${sourceLink(sources.population, 'CONAPO population')}`
    }),
    profileRow({
      label: 'Total GDP', stamp: sources.gdp.period, value: fmtGDP(state.gdp_mxn_m),
      context: `${share.toFixed(1)}% of Mexico's output. Rank ${gdpRank} of 32.`, source: sourceLink(sources.gdp)
    }),
    profileRow({
      label: 'Poverty', stamp: sources.poverty.period, value: METRICS.pov.fmt(state.poverty),
      context: `${ppGap(state.poverty, NAT.poverty)}. Rank ${povertyRank} of 32 by highest poverty rate.`, source: sourceLink(sources.poverty)
    }),
    profileRow({
      label: 'Informal employment', stamp: sources.informality.period, value: METRICS.inf.fmt(state.informality),
      context: `${ppGap(state.informality, NAT.informality)}. Rank ${informalityRank} of 32 by highest rate.`, source: sourceLink(sources.informality)
    })
  ].join('');
  const municipalityCount = (MBY[code] || []).length;
  const drillLabel = municipalityCount ? `See ${municipalityCount} municipalities →` : 'See municipalities →';
  const footer = municipalMode
    ? `Select a municipality on the map or in the list. The municipal layer shows poverty only.`
    : `Oil production can push GDP per person unusually high in Campeche and Tabasco.<button class="drillbtn" id="drill" type="button">${drillLabel}</button>`;
  wrap.hidden = false;
  wrap.className = 'ficha';
  wrap.innerHTML = `<div class="fhead"><button class="fh-x" id="fx" type="button">Clear</button><div class="fh-name">${state.name}</div><div class="fh-ent">State profile</div><div class="fh-pob">${enNum(state.pop)} people · ${sourceLink(sources.population, 'CONAPO 2024 mid-year projection')}</div></div>${whatStandsOut(code)}${rows}<div class="fclose">${footer}</div>`;
  $('#fx').addEventListener('click', () => allStates());
  $('#drill')?.addEventListener('click', () => enterMunicipalities(code));
  updateMini();
}

function renderMunicipalityProfile(id) {
  const info = REG[id], state = ST[id.slice(0, 2)], value = MUNIVAL.pov[id], wrap = $('#ficha-wrap');
  if (!info) return;
  SEL = id;
  const coveredValues = Object.values(MUNIVAL.pov).filter(Number.isFinite);
  const withinState = (MBY[id.slice(0, 2)] || []).map((municipality) => MUNIVAL.pov[municipality.id]).filter(Number.isFinite);
  let rows;
  if (Number.isFinite(value)) {
    const nationalRank = rankAmong(coveredValues, value).rank;
    const stateRank = rankAmong(withinState, value).rank;
    rows = profileRow({
      label: 'Poverty', stamp: '2020', value: METRICS.pov.fmt(value),
      context: `${ppGap(value, NAT.muniPoverty2020)} in 2020. Rank ${stateRank} of ${withinState.length} within ${state.name} and ${nationalRank} of ${coveredValues.length} covered municipalities by highest rate.`,
      source: `<a href="${POV.meta.sourceUrl}" target="_blank" rel="noopener">CONEVAL · municipal poverty 2020 ↗</a>`
    });
  } else {
    rows = profileRow({
      label: 'Poverty', stamp: '2020', value: 'No published value',
      context: 'This municipality is one of the 12 not covered by the official 2020 municipal file.',
      source: `<a href="${POV.meta.sourceUrl}" target="_blank" rel="noopener">CONEVAL coverage file ↗</a>`
    });
  }
  rows += profileRow({
    label: 'State GDP per person', stamp: '2024 · derived', value: METRICS.gdppc.fmt(state.gdppc_mxn),
    context: `This is the state-level figure for ${state.name}. Mexico does not publish official municipal GDP.`,
    source: `${sourceLink(ATLAS.meta.sources.gdp, 'INEGI PIBE')} ÷ ${sourceLink(ATLAS.meta.sources.population, 'CONAPO population')}`
  });
  wrap.hidden = false;
  wrap.className = 'ficha';
  wrap.innerHTML = `<div class="fhead"><button class="fh-x" id="fx" type="button">Clear</button><div class="fh-name">${info.nom}</div><div class="fh-ent">${info.ent}</div><div class="fh-pob">${info.pob ? `${enNum(info.pob)} people · ` : ''}INEGI Census 2020</div></div>${rows}<div class="fclose">Municipal poverty is 2020. The state-level figures use their own listed periods.</div>`;
  $('#fx').addEventListener('click', () => { SEL = null; markMunicipality(null); renderStateProfile(CURSTATE, true); renderCrumb(); renderRankings(); });
  markMunicipality(id);
  history.replaceState(null, '', `#m/${id}`);
  renderCrumb(); renderRankings(); updateMini();
}

function renderNationalProfile() {
  const sources = ATLAS.meta.sources, wrap = $('#ficha-wrap');
  const rows = [
    profileRow({ label: 'GDP per person', stamp: '2024 · derived', value: METRICS.gdppc.fmt(NAT.gdppc_mxn), context: 'Nominal output divided by the 2024 mid-year population.', source: `${sourceLink(sources.gdp, 'INEGI PIBE')} ÷ ${sourceLink(sources.population, 'CONAPO population')}` }),
    profileRow({ label: 'Total GDP', stamp: sources.gdp.period, value: fmtGDP(NAT.gdp_mxn_m), context: 'Current Mexican pesos.', source: sourceLink(sources.gdp) }),
    profileRow({ label: 'Poverty', stamp: sources.poverty.period, value: METRICS.pov.fmt(NAT.poverty), context: 'Share of people in multidimensional poverty.', source: sourceLink(sources.poverty) }),
    profileRow({ label: 'Informal employment', stamp: sources.informality.period, value: METRICS.inf.fmt(NAT.informality), context: 'Share of employed people in all forms of informal employment, not only the informal sector.', source: sourceLink(sources.informality) })
  ].join('');
  wrap.hidden = false; wrap.className = 'ficha';
  wrap.innerHTML = `<div class="fhead"><div class="fh-name">Mexico</div><div class="fh-ent">National reference</div><div class="fh-pob">The latest period differs by source</div></div>${rows}<div class="fclose">Pick a state to compare it with these national figures.</div>`;
}

function selectState(code, { scroll = false } = {}) {
  if (!ST[code]) return;
  if (LEVEL === 'muni') allStates({ history: false });
  SELSTATE = code; SEL = null; SHOWALL = false;
  markState(code); renderCrumb(); renderSummary(); renderStateProfile(code); renderRankings();
  history.replaceState(null, '', `#s/${code}`);
  if (scroll && innerWidth < 1000) $('#ficha-wrap').scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' });
}

async function enterMunicipalities(code) {
  const feature = SFEAT.find((candidate) => candidate.code === code);
  if (!feature) return false;
  const drill = $('#drill');
  if (drill && !MUNI.length) {
    drill.disabled = true;
    drill.textContent = 'Loading municipalities…';
  }
  $('#map').setAttribute('aria-busy', 'true');
  try {
    await loadMunicipalData();
  } catch (error) {
    MUNICIPAL_PROMISE = null;
    if (!Object.keys(REG).length) REGISTRY_PROMISE = null;
    if (drill) {
      drill.disabled = false;
      drill.textContent = 'Try loading municipalities again';
    }
    $('#statesum').innerHTML = '<b>Municipal data could not load.</b> The state Atlas is still available.';
    $('#map').setAttribute('aria-busy', 'false');
    console.error('Municipal Atlas could not load', error);
    return false;
  }
  LEVEL = 'muni'; CURSTATE = code; SELSTATE = code; SEL = null; SHOWALL = false;
  paintStates();
  const municipalities = MBY[code] || [];
  const values = municipalities.map((municipality) => MUNIVAL.pov[municipality.id]);
  const breaks = quantiles(values, 5);
  const svg = $('#map'), municipalLayer = svg.querySelector('.munilayer'), stateLayer = svg.querySelector('.stlayer'), labels = svg.querySelector('.labels');
  municipalLayer.innerHTML = municipalities.map((municipality) => {
    const value = MUNIVAL.pov[municipality.id], name = REG[municipality.id]?.nom || municipality.id;
    return `<path d="${municipality.d}" data-id="${municipality.id}" fill="${colorOf(value, breaks, RAMP_A)}" tabindex="0" focusable="true" role="button" aria-label="${name}: ${Number.isFinite(value) ? METRICS.pov.fmt(value) : 'no data'}"></path>`;
  }).join('');
  municipalLayer.style.display = '';
  stateLayer.querySelectorAll('path').forEach((path) => path.classList.toggle('dim', path.dataset.code !== code));
  if (labels) labels.style.display = 'none';
  $('#map-title').textContent = `Municipal poverty in ${ST[code].name}`;
  $('#map-desc').textContent = `Selectable municipalities in ${ST[code].name}, shaded by the 2020 poverty rate. Use Tab to move through municipalities and Enter to open a profile.`;
  const bounds = feature.bounds, pad = Math.max((bounds.x1 - bounds.x0) * .08, 10);
  fitViewBox(bounds.x0 - pad, bounds.y0 - pad, bounds.x1 - bounds.x0 + 2 * pad, bounds.y1 - bounds.y0 + 2 * pad);
  renderLegend(values, breaks, true); renderSourceStrip(true); setMetricControls(true); wireMunicipalMap();
  renderCrumb(); renderSummary(); renderStateProfile(code, true); renderRankings();
  history.replaceState(null, '', `#s/${code}/municipalities`);
  $('#map').setAttribute('aria-busy', 'false');
  return true;
}

function wireMunicipalMap() {
  const layer = $('#map').querySelector('.munilayer'), tip = $('#maptip');
  layer.addEventListener('pointermove', (event) => {
    const path = event.target.closest('path[data-id]');
    if (!path) { tip.style.opacity = 0; return; }
    const info = REG[path.dataset.id], value = MUNIVAL.pov[path.dataset.id];
    tip.innerHTML = `<b>${info?.nom || path.dataset.id}</b><br><span class="n">${Number.isFinite(value) ? METRICS.pov.fmt(value) : 'No published value'}</span>`;
    tip.style.left = `${Math.min(event.clientX + 14, innerWidth - 250)}px`; tip.style.top = `${event.clientY + 14}px`; tip.style.opacity = 1;
  });
  layer.addEventListener('pointerleave', () => { tip.style.opacity = 0; });
  const choose = (event) => { const path = event.target.closest('path[data-id]'); if (path) chooseMunicipality(path.dataset.id); };
  layer.addEventListener('click', choose);
  layer.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(event); } });
}

async function chooseMunicipality(id, { scroll = false } = {}) {
  await loadRegistry();
  if (!REG[id]) return;
  if (LEVEL !== 'muni' || CURSTATE !== id.slice(0, 2)) {
    const entered = await enterMunicipalities(id.slice(0, 2));
    if (!entered) return;
  }
  renderMunicipalityProfile(id);
  $('#q').value = REG[id].nom;
  if (scroll && innerWidth < 1000) $('#ficha-wrap').scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' });
}

function markMunicipality(id) {
  $('#map').querySelectorAll('.munilayer path').forEach((path) => path.classList.toggle('sel', path.dataset.id === id));
}

function allStates({ history = true } = {}) {
  LEVEL = 'states'; CURSTATE = null; SELSTATE = null; SEL = null; SHOWALL = false;
  fitViewBox(0, 0, 800, 560); setMetricControls(false); paintStates(); renderCrumb(); renderSummary(); renderRankings();
  $('#maptip').style.opacity = 0; $('#q').value = '';
  if (innerWidth >= 1000) renderNationalProfile(); else $('#ficha-wrap').hidden = true;
  if (history) history.replaceState(null, '', location.pathname);
  updateMini();
}

function rankingRows() {
  let rows;
  if (LEVEL === 'states') {
    rows = Object.entries(ST).map(([id, state]) => ({ id, name: state.name, value: STVAL[METRIC][id], kind: 'state' }));
  } else {
    rows = (MBY[CURSTATE] || []).map((municipality) => ({ id: municipality.id, name: REG[municipality.id]?.nom || municipality.id, value: MUNIVAL.pov[municipality.id], kind: 'muni' }));
  }
  rows = rows.filter((row) => Number.isFinite(row.value)).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  let previousValue, previousRank;
  return rows.map((row, index) => {
    const rank = index && row.value === previousValue ? previousRank : index + 1;
    previousValue = row.value;
    previousRank = rank;
    return { ...row, rank };
  });
}

function rankingRow(row, metric) {
  const selected = row.kind === 'state' ? row.id === SELSTATE : row.id === SEL;
  return `<button class="rankrow${selected ? ' sel' : ''}" type="button" data-kind="${row.kind}" data-id="${row.id}"><span class="ranknum">${row.rank}</span><span class="rankname">${row.name}</span><span class="rankval">${metric.fmt(row.value)}</span></button>`;
}

function renderRankings() {
  const rows = rankingRows(), metric = LEVEL === 'states' ? METRICS[METRIC] : METRICS.pov;
  $('#rank-title').textContent = LEVEL === 'states' ? `${metric.label} by state` : `Municipal poverty in ${ST[CURSTATE].name}`;
  $('#rank-note').textContent = `Highest values first · ${LEVEL === 'states' ? (METRIC === 'gdppc' ? '2024 derived' : activeSource().period) : '2020'} · exact values`;
  const toggle = $('#rank-toggle');
  toggle.textContent = SHOWALL ? 'Show top + bottom' : `Show all ${rows.length}`;
  let html = '';
  if (SHOWALL || rows.length <= 12) {
    html = rows.map((row) => rankingRow(row, metric)).join('');
  } else {
    const top = rows.slice(0, 5), bottom = rows.slice(-5);
    html = top.map((row) => rankingRow(row, metric)).join('');
    const selectedId = LEVEL === 'states' ? SELSTATE : SEL;
    const selectedIndex = rows.findIndex((row) => row.id === selectedId);
    if (selectedIndex >= 5 && selectedIndex < rows.length - 5) {
      html += '<div class="rankbreak">Selected</div>' + rankingRow(rows[selectedIndex], metric);
    }
    html += '<div class="rankbreak">Lowest values</div>' + bottom.map((row) => rankingRow(row, metric)).join('');
  }
  $('#rank-list').innerHTML = html;
  $('#rank-list').querySelectorAll('.rankrow').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.kind === 'state') selectState(button.dataset.id, { scroll: innerWidth < 1000 });
    else chooseMunicipality(button.dataset.id, { scroll: innerWidth < 1000 });
  }));
}

function wireSearch() {
  const input = $('#q'), suggestions = $('#sugg');
  const stateIndex = Object.entries(ST).map(([id, state]) => ({ id, type: 'state', name: state.name, sub: 'State', key: norm(state.name) }));
  let municipalityIndex = [];
  let cursor = -1, current = [];
  const close = () => { suggestions.hidden = true; input.setAttribute('aria-expanded', 'false'); };
  const paint = () => {
    suggestions.innerHTML = current.map((result, i) => `<button type="button" role="option" aria-selected="${i === cursor}" class="${i === cursor ? 'hi' : ''}" data-type="${result.type}" data-id="${result.id}">${result.name}<span class="s-ent"> · ${result.sub}</span></button>`).join('');
    suggestions.hidden = !current.length;
    input.setAttribute('aria-expanded', String(Boolean(current.length)));
  };
  const choose = (result) => {
    if (!result) return;
    input.value = result.name; close();
    if (result.type === 'state') selectState(result.id, { scroll: innerWidth < 1000 });
    else chooseMunicipality(result.id, { scroll: innerWidth < 1000 });
  };
  const search = (query) => [...stateIndex, ...municipalityIndex].filter((result) => result.key.includes(query)).sort((a, b) => {
    const start = a.key.indexOf(query) - b.key.indexOf(query);
    if (start) return start;
    if (a.type !== b.type) return a.type === 'state' ? -1 : 1;
    return a.name.localeCompare(b.name);
  }).slice(0, 9);
  const ensureMunicipalityIndex = async () => {
    if (municipalityIndex.length) return;
    await loadRegistry();
    municipalityIndex = Object.entries(REG).map(([id, municipality]) => ({ id, type: 'muni', name: municipality.nom, sub: municipality.ent, key: norm(municipality.nom) }));
  };
  const update = () => {
    const query = norm(input.value.trim());
    if (query.length < 2) { current = []; close(); return; }
    current = search(query);
    cursor = -1; paint();
    if (!municipalityIndex.length) {
      ensureMunicipalityIndex().then(() => {
        if (norm(input.value.trim()) === query) {
          current = search(query);
          paint();
        }
      }).catch((error) => console.error('Municipality search could not load', error));
    }
  };
  input.addEventListener('focus', () => ensureMunicipalityIndex().catch((error) => console.error('Municipality search could not load', error)), { once: true });
  input.addEventListener('input', update);
  input.addEventListener('keydown', (event) => {
    if (suggestions.hidden) return;
    if (event.key === 'ArrowDown') { cursor = Math.min(current.length - 1, cursor + 1); paint(); event.preventDefault(); }
    else if (event.key === 'ArrowUp') { cursor = Math.max(0, cursor - 1); paint(); event.preventDefault(); }
    else if (event.key === 'Enter') { choose(current[cursor] || current[0]); event.preventDefault(); }
    else if (event.key === 'Escape') close();
  });
  suggestions.addEventListener('click', (event) => {
    const button = event.target.closest('[data-id]');
    if (button) choose(current.find((result) => result.id === button.dataset.id && result.type === button.dataset.type));
  });
  document.addEventListener('click', (event) => { if (!event.target.closest('.searchbox')) close(); });
}

function wireMetrics() {
  $('#metricsel').querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
    if (LEVEL === 'muni') return;
    METRIC = button.dataset.m; SHOWALL = false; setMetricControls(false); paintStates();
    if (SELSTATE) renderStateProfile(SELSTATE); else if (innerWidth >= 1000) renderNationalProfile();
    renderSummary(); renderRankings();
  }));
}

let BASE = { x: 0, y: 0, w: 800, h: 560 }, ZOOM = 1, CENTER_X = 400, CENTER_Y = 280, POINTER_X = 400, POINTER_Y = 280;
function fitViewBox(x, y, width, height) {
  const aspect = 800 / 560;
  if (width / height > aspect) height = width / aspect; else width = height * aspect;
  BASE = { x, y, w: width, h: height }; ZOOM = 1; CENTER_X = x + width / 2; CENTER_Y = y + height / 2; applyZoom();
}
function applyZoom() {
  const width = BASE.w / ZOOM, height = BASE.h / ZOOM;
  const x = Math.max(BASE.x, Math.min(CENTER_X - width / 2, BASE.x + BASE.w - width));
  const y = Math.max(BASE.y, Math.min(CENTER_Y - height / 2, BASE.y + BASE.h - height));
  $('#map').setAttribute('viewBox', `${x.toFixed(1)} ${y.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)}`); syncZoomButtons();
}
function zoomBy(factor) {
  const cap = LEVEL === 'muni' ? 8 : 4, next = Math.max(1, Math.min(cap, ZOOM * factor));
  if (next === ZOOM) { if (factor < 1 && ZOOM <= 1.001 && LEVEL === 'muni') { const state = CURSTATE; allStates({ history: false }); selectState(state); } return; }
  if (factor > 1) { CENTER_X = POINTER_X; CENTER_Y = POINTER_Y; }
  ZOOM = next; applyZoom();
}
function syncZoomButtons() {
  const cap = LEVEL === 'muni' ? 8 : 4;
  $('#zin').disabled = ZOOM >= cap - .001;
  $('#zout').disabled = ZOOM <= 1.001 && LEVEL === 'states';
}
function wireZoom() {
  $('#zin').addEventListener('click', () => zoomBy(1.7)); $('#zout').addEventListener('click', () => zoomBy(1 / 1.7));
  $('#map').addEventListener('pointermove', (event) => {
    const svg = $('#map'), viewBox = svg.viewBox.baseVal, rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    POINTER_X = viewBox.x + (event.clientX - rect.left) / rect.width * viewBox.width;
    POINTER_Y = viewBox.y + (event.clientY - rect.top) / rect.height * viewBox.height;
  });
}

function updateMini() {
  const mini = $('#miniback');
  if (innerWidth >= 1000 || $('#ficha-wrap').hidden || (!SELSTATE && !SEL)) { mini.classList.remove('show'); return; }
  $('#mb-name').textContent = SEL && REG[SEL] ? REG[SEL].nom : ST[SELSTATE]?.name || '';
}
function wireMini() {
  const mini = $('#miniback');
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    const shouldShow = innerWidth < 1000 && !entry.isIntersecting && !$('#ficha-wrap').hidden && Boolean(SELSTATE || SEL);
    mini.classList.toggle('show', shouldShow); updateMini();
  }), { threshold: 0 });
  observer.observe($('#ficha-wrap'));
  $('#mb-act').addEventListener('click', () => $('#ficha-wrap').scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' }));
}

async function boot() {
  $('#map')?.setAttribute('aria-busy', 'true');
  const [states, atlas] = await Promise.all([
    J('./data/geo/estados.geojson'), J('./data/atlas-states.json')
  ]);
  STATES = states; ATLAS = atlas; ST = atlas.states || {};
  computeStateValues();
  const allPoints = [];
  for (const feature of STATES.features) {
    const polygons = feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : [feature.geometry.coordinates];
    for (const polygon of polygons) for (const ring of polygon) for (const coordinate of ring) allPoints.push(coordinate);
  }
  PROJ = mkProj(allPoints, 800, 560, 16);
  SFEAT = STATES.features.map((feature) => {
    const polygons = feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : [feature.geometry.coordinates];
    const code = String(feature.properties.cve).padStart(2, '0');
    return { code, name: ST[code]?.name || feature.properties.name, d: ringsPath(polygons), bounds: boundsOf(polygons) };
  });
  wireSearch(); wireMetrics(); wireZoom(); wireMini();
  allStates({ history: false });
  $('#map')?.setAttribute('aria-busy', 'false');
  const initialHash = location.hash;
  const municipalityHash = (initialHash.match(/^#m\/(\d{5})/) || [])[1];
  const stateHash = (initialHash.match(/^#s\/(\d{2})/) || [])[1];
  if (municipalityHash) await chooseMunicipality(municipalityHash);
  else if (stateHash && ST[stateHash]) {
    selectState(stateHash);
    if (initialHash.includes('/municipalities')) await enterMunicipalities(stateHash);
  }
}

boot().catch((error) => {
  const map = $('#map');
  window.reportMexicoDataError?.('Atlas');
  if (map) {
    map.setAttribute('aria-busy', 'false');
    const box = document.createElement('div');
    box.className = 'atlaserr'; box.setAttribute('role', 'alert');
    box.append('The Atlas could not load. The rest of the site is still available.');
    const retry = document.createElement('button');
    retry.type = 'button'; retry.textContent = 'Try again';
    retry.addEventListener('click', () => location.reload());
    box.append(retry); map.insertAdjacentElement('afterend', box);
  }
  console.error(error);
});
