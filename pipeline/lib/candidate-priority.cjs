'use strict';

const { officialnessEvidence } = require('./importance-rubric.cjs');

// Cost caps must never become hidden editorial filters. Exact scheduled outcomes
// enter the curator first, followed by reports the event log has not processed.
// Within that unseen pool, likely state changes enter before obviously routine
// coverage. This does not assign importance or publish anything; it only prevents a
// busy morning of weather, sport, profiles and how-tos from crowding a prior-evening
// policy or trade development out before the curator can score it.
const ROUTINE_RX = /^(?:opinion|from the archive|how|what|who|where|when|why)\b|^¿|\b(?:clima|weather|hor[oó]scop|deportes?|partido|match|receta|recipe|gu[ií]a|guide|tips?|c[oó]mo ahorrar|celebration|profile|los hombres detr[aá]s)\b/i;
const STATE_CHANGE_RX = /\b(?:aprueba[ns]?|aprobo|aprobaron|autoriza[n]?|autorizo|autorizaron|publica[n]?|publico|publicaron|emite[n]?|emitio|emitieron|firma[n]?|firmo|firmaron|acuerda[n]?|acordo|acordaron|reanuda[n]?|reanudo|reactiva[n]?|reactivo|restablece[n]?|restablecio|suspende[n]?|suspendio|prohibe[n]?|prohibio|rechaza[n]?|rechazo|reduce[n]?|redujo|aumenta[n]?|aumento|recorta[n]?|recorto|mantiene[n]?|mantuvo|da(?:n)? luz verde|dio luz verde|(?:da|dan|dio) (?:su |el )?visto bueno|holds?|held|raises?|raised|cuts?|approves?|approved|rejects?|rejected|signs?|signed|rules?|ruled|reopens?|reopened|resumes?|resumed|suspends?|suspended|sanctions?|sanctioned|begins? production|starts? production|announces? investment|acquires?|acquired|merges?|merged)\b/i;
const CONSEQUENCE_RX = /\b(?:gobierno|congreso|senado|corte|tribunal|banxico|banco de mexico|hacienda|president\w*|secretaria|regulad\w*|comision|cofepris|cfe|pemex|inspeccion\w*|inspection\w*|inflacion|inflation|tasas?|interest rates?|impuestos?|tax\w*|ley(?:es)?|laws?|reformas?|elections?|diplomatic\w*|security|seguridad|deuda|debt)\b/i;
const TRADE_RX = /\b(?:trade agreement|arancel(?:es|ari[oa]s?)?|tariffs?|import(?:s|ed|ing|acion|aciones)?|export(?:s|ed|ing|acion|aciones)?|borders?|fronteras?)\b/i;
// Do not let US abbreviations become prefixes: "usurpación", "usuarios" and
// "use" are not United States connections, and English "us" is a pronoun.
const US_REFERENCE_RX = /\b(?:united states|estados unidos|ee\.?\s*uu\.?|u\.s\.?|usmca|t-?mec)(?![a-z0-9_])/i;
const ADVOCACY_RX = /\b(?:abog(?:a|o)|consider(?:a|o)|opin(?:a|o)|advierte|advirtio|llam(?:a|o) a|calls? for|urges?|warn(?:s|ed)?|argues?|believes?)\b/i;
const FORMAL_ACTION_RX = /\b(?:introduces?|files?|submits?|approves?|approved|adopts?|signs?|orders?|announces?|presenta (?:iniciativa|reforma)|somete|aprueba|aprobo|ordena|instruye|anuncia|emite|publica|firma|da(?:n)? luz verde|dio luz verde|(?:da|dan|dio) (?:su |el )?visto bueno)\b/i;

function candidateText(candidate) {
  // Old ledgers retain the same RSS suffix now cleaned at collection. Do not let
  // "La publicación" manufacture a fresh official action during replay.
  const clean = (value) => String(value || '').replace(/\s*(?:The post|El art[ií]culo|La entrada|La publicaci[oó]n)\s+[\s\S]*?\s+(?:appeared first on|apareci[oó] primero en)\s+[\s\S]*$/i, '');
  return `${clean(candidate?.title)} ${clean(candidate?.dek)}`.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').trim();
}

const hasUsReference = (text) => US_REFERENCE_RX.test(text) || /\bUS\b/.test(text);

function commentaryOnlyCandidate(candidate) {
  const text = candidateText(candidate);
  return ADVOCACY_RX.test(text) && !FORMAL_ACTION_RX.test(text);
}

function attentionSignal(candidate) {
  const text = candidateText(candidate);
  if (!text) return 0;
  if (ROUTINE_RX.test(text)) return -1;
  return Number(STATE_CHANGE_RX.test(text)) + Number(CONSEQUENCE_RX.test(text) || TRADE_RX.test(text) || hasUsReference(text));
}

function fallbackImportanceComponents(candidate) {
  const text = candidateText(candidate);
  const empty = { nationalConsequence: 0, usMexicoStakes: 0, modelImpact: 0, durability: 0, officialness: 0 };
  if (!text || attentionSignal(candidate) < 0) return empty;
  const publicActor = /\b(?:government|gobierno|congress|congreso|senate|senado|court|corte|tribunal|banxico|banco de m[eé]xico|hacienda|president|secretar[ií]a|regulator|regulad|commission|comisi[oó]n|cofepris|cfe|pemex)\b/i.test(text);
  const usMexico = hasUsReference(text) || TRADE_RX.test(text);
  const operatingModel = /\b(?:investment|inversion|adquisicion|adquir\w*|acqui\w*|mergers?|plants?|factory|production|produccion|manufactur\w*|energy|energia|infrastructure|infraestructura|banks?|fintech|payments?|technology|tecnologia|artificial intelligence|trade|comercio|export(?:s|acion|aciones)?|import(?:s|acion|aciones)?)\b/i.test(text);
  const companyMove = /\b(?:company|empresa|launch|lanza|starts?|inicia|begins?|acquires?|invierte|invests?)\w*/i.test(text);
  const changed = STATE_CHANGE_RX.test(text);
  return {
    nationalConsequence: publicActor ? (officialnessEvidence(candidate).score === 2 ? 2 : 1) : 0,
    usMexicoStakes: usMexico ? 2 : 0,
    modelImpact: operatingModel ? 2 : companyMove ? 1 : 0,
    durability: changed ? 2 : attentionSignal(candidate) > 0 ? 1 : 0,
    officialness: officialnessEvidence(candidate).score,
  };
}

function prioritizeCandidates(candidates, options = {}) {
  const editorialDate = String(options.editorialDate || '').trim();
  const weekend = options.weekend === true;
  const dateOf = typeof options.dateOf === 'function'
    ? options.dateOf
    : (candidate) => String(candidate?._editorialDate || candidate?.date || '').trim();
  const importanceOf = (candidate) => Object.values(fallbackImportanceComponents(candidate))
    .reduce((sum, value) => sum + value, 0);
  return (Array.isArray(candidates) ? candidates : []).slice().sort((a, b) =>
    Number(Boolean(b?._scheduled)) - Number(Boolean(a?._scheduled))
    || Number(Boolean(a?._alreadyPublished)) - Number(Boolean(b?._alreadyPublished))
    // Weekends recap the eligible week: use the existing business rubric before
    // attention/recency so a weak Saturday item cannot crowd out a stronger Friday
    // development. Weekday editions retain their exact-day assessment budget.
    || (weekend ? importanceOf(b) - importanceOf(a)
      : editorialDate ? Number(dateOf(b) === editorialDate) - Number(dateOf(a) === editorialDate) : 0)
    // Within each priority lane, obvious weather/how-to/sports volume remains last.
    || Number(attentionSignal(b) >= 0) - Number(attentionSignal(a) >= 0)
    || attentionSignal(b) - attentionSignal(a)
    || (Date.parse(b?.published_at || b?.publishedAt || '') || 0)
      - (Date.parse(a?.published_at || a?.publishedAt || '') || 0));
}

function decisionCoverage(candidateCount, decisions) {
  const expected = Math.max(0, Number(candidateCount) || 0);
  const seen = new Set();
  const duplicates = [];
  const invalid = [];
  for (const row of Array.isArray(decisions) ? decisions : []) {
    const index = Number(row?.i);
    if (!Number.isInteger(index) || index < 0 || index >= expected) {
      invalid.push(row?.i);
      continue;
    }
    if (seen.has(index)) duplicates.push(index);
    seen.add(index);
  }
  const missing = Array.from({ length: expected }, (_, index) => index).filter((index) => !seen.has(index));
  return { ok: missing.length === 0 && duplicates.length === 0 && invalid.length === 0, missing, duplicates, invalid };
}

module.exports = {
  attentionSignal,
  commentaryOnlyCandidate,
  decisionCoverage,
  fallbackImportanceComponents,
  prioritizeCandidates,
};
