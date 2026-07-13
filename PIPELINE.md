# The data pipeline — the accuracy-first spine

The wedge is live, granular economic data. This is the machine that keeps it correct and current, at $0, with no server and **no LLM anywhere in the number path** (the AI writes narrative only, and only about numbers the pipeline already computed). Architecture ratified by a Fable strategy call — see [DATA-SOURCES.md](DATA-SOURCES.md) for the sources it feeds on.

## The doctrine (what protects every number)

1. **Contract, not config-DSL.** Every source shares one harness — `fetch → normalize → validate → stamp provenance → emit` — plus a declarative **manifest** (id, cadence, license, units, thresholds, canonical-key). The messy `fetch`/`parse` stays ordinary per-source code. Uniformity lives where accuracy lives, not in a fetch language we'd rebuild later.
2. **Fail closed.** A source that can't be fetched or validated **never overwrites** its served file — the site keeps serving the last good value. Nothing is ever guessed or blanked.
3. **Crosswalks are frozen and exact-or-fail.** The canonical municipio key is INEGI's 5-digit **CVEGEO**. Any source with different codes (IMSS) or names (Banxico) is matched **once, offline** in `build-crosswalks.js`; ambiguities go in a human-reviewed override table. At runtime it's exact-lookup-or-throw — **no fuzzy matching, ever**, and no unmapped code is silently dropped.
4. **Vintage everywhere.** Every file carries its data's own `vintage` (not the fetch time), and the frontend **renders it with every figure** — that's what stops a 2020 poverty map from reading as if it were live.
5. **One canonical source per metric.** When two sources give "the same" number, one is canonical; the other only cross-checks. Divergence is published as trust content, never silently blended.
6. **Geo-epoch.** The municipio catalog + crosswalks + map geometry move together as one versioned unit, so keys never drift as municipios are created.
7. **Transparency is the product.** `data/health.json` is machine-generated every run and drives the public [Estado de los datos](site/health.html) page — which is also the ops dashboard.

## Layout

```
pipeline/
  run.js                 orchestrator — runs connectors, writes data/health.json
  build-crosswalks.js    offline: freezes the geo-epoch (universe + IMSS xwalk + geometry)
  lib/
    contract.js          the shared harness (fetch→validate→provenance→emit, fail-closed)
    http.js              fetch w/ browser UA + retry (WAF-tolerant); the only network code
    validate.js          hard gates (schema, completeness collapse) + soft flags (anomaly)
    crosswalk.js         exact-or-fail CVEGEO lookup + coverage report
    provenance.js        per-series-block provenance + vintage stamp
    lastgood.js          fail-closed baseline (reads the committed data/ file)
    emit.js / alert.js / csv.js
  connectors/            one file per source family (manifest + fetchRaw + normalize)
  crosswalks/            FROZEN artifacts (committed): municipios.frozen.json, imss.frozen.json, overrides/
  reference/             raw geo-epoch scratch (gitignored, regenerable)
data/
  series/*.json          national time-series (pulse)
  layers/*.json          municipio-keyed map layers (CVEGEO -> value)
  geo/municipios.topojson the map geometry for this geo-epoch
  health.json            the data-health feed
```

## Run it

```bash
cd pipeline
node build-crosswalks.js     # once per geo-epoch (needs reference/ artifacts)
node run.js                  # refresh everything -> data/*.json + health.json
node run.js --only cre       # one source family
ENABLE_IMSS=1 node run.js --only imss   # the heavy monthly wedge layer
```

Then serve the repo root statically (`python3 -m http.server` from the repo root) and open `/`.

### Tokens (both free, one-time)
Set as env vars locally and as GitHub Actions secrets:
- `INEGI_TOKEN` — register at inegi.org.mx (INPC, PIB, ITAEE, Censo).
- `BANXICO_TOKEN` — one captcha at banxico.org.mx (policy rate, USD/MXN FIX, reserves).

Without them those connectors **fail closed and say so** on the health page — by design.

## Add a connector (the "stamping" step)

Create `connectors/<source>.js` exporting `connectors = [{ manifest, fetchRaw, normalize }]`:
- `manifest.kind` = `series` (national time series) or `layer` (municipio-keyed; must set `canonicalKey:'cvegeo'`).
- `fetchRaw(ctx)` — imperative, per-source (use `getText`/`getJson` from `lib/http.js`).
- `normalize(raw, ctx, prior)` — return `{ vintage, data }` (series) or `{ vintage, values }` (layer, keyed by CVEGEO). If the source uses non-CVEGEO codes, map them through `toCvegeo('<xwalk>', code, { cve_ent })`.
- Set `thresholds` (`maxPctChange`, `minRows`/`minCovered`, `maxRowDrop`) and the honest `license`.

The harness handles validation, provenance, coverage, fail-closed, and health automatically.

## CI

`.github/workflows/refresh.yml` runs every 6h (fuel/rates/context), commits changed `data/`, and opens a GitHub issue on **real** failures (missing-token/skipped are filtered out). `refresh-imss.yml` runs monthly with `ENABLE_IMSS=1`. The site (Cloudflare/GitHub Pages) redeploys on each push.
