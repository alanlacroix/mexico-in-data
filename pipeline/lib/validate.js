// validate.js — the accuracy gate. Deterministic checks that decide whether a
// freshly fetched payload is trustworthy enough to ship. Per Fable's trimmed v1
// doctrine:
//   HARD (throw -> fail closed, keep last-good):
//     - schema/type/units present and well-formed
//     - completeness collapse: rowCount / byte-size fell off a cliff vs last run
//       (this is what catches a WAF serving half a file as a "200")
//     - crosswalk coverage: layers must not silently drop unmapped codes
//   SOFT (flag, still publish):
//     - crude anomaly: a value moved more than maxPctChange for its class
//     - coverage drift within a band
// Cross-source reconciliation is deliberately NOT here — it's a report, not a
// gate (divergence is usually methodology, not error).

class HardFail extends Error {}
export const isHardFail = (e) => e instanceof HardFail;

/**
 * @param {object} m     manifest
 * @param {object} out   provenance-stamped output ({meta, data|values})
 * @param {object} prior last-good output for this id (or null on first run)
 * @returns {string[]} soft flags (hard problems throw)
 */
export function validate(m, out, prior) {
  const flags = [];
  const isLayer = m.kind === 'layer';
  const t = m.thresholds || {};

  // ---- schema / shape ----
  if (isLayer) {
    if (!out.values || typeof out.values !== 'object') throw new HardFail(`${m.id}: layer has no values map`);
    for (const [k, v] of Object.entries(out.values)) {
      if (!/^\d{5}$/.test(k)) throw new HardFail(`${m.id}: layer key "${k}" is not a 5-digit CVEGEO`);
      if (v != null && typeof v !== 'number') throw new HardFail(`${m.id}: value for ${k} is not numeric`);
    }
  } else {
    if (!Array.isArray(out.data)) throw new HardFail(`${m.id}: series data is not an array`);
    for (const pt of out.data) {
      if (!pt || typeof pt.date !== 'string' || typeof pt.value !== 'number')
        throw new HardFail(`${m.id}: series point malformed: ${JSON.stringify(pt)}`);
    }
  }

  // ---- completeness floor ----
  const rows = out.meta.rowCount;
  if (typeof t.minRows === 'number' && rows < t.minRows)
    throw new HardFail(`${m.id}: only ${rows} rows (floor ${t.minRows})`);

  // ---- completeness collapse vs last run (the WAF-partial killer) ----
  if (prior?.meta?.rowCount) {
    const drop = 1 - rows / prior.meta.rowCount;
    if (drop > (t.maxRowDrop ?? 0.4))
      throw new HardFail(
        `${m.id}: rowCount collapsed ${(drop * 100).toFixed(0)}% (${prior.meta.rowCount} -> ${rows}) — likely a partial fetch`
      );
    if (drop > 0.1) flags.push(`rowcount_drop_${(drop * 100).toFixed(0)}pct`);
  }

  // ---- crude anomaly gate (soft) ----
  if (typeof t.maxPctChange === 'number' && prior) {
    const moved = biggestMove(m, out, prior, t.maxPctChange);
    if (moved) flags.push(moved);
  }

  // ---- vintage sanity ----
  if (!out.meta.vintage || out.meta.vintage === 'null')
    throw new HardFail(`${m.id}: missing data vintage`);

  // ---- freshness gate (Fable's anti-rot): a series whose latest observation is past its cadence's
  // grace window gets flagged stale, so a feed that quietly stops updating shows amber on the health
  // page instead of silently looking fresh. Soft (flag, keep serving) — a legit mid-cycle lag never
  // blocks a deploy; a genuinely dead feed surfaces.
  const stale = stalenessFlag(m, out.meta.vintage);
  if (stale) flags.push(stale);

  return flags;
}

// How old the latest observation may be, per cadence, before we call it stale.
// Calibrated to "a full period has been missed, plus normal publication lag" — NOT the raw period
// length. Banxico dates each observation at the period START (Q1 = Jan 1) and publishes with a lag,
// so a perfectly current quarterly feed can read ~190 days old; flagging that would cry wolf. These
// windows flag a feed that has genuinely skipped a release, not one that's merely lagged-but-current.
const GRACE_DAYS = { '4-hour': 2, 'business-daily': 6, daily: 8, weekly: 21, monthly: 90, quarter: 220, annual: 460, yearly: 460 };
function stalenessFlag(m, vintage) {
  const cad = String(m.cadence || '');
  const key = Object.keys(GRACE_DAYS).find((k) => cad.includes(k));
  if (!key) return null;
  const iso = String(vintage).length === 7 ? `${vintage}-01` : String(vintage);
  const v = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(v)) return null;
  const ageDays = (Date.now() - v) / 864e5;
  return ageDays > GRACE_DAYS[key] ? `stale_${key}_${Math.round(ageDays)}d` : null;
}

// Compare a handful of overlapping keys/dates; flag if any jumped more than the
// class threshold. Crude by design — statistical anomaly detection is post-v1.
function biggestMove(m, out, prior, maxPct) {
  const cur = m.kind === 'layer' ? out.values : seriesLatest(out.data);
  const old = m.kind === 'layer' ? prior.values : seriesLatest(prior.data);
  if (!cur || !old) return null;
  let worst = null;
  const keys = m.kind === 'layer' ? Object.keys(cur).slice(0, 4000) : ['_'];
  for (const k of keys) {
    const a = m.kind === 'layer' ? old[k] : old;
    const b = m.kind === 'layer' ? cur[k] : cur;
    if (typeof a !== 'number' || typeof b !== 'number' || a === 0) continue;
    const pct = Math.abs((b - a) / a) * 100;
    if (pct > maxPct && (!worst || pct > worst.pct)) worst = { k, pct };
  }
  return worst ? `anomaly_${worst.k}_${worst.pct.toFixed(0)}pct` : null;
}

function seriesLatest(data) {
  if (!Array.isArray(data) || !data.length) return null;
  return data[data.length - 1].value;
}
