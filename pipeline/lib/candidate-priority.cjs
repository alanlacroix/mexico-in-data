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

function prioritizeCandidates(candidates) {
  return (Array.isArray(candidates) ? candidates : []).slice().sort((a, b) =>
    Number(Boolean(b?._scheduled)) - Number(Boolean(a?._scheduled))
    || Number(Boolean(a?._alreadyPublished)) - Number(Boolean(b?._alreadyPublished))
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

module.exports = { attentionSignal, decisionCoverage, prioritizeCandidates };
