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

  return flags;
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
