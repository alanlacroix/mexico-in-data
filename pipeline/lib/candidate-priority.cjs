'use strict';

// Cost caps must never become hidden editorial filters. Exact scheduled outcomes
// enter the curator first, followed by reports the event log has not processed.
// Within that unseen pool, likely state changes enter before obviously routine
// coverage. This does not assign importance or publish anything; it only prevents a
// busy morning of weather, sport, profiles and how-tos from crowding a prior-evening
// policy or trade development out before the curator can score it.
const ROUTINE_RX = /^(?:opinion|from the archive|how|what|who|where|when|why)\b|^¿|\b(?:clima|weather|hor[oó]scop|deportes?|partido|match|receta|recipe|gu[ií]a|guide|tips?|c[oó]mo ahorrar|celebration|profile|los hombres detr[aá]s)\b/i;
const STATE_CHANGE_RX = /\b(?:aprueb|autoriza|publica|emite|firma|acuerd|reanuda|reactiva|restablec|suspend|proh[ií]b|rechaza|reduce|aumenta|recorta|mantiene|holds?|raises?|cuts?|approves?|rejects?|signs?|rules?|reopens?|resumes?|suspends?|sanctions?|tariffs?|begins? production|starts? production|announces? investment|acquires?|merges?)\w*/i;
const CONSEQUENCE_RX = /\b(?:gobierno|congreso|senado|corte|tribunal|banxico|banco de m[eé]xico|hacienda|president|secretar[ií]a|regulad|comisi[oó]n|cofepris|cfe|pemex|estados unidos|ee\.?\s*uu\.?|u\.?s\.?|arancel|tariff|t-?mec|usmca|trade agreement|import|export|inspecci[oó]n|inspection|inflaci[oó]n|inflation|tasa|interest rate|impuesto|tax|ley|law|reforma|election|diplom[aá]tic|security|seguridad|deuda|debt)\w*/i;

function attentionSignal(candidate) {
  const text = `${candidate?.title || ''} ${candidate?.dek || ''}`.trim();
  if (!text) return 0;
  if (ROUTINE_RX.test(text)) return -1;
  return Number(STATE_CHANGE_RX.test(text)) + Number(CONSEQUENCE_RX.test(text));
}

function fallbackImportanceComponents(candidate) {
  const text = `${candidate?.title || ''} ${candidate?.dek || ''}`.trim();
  const empty = { nationalConsequence: 0, usMexicoStakes: 0, modelImpact: 0, durability: 0, officialness: 0 };
  if (!text || attentionSignal(candidate) < 0) return empty;
  const officialUrl = /(?:\.gob\.mx|inegi\.org\.mx|banxico\.org\.mx|ustr\.gov|whitehouse\.gov|dof\.gob\.mx)/i.test(String(candidate?.url || ''));
  const publicActor = /\b(?:government|gobierno|congress|congreso|senate|senado|court|corte|tribunal|banxico|banco de m[eé]xico|hacienda|president|secretar[ií]a|regulator|regulad|commission|comisi[oó]n|cofepris|cfe|pemex)\b/i.test(text);
  const usMexico = /\b(?:united states|estados unidos|ee\.?\s*uu\.?|u\.?s\.?|usmca|t-?mec|trade agreement|arancel|tariff|import|export|border|frontera)\w*/i.test(text);
  const operatingModel = /\b(?:investment|inversi[oó]n|acqui|merger|plant|factory|production|manufactur|energy|energ[ií]a|infrastructure|infraestructura|bank|fintech|payment|technology|tecnolog[ií]a|artificial intelligence|trade|comercio|export|import)\w*/i.test(text);
  const companyMove = /\b(?:company|empresa|launch|lanza|starts?|inicia|begins?|acquires?|invierte|invests?)\w*/i.test(text);
  const changed = STATE_CHANGE_RX.test(text);
  return {
    nationalConsequence: publicActor ? (officialUrl ? 2 : 1) : 0,
    usMexicoStakes: usMexico ? 2 : 0,
    modelImpact: operatingModel ? 2 : companyMove ? 1 : 0,
    durability: changed ? 2 : attentionSignal(candidate) > 0 ? 1 : 0,
    officialness: officialUrl ? 2 : (candidate?.tier === 1 || candidate?.tier === '1' || candidate?.tier === 'specialist') ? 1 : 0,
  };
}

function prioritizeCandidates(candidates, options = {}) {
  const editorialDate = String(options.editorialDate || '').trim();
  const dateOf = typeof options.dateOf === 'function'
    ? options.dateOf
    : (candidate) => String(candidate?._editorialDate || candidate?.date || '').trim();
  return (Array.isArray(candidates) ? candidates : []).slice().sort((a, b) =>
    Number(Boolean(b?._scheduled)) - Number(Boolean(a?._scheduled))
    || Number(Boolean(a?._alreadyPublished)) - Number(Boolean(b?._alreadyPublished))
    // The curator's bounded input is first a daily-edition budget. Exact-day rows
    // cannot be crowded out by an older three-day backlog before they are assessed.
    || (editorialDate
      ? Number(dateOf(b) === editorialDate) - Number(dateOf(a) === editorialDate)
      : 0)
    // Inside each date lane, obvious weather/how-to/sports volume remains last.
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

module.exports = { attentionSignal, decisionCoverage, fallbackImportanceComponents, prioritizeCandidates };
