# Data sources — the registry behind the wedge

The wedge is **live, granular economic data on a municipio map**. This file is the build-ready audit of every source that feeds it: what it covers, how granular, how fresh, how we access it, and whether we can legally re-host it. Compiled from 8 parallel source audits (2026-07-08), each verified against live endpoints, not docs.

**Three hard gates every source had to pass:** **G1** we can legally re-host it with attribution · **G2** a cron can fetch it with no *paid* key (free tokens OK) · **G3** no login/captcha wall on the data itself.

**The join key: `CVEGEO`** — INEGI's 5-digit municipio code (2 state + 3 municipio, e.g. `07101`). The map geometry, INEGI indicators, and most gov datasets share it, so layers join with zero name-matching. Two important sources (IMSS, Banxico) do *not* use it natively — see [Crosswalks](#crosswalks-the-real-engineering).

---

## 1. The verdict: the wedge is real

Fable's hero rested on one bet — that a **live + municipio + economic** dataset actually exists. If it didn't, the map inverts to a static atlas. The hunt found **four** live-granular layers. The bet paid.

| 🦄 Layer | What | Granularity | Cadence | License | CVEGEO | Catch |
|---|---|---|---|---|---|---|
| **IMSS employment** | formal jobs, **wage bill (masa salarial)**, by sector/size/sex/age | **municipio** | **monthly** (since 1997) | Libre Uso MX | ✗ crosswalk | ~400MB/mo raw; WAF; jobs at employer-registration muni |
| **SESNSP crime** | homicide, extortion, robbery… | **municipio** | **monthly** | CC-BY-4.0 | ✅ | clean mirror ends Dec-2025 (2026 → SharePoint) |
| **CRE fuel prices** | gas/diésel per station | **point (~13k stations)** | **every 4h** | Libre Uso MX | derivable | — |
| **Remittances** (CONAPO) | remesas MXN received | **municipio** | **quarterly** | CC-BY-4.0 | ✅ | quarterly, not monthly |

Plus **DENUE** (~6M geolocated businesses, municipio, semi-annual) as a business-density layer. **IMSS is the crown jewel** — it's not just headcount, it carries the wage bill cross-cut by sector, so it's a genuine monthly municipio economic panel.

**The honest limit:** there is **no municipio-level, monthly, GDP-style indicator** in Mexico. INEGI's IGAE/ITAEE/ENOE stop at national/state. So the map's "economic pulse" at municipio grain is *employment + wages* (IMSS), not output. State-level output exists (ITAEE quarterly, PIBE annual, OECD Regional). Municipio-level output does not — don't promise it.

---

## 2. The v1 shortlist — what actually builds the first screen

Everything below is keyless-or-free-token and re-hostable. Build in three waves so a compelling hero ships **before** any crosswalk engineering.

### Wave 1 — the hero, no crosswalk needed (ship first)
The fastest path to a live-feeling, honest hero.

**Map geometry**
- **`diegovalle/mxmaps` → `mxmunicipio.topoJSON`** — web-ready municipal geometry, keyed on CVEGEO. The current registry contains 2,478 municipalities. (Regenerate from INEGI Marco Geoestadístico 2025 SHP via mapshaper when we want the newest boundaries.)

**Opening Exhibit-1 story layer** (CVEGEO-native, zero join cost)
- **CONEVAL poverty 2020** *or* **CONAPO marginación 2020** — the current poverty file has 2,466 published municipal values. Static (2020), so label it as a snapshot rather than a live reading.

**Pulse strip** (live national heartbeat — all keyless/CORS or one API call)
- **BIS `WS_XRU`** — daily peso/USD, keyless, CORS, client-side live. *The heartbeat.* (returned 17.47 live)
- **World Bank** `country/MEX/...` — GDP, inflation, population; keyless, wildcard CORS. Headline national tiles (annual = "latest").
- **Banxico SIE** one call → policy rate `SF61745`, reserves `SF43707`, FIX `SF43718`, national remesas. Free token, server-side.
- **INEGI** INPC `216064` (inflation), IGAE, PIB `381016`. Free token, server-side, `DatoReciente=true`.
- **CRE fuel** national average (every 4h) — the most viscerally felt number.

### Wave 2 — the *alive* wedge (first real engineering)
- **IMSS monthly employment** as the map's toggle layer → **build the IMSS→CVEGEO crosswalk** (the gating task). This is what makes the map *live + granular* and drives repeat visits.

### Wave 3 — additive layers + retention
- **CONAPO remesas** (municipio, quarterly, CC-BY, CVEGEO-native — preferred over Banxico CE166), **SESNSP crime** (municipio, monthly), **DENUE** business density, **ITAEE** (state quarterly output).
- **The weekly narrative** — scheduled Claude agent writes "This week in the Mexican economy" citing the exhibits. Per Fable, *this is the retention product* — the reason people return weekly (the map alone doesn't change fast enough).
- **Forecast layer** — republish **Banxico's Encuesta de Expectativas** (monthly: GDP, inflation, peso, rate). Replaces a homegrown predictor with professional consensus.

---

## 3. Full registry by source family

Priority H = in v1. Track: Pulse (national heartbeat) · Map (estado/municipio) · Unicorn (live+municipio+economic) · Context (reference/intl).

### INEGI — the spine (Términos de Libre Uso: re-host + commercial OK w/ attribution)
Indicators API: `.../api/indicadores/desarrolladores/jsonxml/INDICATOR/{id}/es/{area}/{DatoReciente}/{BIE|BISE}/2.0/{token}?type=json`. Free email token (server-side only). Area = CVEGEO (`00` nat / 2-digit estado / 5-digit municipio). Confirmed IDs: **INPC 216064, PIB 381016, Población 1002000001**. Get IGAE/ITAEE/PIBE/ENOE IDs from the Constructor de Consultas.

| Dataset | Gran (CVEGEO) | Cadence | Track | Pri |
|---|---|---|---|---|
| INPC / IGAE / PIB | federal | monthly/qtrly | Pulse | H |
| **ITAEE** state activity | estado ✅ | **quarterly** | Map (best sub-annual state output) | H |
| PIBE state GDP | estado ✅ | annual | Map | H |
| ENOE employment | fed + 32 estados | monthly/qtrly | Pulse+Map | H |
| Censo 2020 | **municipio ✅** | decennial | Map base | H |
| **DENUE** businesses | **municipio ✅** + lat/long | semi-annual | Map (density) | H |
| Marco Geoestadístico geometry | municipio ✅ | annual | Map geometry | H |

### Banxico — SIE API (⚠ NOT open license — Clause 8, see licensing)
Base `banxico.org.mx/SieAPIRest/service/v1/`. Free token (one-time captcha). Whole pulse in one call: `/series/SF61745,SF43718,SF43707,SF60648,SF60633,SP68257/datos/oportuno?token=…`

| Dataset | ID | Gran (CVEGEO) | Cadence | Track | Pri |
|---|---|---|---|---|---|
| Policy rate / FIX / reserves / TIIE / CETES / UDIS | SF61745, SF43718, SF43707, SF60648, SF60633, SP68257 | federal | daily–weekly | Pulse | H |
| Remesas nacional | CE81 / SE27803* | national | monthly | Pulse | H |
| Remesas municipio | CE166 | municipio, **name not CVEGEO** | quarterly | Unicorn/Map | H (prefer CONAPO) |
| **Encuesta Expectativas** (forecasts) | SIE sector 24 | national | monthly | Pulse/Context — predictor replacement | H |

\* SE27803 + expectations SR-IDs are community-standard, unconfirmed — pull from `/service/v1/doc/catalogoSeries` before hardcoding. SF-IDs and table IDs confirmed.

### The unicorns & datos.gob.mx CC-BY layers
| Dataset | Source | Gran (CVEGEO) | Cadence | License | Pri |
|---|---|---|---|---|---|
| **IMSS employment + wage bill** | datos.imss.gob.mx `asg-YYYY-MM-DD.csv` | municipio, **✗ IMSS catalog** | **monthly** | Libre Uso MX | H |
| **CRE fuel prices** | `publicacionexterna.azurewebsites.net/publicaciones/{places,prices}` | **point** → muni | **every 4h** | Libre Uso MX | H |
| **SESNSP crime** | CKAN `incidencia_delictiva` → repodatos CSV | municipio ✅ (zero-pad) | monthly | CC-BY-4.0 | H |
| **CONAPO remesas** | CKAN `remesas` → `remesas_2013-2024.csv` | municipio ✅ | quarterly | CC-BY-4.0 | H |
| CONEVAL poverty / rezago | coneval / CKAN | municipio ✅ | ~5yr (2020) | Libre Uso / CC-BY | H |
| CONAPO marginación | IMU_2020.zip | municipio ✅ | ~5yr (2020) | Libre Uso MX | H |
| CAPUFE toll traffic | CKAN `aforo_mensual...` | highway tramo | monthly | CC-BY-4.0 | M |
| CFE electricity consumption | CKAN `consumo_final...` | national | monthly | CC-BY-4.0 | M |
| SE FDI (nearshoring) | gob.mx/cms xlsx / CKAN | **estado** (no muni FDI) | quarterly | Libre Uso MX | H |
| Pemex crude `CRUEF` | ebdi.pemex.com CSV | estado | monthly | Libre Uso MX | M |
| DATATUR hotel occupancy | datatur.sectur.gob.mx | destino (≈muni) | monthly | Libre Uso MX | M |

### US ↔ Mexico (US federal = public domain)
| Dataset | Source | Cadence | CORS | Track | Pri |
|---|---|---|---|---|---|
| **USD/MXN + fed funds** (drives Banxico) | **FRED** (free key) | daily | ✅ | Pulse | H |
| US–MX trade ("#1 partner") | Census Trade API (free key) | monthly | proxy | Context headline | H |
| **Border wait times** | CBP `bwt.cbp.gov/api/waittimes` | real-time, keyless | proxy | Pulse (border) | H |
| Border crossing volumes | BTS Socrata `keg4-3bc2` | monthly, keyless | ✅ | Context | M |
| FDI / services trade | BEA (free UserID) | quarterly | proxy | Context | M |
| Ag export sales to MX | USDA FAS ESR (free key) | weekly | proxy | Pulse | M |

### International (comparison + client-side live lane — all keyless + CORS)
| Dataset | Source | Reaches MX subnational? | Cadence | Pri |
|---|---|---|---|---|
| GDP/inflation/pop, 1400+ indicators | **World Bank** (wildcard CORS) | no (national) | annual | H |
| **Daily peso/USD** | **BIS `WS_XRU`** | no | daily | H |
| **State GDP/GDP-per-cap** | **OECD Regional `DSD_REG_ECO`** | **YES — 32 states, codes `ME01…ME32`** | annual (~2yr lag) | M-H |
| LatAm benchmarks, some subnational | CEPALSTAT (wildcard CORS) | some | annual | M |
| CPI/BOP/monetary | IMF SDMX 3.0 | no | monthly | M (brittle — resolve keys at build) |

**Comparison set:** always-show → USA, Canada (USMCA) + Brazil, Chile, Colombia + LatAm & OECD aggregates. Optional EM-peers toggle → Turkey, Indonesia, Poland. One WB multi-country call does it.

### Political history (context layer, not live)
- **INE** SICEEN/Atlas 1991–2021 + Cómputos 2024 — federal election results by casilla→sección→distrito. Keyless. Keys on electoral geography, **not CVEGEO** → needs sección→municipio crosswalk (or use municipio-native local ayuntamiento cómputos). Feeds the "history of Mexico's political environment" section.

---

## 4. Crosswalks — the real engineering

The only non-trivial data work. Build each once, version it, validate row counts each refresh.

1. **IMSS internal municipio catalog (`A01`…) → INEGI CVEGEO.** Gates the whole IMSS wedge. Buildable: INEGI equivalence service `gaia.inegi.org.mx/wscatgeo/...`; Secretaría de Economía's *Data México* already ships IMSS on INEGI codes = proof it's solid.
2. **Banxico municipio *name* → CVEGEO** (accents, "San/Santa", renames). **Avoidable** — use CONAPO's CC-BY, CVEGEO-native remesas instead.
3. **INE sección → municipio** — only for the elections/history layer, later.

---

## 5. Cross-cutting build notes

- **CORS is mostly moot.** The cron fetches server-side and re-serves our own static JSON, so gov APIs needing no CORS headers is a non-issue. Client-side-live is reserved for the few wildcard-CORS sources (World Bank, BIS, CEPALSTAT) — nice for a truly-live peso ticker.
- **Imperva/WAF everywhere** (IMSS, datos.gob.mx/repodatos): fetch with a **realistic browser User-Agent** + retry/backoff, or get 403/503'd. Bare `urllib`/scripted UAs are blocked; `curl`/browser UA works.
- **`datos.gob.mx` is mid-migration.** Its CKAN API *is* live (CORS `*`, ~1,700 datasets, 99.5% CC-BY) but a parallel new system ("Ajolote") has no API and there are TLS-chain quirks. Robust pattern: **`package_show?id=X`** to read the *current* resource URL, then fetch the **primary source host** with a browser UA. Never hardcode dated filenames; never depend on the portal as the fetch layer.
- **Serve last-good.** All gov endpoints can hiccup — the cron should keep serving the last successful static JSON on failure (the $0 architecture already does this).
- **Aggregate, don't re-host raw.** IMSS is ~400MB/month; the cron downloads → aggregates to (municipio × indicator) → emits slim JSON. Same for DENUE (~6M points → per-municipio counts).

## 6. Licensing — the one thing to watch as the model monetizes

- **INEGI Libre Uso + federal Libre Uso MX + CC-BY-4.0** (most sources): re-host, adapt, **commercial use** all OK with attribution. Clean.
- **Banxico is NOT open.** Clause 1 permits reproduction with attribution; **Clause 8 forbids implying endorsement and selling the data *as data*.** Fine for a free public site with "Fuente: Banco de México (SIE)". **If the business ever monetizes the data feed directly, get written Banxico clarification.** For the municipio remittance map, the CONAPO CC-BY dataset sidesteps this entirely.
- Attribution is mandatory everywhere — every Exhibit's `Source:` line already enforces this (it's the design system's honesty rule, now also the licensing requirement).
