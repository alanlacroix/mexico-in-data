// contract.js — the connector contract + the shared harness every source runs
// through. A connector module exports:
//   export const manifest = { id, title, metric, canonicalSource, source,
//       sourceUrl, license, cadence, units, track, kind:'series'|'layer',
//       granularity, canonicalKey, thresholds:{...} }
//   export async function fetchRaw(ctx) -> raw            (imperative, per-source)
//   export function normalize(raw, ctx) -> {vintage, data|values, notes?}
// The harness handles the uniform part (Fable: uniformity lives where accuracy
// lives): validate -> stamp provenance -> completeness/coverage -> emit, with
// fail-closed + alerting around all of it. Fetch/parse stays disposable per-source.

import { redact } from './http.js';
import { stampProvenance } from './provenance.js';
import { validate, isHardFail } from './validate.js';
import { loadLastGood } from './lastgood.js';
import { emit } from './emit.js';
import { raiseAlert } from './alert.js';
import { coverageReport } from './crosswalk.js';

const REQUIRED = ['id', 'title', 'metric', 'source', 'sourceUrl', 'license', 'cadence', 'units', 'track', 'kind'];

export function assertManifest(m) {
  for (const k of REQUIRED) if (!m[k]) throw new Error(`manifest ${m.id || '?'} missing "${k}"`);
  if (!['series', 'layer'].includes(m.kind)) throw new Error(`manifest ${m.id}: kind must be series|layer`);
  if (m.kind === 'layer' && m.canonicalKey !== 'cvegeo')
    throw new Error(`manifest ${m.id}: layers must join on canonicalKey "cvegeo"`);
}

// Pull the publisher's own series code out of a manifest sourceUrl so the sources
// page can print it (Banxico SIE, FRED, World Bank indicator). Returns '' when the
// source has no clean code (CRE, CONEVAL, SESNSP, IMSS, Data México). One extractor,
// used by both the live run and the no-network backfill, so the code shown always
// matches the URL the connector actually calls.
export function seriesIdFromUrl(u) {
  if (!u) return '';
  let m = /\/series\/([A-Za-z0-9._-]+?)(?:\/datos)?(?:[/?]|$)/.exec(u); // Banxico SIE + FRED
  if (m) return m[1];
  m = /\/indicator\/([A-Za-z0-9._-]+)/.exec(u); // World Bank Indicators API
  if (m) return m[1];
  return '';
}

/** Run one connector end-to-end. Never throws — returns a health record. */
export async function runConnector(mod, ctx) {
  const m = mod.manifest;
  const rec = {
    id: m.id,
    title: m.title,
    metric: m.metric,
    source: m.source,
    seriesId: seriesIdFromUrl(m.sourceUrl),
    sourceUrl: m.sourceUrl,
    track: m.track,
    kind: m.kind,
    cadence: m.cadence,
    freshnessGraceDays: Number.isFinite(m.thresholds?.freshnessGraceDays) ? m.thresholds.freshnessGraceDays : null,
    canonicalSource: !!m.canonicalSource,
    status: 'ok',
    flags: [],
    startedAt: ctx.now,
  };
  try {
    assertManifest(m);
    const prior = loadLastGood(m);

    const raw = await mod.fetchRaw(ctx);
    // prior is passed so snapshot sources (e.g. 4-hourly fuel) can accrue history
    const norm = mod.normalize(raw, ctx, prior);
    const out = stampProvenance(m, norm, ctx);

    // hard/soft accuracy gate
    const flags = validate(m, out, prior);

    // layer coverage against the canonical municipio universe (exact CVEGEO only)
    if (m.kind === 'layer') {
      const cov = coverageReport(out.values, { minCovered: m.thresholds?.minCovered });
      if (cov.error) throw new Error(`${m.id}: ${cov.error} (e.g. ${cov.invalid.join(', ')})`);
      if (cov.belowBand) flags.push(`coverage_below_band`);
      out.meta.coverage = { covered: cov.covered, universe: cov.universe };
    }

    out.meta.flags = flags;
    const written = emit(m, out);

    rec.status = flags.length ? 'ok_flagged' : 'ok';
    rec.flags = flags;
    rec.vintage = out.meta.vintage;
    rec.fetchedAt = out.meta.fetchedAt;
    rec.rowCount = out.meta.rowCount;
    rec.file = written;
    if (m.kind === 'layer') rec.coverage = out.meta.coverage;
  } catch (err) {
    rec.status = 'failed';
    rec.hard = isHardFail(err);
    rec.message = redact(String(err?.message || err)); // health.json is published
    const kept = loadLastGood(m);
    rec.servingVintage = kept?.meta?.vintage || null; // what the site keeps serving
    rec.stale = !kept; // no last-good at all = this source is dark
    raiseAlert(m, err, ctx);
  }
  rec.finishedAt = new Date().toISOString();
  return rec;
}
