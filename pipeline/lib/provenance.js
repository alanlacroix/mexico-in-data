// provenance.js — stamp every emitted file with its provenance + vintage.
// Per Fable: provenance lives at the SERIES-BLOCK level, not per value. A file's
// rows all share source/vintage/license, so per-cell stamps only balloon the
// JSON for zero accuracy gain. The `vintage` here is the data's OWN date (e.g.
// "2020" for poverty, "2026-06" for IMSS) — never the fetch time, which lives
// separately in `fetchedAt`. The frontend contract requires `vintage` to render.

/**
 * Wrap normalized output in a provenance envelope.
 * @param {object} m       connector manifest
 * @param {object} norm    { vintage, data?, values?, notes? } from normalize()
 * @param {object} ctx     run context (has ctx.now ISO string)
 */
export function stampProvenance(m, norm, ctx) {
  if (!norm || typeof norm !== 'object') throw new Error(`${m.id}: normalize() returned nothing`);
  if (!norm.vintage) throw new Error(`${m.id}: normalize() must report a data vintage`);

  const isLayer = m.kind === 'layer';
  const payload = isLayer ? norm.values : norm.data;
  if (payload == null) throw new Error(`${m.id}: normalize() returned no ${isLayer ? 'values' : 'data'}`);

  const rowCount = isLayer ? Object.keys(payload).length : payload.length;

  const meta = {
    id: m.id,
    title: m.title,
    metric: m.metric,
    canonicalSource: !!m.canonicalSource,
    source: m.source,
    sourceUrl: m.sourceUrl,
    license: m.license,
    units: m.units,
    cadence: m.cadence,
    track: m.track,
    kind: m.kind,
    granularity: m.granularity,
    canonicalKey: m.canonicalKey || null,
    vintage: String(norm.vintage), // the data's own date — display-layer must show this
    fetchedAt: ctx.now, // when this run pulled it
    rowCount,
    flags: [],
    notes: norm.notes || null,
  };

  return isLayer ? { meta, values: payload } : { meta, data: payload };
}
