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
  inflation: /\b(?:rise|rises|rose|increase|increases|increased|fall|falls|fell|ease|eases|eased|accelerate|accelerates|accelerated|stands? at|comes? in|reporta|sube|baja|acelera|desaceler(?:a|o)|ubica)\b/i,
  'state-of-nation': /\b(?:deliver|delivers|delivered|presenta|presento|rinde|rindio)\b/i,
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
    if (!row?.id || row.date !== day || row.approx === true || row.outcomeRequired !== true) continue;
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

module.exports = { linkScheduledCandidate };
