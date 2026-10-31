'use strict';

// Metadata-driven linker between a raw report and an exact scheduled obligation.
// This is deliberately conservative. It can attach a stable id only when the report is
// dated to the scheduled day and matches the configured actor, subject and an outcome
// verb. Similar commentary on another day does not close the obligation.

const fold = (value) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

const ACTORS = Object.freeze({
  banxico: /\b(?:banxico|banco de mexico|mexican central bank|central bank of mexico)\b/i,
  inegi: /\b(?:inegi|instituto nacional de estadistica|mexico(?:'s)? statistics agency|statistics institute)\b/i,
  presidency: /\b(?:president(?:a|e)?|presidencia|sheinbaum|informe de gobierno|state of the nation)\b/i,
  'finance-ministry': /\b(?:shcp|hacienda|finance ministry|secretaria de hacienda)\b/i,
  congress: /\b(?:congress|congreso|senate|senado|chamber of deputies|camara de diputados)\b/i,
  ine: /\b(?:ine|instituto nacional electoral|electoral institute)\b/i,
});

const TOPICS = Object.freeze({
  'policy-rate': /\b(?:monetary policy|politica monetaria|policy rate|benchmark rate|interest rate|tasa (?:de interes|objetivo)|overnight (?:target )?rate)\b/i,
  inflation: /\b(?:inflation|inflacion|consumer prices?|precios al consumidor|\bcpi\b|\binpc\b)\b/i,
  'state-of-nation': /\b(?:informe de gobierno|state of the nation|annual address|annual report)\b/i,
  'budget-package': /\b(?:paquete economico|budget package|revenue and spending framework)\b/i,
  'revenue-law': /\b(?:ley de ingresos|revenue law|revenue and debt ceiling)\b/i,
  'spending-budget': /\b(?:presupuesto de egresos|spending budget|federal spending)\b/i,
  election: /\b(?:election|eleccion|vote|votacion|ballot|governorship|gubernatura)\b/i,
});

const OUTCOMES = Object.freeze({
  'policy-rate': /\b(?:hold|held|holds|leave|leaves|left|keep|keeps|kept|maintain|maintains|maintained|raise|raises|raised|cut|cuts|unchanged|sin cambios|mantiene|mantuvo|deja|sube|subio|baja|recorta)\b/i,
  inflation: /\b(?:rise|rises|rose|increase|increases|increased|fall|falls|fell|ease|eases|eased|accelerate|accelerates|accelerated|stands? at|comes? in|reporta|registr(?:a|o|ó)|fue de|se situ(?:a|ó|o)|sube|baja|acelera|desaceler(?:a|o|ó)|ubica)\b/i,
  'state-of-nation': /\b(?:deliver|delivers|delivered|presenta|presento|rinde|rindio|version estenografica|official transcript)\b/i,
  'budget-package': /\b(?:deliver|delivers|delivered|submit|submits|submitted|presenta|presento|entrega|entrego)\b/i,
  'revenue-law': /\b(?:approve|approves|approved|reject|rejects|rejected|aprueba|aprobo|rechaza|rechazo)\b/i,
  'spending-budget': /\b(?:approve|approves|approved|reject|rejects|rejected|aprueba|aprobo|rechaza|rechazo)\b/i,
  election: /\b(?:win|wins|won|elect|elects|elected|result|results|gana|gano|elige|electo|resultado)\b/i,
});
const FORECAST = /\b(?:analysts?|economists?|markets?|investors?)\s+(?:expect|forecast|predict|anticipat)|\b(?:is|are|was|were) expected\b|\b(?:forecast|projected|likely|may|might|could|se espera|podria|podría|preve|prevé|pronostic|estim(?:a|an) que|anticip(?:a|an) que)\b/i;

function scheduleRows(value) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.events) ? value.events : [];
}

function candidateDay(candidate, explicitDay = '') {
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicitDay)) return explicitDay;
  const stored = String(candidate?.date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
  const time = Date.parse(candidate?.publishedAt || candidate?.published_at || '');
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : '';
}

function linkScheduledCandidate(candidate, schedule, explicitDay = '') {
  const day = candidateDay(candidate, explicitDay);
  if (!day) return null;
  const text = fold([
    candidate?.title,
    candidate?.dek,
    candidate?.why,
    candidate?.context,
    candidate?.source,
    candidate?.sourceName,
  ].filter(Boolean).join(' '));

  for (const row of scheduleRows(schedule)) {
    if (row?.resolvedOutcome || !row?.id || row.date !== day || row.approx === true || row.outcomeRequired !== true) continue;
    const actor = String(row.outcome?.actor || '').trim();
    const topic = String(row.outcome?.topic || '').trim();
    const actorPattern = ACTORS[actor];
    const topicPattern = TOPICS[topic];
    const outcomePattern = OUTCOMES[topic];
    if (!actorPattern || !topicPattern || !outcomePattern) continue;
    const actorMatched = actorPattern.test(text);
    const actorImplicitButScoped = row.outcome?.actorMayBeImplicit === true
      && /\b(?:mexico|mexican|national|nacional)\b/i.test(text);
    if ((!actorMatched && !actorImplicitButScoped) || !topicPattern.test(text) || !outcomePattern.test(text)) continue;
    if (FORECAST.test(text)) continue;
    return {
      id: row.id,
      date: row.date,
      label: row.label || '',
      source: row.source || '',
      sourceUrl: row.sourceUrl || '',
      importanceFloor: Number(row.importanceFloor) || 0,
      requiredForBrief: row.requiredForBrief === true,
      outcomeRequired: true,
      actor,
      topic,
    };
  }
  return null;
}

const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
function dateMarkers(day) {
  const [year, month, date] = String(day).split('-').map(Number);
  if (!year || !month || !date) return [];
  const shortYear = String(year).slice(-2);
  return [
    `${String(date).padStart(2, '0')}/${String(month).padStart(2, '0')}/${shortYear}`,
    `${String(date).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
    `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`,
    `${date} de ${MONTHS_ES[month - 1]} de ${year}`,
    `${String(date).padStart(2, '0')} de ${MONTHS_ES[month - 1]} de ${year}`,
    `${MONTHS_EN[month - 1]} ${date}, ${year}`,
  ].map(fold);
}

function dueScheduledRows(schedule, startDay, endDay = startDay) {
  return scheduleRows(schedule).filter((row) => row?.id
    && row.approx !== true
    && row.outcomeRequired === true
    && row.requiredForBrief === true
    && row.date >= startDay
    && row.date <= endDay);
}

function missingScheduledRows(dueRows, candidates) {
  const present = new Set((Array.isArray(candidates) ? candidates : [])
    .map((item) => item?._scheduled?.id).filter(Boolean));
  return (Array.isArray(dueRows) ? dueRows : []).filter((row) => !present.has(row.id));
}

// Turn an official outcome page into a candidate only when a bounded excerpt
// contains the scheduled date and the configured actor/topic/outcome. The calendar
// entry alone can never become news, and an older result on the same landing page
// cannot satisfy today's obligation.
// A reviewed, already-completed deadline remains mandatory. Do not turn its
// deadline into a new event date or let a generic RSS mention close it. This
// deliberately narrow adapter validates the specific official 2027 revenue-law
// report on every seed; configuration alone never supplies an outcome.
function seedResolvedRevenueDeadline(row, pageText) {
  const resolution = row?.resolvedOutcome;
  const url = 'https://www.canaldelcongreso.gob.mx/noticias/10338';
  if (row?.id !== 'federal-revenue-law-2027-2026-10-31'
    || row.date !== '2026-10-31' || row.approx === true
    || row.requiredForBrief !== true || row.outcomeRequired !== true
    || row.outcome?.actor !== 'congress' || row.outcome?.topic !== 'revenue-law'
    || resolution?.status !== 'approved-and-sent-to-executive'
    || resolution.reportedOn !== '2026-10-28'
    || resolution.source !== 'Canal del Congreso'
    || resolution.sourceUrl !== url || row.outcomeSourceUrl !== url) return null;
  const text = fold(pageText);
  const evidence = [
    '28 de octubre de 2026',
    'Senado aprueba Ley de Ingresos 2027 por 10.6 billones de pesos',
    'Con 75 votos a favor y 34 en contra, la Ley de Ingresos para 2027 fue aprobada en lo general por el Senado de la República.',
    'En lo particular, se logró 73 en pro y 33 en contra, por lo que quedó en sus términos y fue enviada al Ejecutivo Federal.',
  ].map(fold);
  // Require the actual article's consecutive opening, not scattered archive cards.
  const opening = `${evidence[0]} ${evidence[1]} senado de la republica `;
  const afterOpening = text.startsWith(opening) ? text.slice(opening.length) : '';
  const outcomeText = afterOpening.replace(/^\d[\d,.]* vistas /, '');
  if (!afterOpening || outcomeText === afterOpening
    || !outcomeText.startsWith(`${evidence[2]} ${evidence[3]}`)
    || /\b(?:no fue aprobada|no fue enviada|no se aprobo|no se envio|rechazo la ley|fe de erratas|correccion|actualizacion|update|pendiente|devuelta)\b/.test(text)) return null;
  return {
    id: `scheduled:${row.id}`, url,
    title: 'Senado aprueba Ley de Ingresos 2027 y la envía al Ejecutivo; resultado reportado el 28 de octubre, antes del plazo del 31 de octubre',
    dek: 'Canal del Congreso reportó la aprobación en lo general y en lo particular. La publicación en el DOF y la entrada en vigor son etapas distintas, no verificadas por este resultado.',
    source: 'canaldelcongreso.gob.mx', sourceName: resolution.source,
    tier: 1, beat: row.kind || 'fiscal', lang: 'es',
    published_at: resolution.reportedOn,
    _editorialDate: resolution.reportedOn, _coverage: [],
    _scheduled: {
      id: row.id, date: row.date,
      label: 'Senate approval deadline; approval already reported October 28, not a new October 31 vote',
      source: row.source, sourceUrl: row.sourceUrl,
      importanceFloor: Number(row.importanceFloor) || 0,
      requiredForBrief: true, outcomeRequired: true,
      actor: 'congress', topic: 'revenue-law',
    },
  };
}

function seedScheduledCandidate(row, pageText) {
  if (row?.resolvedOutcome) return seedResolvedRevenueDeadline(row, pageText);
  const outcomeUrl = row?.outcomeSourceUrl || row?.sourceUrl;
  if (!row?.id || !row?.date || !outcomeUrl || !String(pageText || '').trim()) return null;
  const markers = dateMarkers(row.date);
  const normalizedPage = fold(pageText);
  const markerWindows = [];
  for (const marker of markers) {
    let from = 0;
    while (from < normalizedPage.length) {
      const index = normalizedPage.indexOf(marker, from);
      if (index < 0) break;
      markerWindows.push(normalizedPage.slice(Math.max(0, index - 100), index + 600));
      from = index + marker.length;
    }
  }
  const chunks = [...markerWindows, ...String(pageText)
    .split(/(?:\bTexto completo\b|(?<=[.!?])\s+|\s+(?=\d{2}\/\d{2}\/\d{2,4}\s*[|·]))/i)
    .map((value) => value.trim()).filter(Boolean)];
  for (const chunk of chunks) {
    const normalized = fold(chunk);
    if (!markers.some((marker) => normalized.includes(marker))) continue;
    const linked = linkScheduledCandidate({ title: chunk, sourceName: row.source }, [row], row.date);
    if (!linked) continue;
    return {
      id: `scheduled:${row.id}`,
      url: outcomeUrl,
      title: `${row.label}: ${chunk}`.slice(0, 300),
      dek: row.mechanism || '',
      source: (() => { try { return new URL(outcomeUrl).hostname.replace(/^www\./, ''); } catch { return ''; } })(),
      sourceName: row.source,
      tier: 1,
      beat: row.kind || 'economy',
      lang: 'es',
      published_at: `${row.date}T18:00:00.000Z`,
      first_seen: `${row.date}T18:00:00.000Z`,
      _editorialDate: row.date,
      _coverage: [],
      _scheduled: linked,
    };
  }
  return null;
}

module.exports = { dueScheduledRows, linkScheduledCandidate, missingScheduledRows, seedScheduledCandidate };
