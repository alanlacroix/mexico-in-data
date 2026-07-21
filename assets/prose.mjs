// prose.mjs — the derived-token layer behind the topic-page stories (Fable plan 2026-07-20).
//
// The story pages weave live numbers into written sentences. A wrong stat card is a wrong
// number; a wrong sentence is a lie in fluent prose. So every judgment word a sentence uses
// (rose / fell / was little changed, cutting / holding / raising, inside / above / below)
// is COMPUTED here from the series, with an explicit threshold, a neutral fallback, and a
// stale-data degrade that names the date instead of implying currency. No template may
// hard-code a direction word about a moving number. Unit tests: pipeline/test/prose-tokens.test.mjs.

// ---- trend: "rose 6.0%" / "fell 2.1%" / "was little changed" ----
// thresholdPct is the dead zone: below it the honest word is "was little changed".
export function trendWord(current, previous, { thresholdPct = 0.5, past = true } = {}) {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return { word: 'is unchanged', pct: null, known: false };
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(pct) < thresholdPct) return { word: past ? 'was little changed' : 'is little changed', pct, known: true };
  const up = pct > 0;
  return { word: past ? (up ? 'rose' : 'fell') : (up ? 'is up' : 'is down'), pct, known: true };
}

// ---- band: "inside" / "above" / "below" Banxico's 2-4% comfort zone ----
export function bandWord(value, lo, hi) {
  if (!Number.isFinite(value)) return { word: '', known: false };
  return { word: value < lo ? 'below' : value > hi ? 'above' : 'inside', known: true };
}

// ---- policy stance: "cutting" / "raising" / "holding" from the last DISTINCT moves ----
// Two consecutive equal readings mean a hold, whatever the move before them was.
export function stanceWord(series) {
  const vals = (series || []).map((p) => p.value).filter(Number.isFinite);
  if (vals.length < 2) return { word: 'setting', known: false };
  const lastValue = vals[vals.length - 1];
  if (vals[vals.length - 2] === lastValue) return { word: 'holding', known: true };
  return { word: lastValue < vals[vals.length - 2] ? 'cutting' : 'raising', known: true };
}

// ---- freshness: a series older than its cadence allows must SAY SO in the sentence ----
// Grace mirrors the site's chart-page lags: loose enough for publication lag, tight enough
// to catch a dropped feed. When stale, the caller renders "the most recent reading, from X".
const GRACE_DAYS = { daily: 6, weekly: 14, monthly: 125, quarterly: 250, annual: 430 };
export function staleness(latestDateIso, cadence, nowMs) {
  const t = Date.parse(latestDateIso && latestDateIso.length <= 7 ? `${latestDateIso}-01` : latestDateIso);
  if (!Number.isFinite(t)) return { stale: true, known: false };
  const days = (nowMs - t) / 86400000;
  return { stale: days > (GRACE_DAYS[cadence] || 125), known: true };
}

// ---- balance framing: "surplus" / "deficit" / "near zero" ----
export function balanceWord(value, nearZero = 0) {
  if (!Number.isFinite(value)) return { word: '', known: false };
  if (Math.abs(value) <= nearZero) return { word: 'near zero', known: true };
  return { word: value > 0 ? 'surplus' : 'deficit', known: true };
}
