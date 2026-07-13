# The data model — what this site covers, and in what order

The canonical first-party input plan (Fable, 2026-07-08). This is both the **section map** and the **connector backlog**.

## The organizing idea: two products, one pipeline

- **The Pulse** — fast national series that let a zero-context visitor grok Mexico in 60 seconds (inflation, growth, jobs, peso, trade, FDI).
- **The Atlas** — the municipio map layers nobody else assembles. **This is the moat.**

The spine is done when the *minimum viable version of both* exists.

## First-party rule (non-negotiable)

**A Mexican official series is always what displays.** An international source (World Bank/IMF/OECD/BIS) may appear in exactly three roles, never as *the* Mexico figure:
1. **Comparison** — Mexico vs. peers, explicitly labeled as comparison.
2. **Genuine absence** — no domestic series exists (rare).
3. **Silent validation** — pipeline cross-check only (e.g. US Census imports vs. INEGI exports), never displayed.

**Every proxy on the site today is a bug with a deadline** — tag it "placeholder, being replaced by INEGI/Banxico." When sources disagree, the Mexican figure wins the page; the discrepancy goes to the data-health page.

## Tier 1 — the Spine (next build wave)

| Domain | Headline indicators | Source | Cadence | Depth |
|---|---|---|---|---|
| Prices & Inflation | INPC headline + core; fuel *(live)* | INEGI; CRE | Biweekly; 4h | Nat + ~55 cities |
| Output & Activity | IGAE (monthly); PIB q/q; ITAEE | INEGI | Monthly/Qtrly | Nat + state |
| Jobs & Wages | ENOE unemployment + informality; IMSS jobs + wage | INEGI; IMSS | Monthly | State / **Municipio** |
| Trade | Exports, imports, balance (oil/non-oil) | INEGI balanza | Monthly | National |
| Investment / FDI | IED by state, sector, origin | Secretaría de Economía | Quarterly | State |
| Remittances & Migration | Inflows; migration intensity | Banxico; CONAPO | Monthly/Qtrly | **Municipio** |
| Security | Crime by type, per-100k | SESNSP | Monthly | **Municipio** |
| Money & FX *(live)* | Rate, USD/MXN, reserves, CETES/TIIE | Banxico | Daily | National |
| Demographics *(infrastructure)* | Population + projections | CONAPO; Censo | Annual | **Municipio** |
| Poverty & Social *(hero, live)* | Multidim. poverty; marginación | CONEVAL; CONAPO | 2–5 yr | **Municipio** |

## The 10 indicators to wire next

**6 of 10 ride on one INEGI fix — that's the single highest-leverage task.**
1. INPC headline + core (INEGI) — kills WB inflation placeholder
2. PIB quarterly (INEGI) — kills WB GDP placeholder
3. IGAE monthly (INEGI) — the "monthly GDP," the Pulse's heartbeat
4. ENOE unemployment + informality (INEGI, nat+state)
5. Balanza comercial / trade (INEGI, monthly)
6. ITAEE state activity (INEGI, quarterly) — the state growth map
7. IMSS jobs + wages by municipio — finish the WAF workaround *(try the bulk-CSV / datos.gob.mx route before fighting Incapsula)*
8. Remittances (Banxico national monthly + municipio quarterly)
9. SESNSP crime by municipio (monthly, plain CSV — cheapest connector)
10. IED by state/sector/origin (Secretaría de Economía)

**Non-optional dependency: CONAPO municipio population projections** — every Atlas layer needs a per-capita denominator (crime per 100k, remittances per capita, jobs per working-age adult). Raw counts on a choropleth just rank big municipios and quietly break the map's honesty.

## Tier 2 — Differentiate (wave after)
Housing & Construction (**SHF house-price index; INFONAVIT credits; ENEC** — Al asked for housing, first in line) · Consumption (EMEC retail, consumer confidence) · Business landscape (DENUE ~6M geolocated) · Expectations (Banxico forecaster survey).

## Tier 3 — Complete (backlog)
Public finance (SHCP/SAT) · Energy (Pemex production; CENACE hourly electricity — a great liveness signal) · Tourism (DATATUR) · Income deep-dive (ENIGH) · Export manufacturing (IMMEX).

## The granularity map (don't over-promise)

- **True municipio (the moat, 6 layers):** IMSS jobs+wages (monthly — the *only* monthly economic municipio series in Mexico), SESNSP crime (monthly), Banxico remittances (quarterly), CONEVAL poverty + CONAPO marginación (structural), population (annual), DENUE businesses (semi-annual).
- **State ceiling:** ITAEE/PIBE, ENOE, FDI, house prices, retail, exports-by-state.
- **National only:** trade balance, monetary, public finance, IGAE, expectations.
- **Never promise municipio GDP or municipio inflation** — nobody measures them; over-promising burns the source-honest brand.

## The endgame — the municipio profile card

Where the map leads is **not more choropleths** — it's the **profile card**. The registry currently contains 2,478 municipalities; 2,466 have a published CONEVAL 2020 poverty value. Click one → one card: **population · formal jobs + average wage · poverty rate · crime per 100k · remittances per capita · business count.** Six first-party facts, two refreshing monthly. *No one has assembled this — not INEGI, not Data México.* That card is what the wave-1 set is really building; the hero map defaults to the freshest layer (IMSS monthly) once it lands, poverty as the structural default until then.

## Completeness pass (Fable, 2026-07-08) — 3 missing domains + must-have gaps

A ruthless gap-critic pass found whole domains missing. **Most embarrassing omission: Credit & Financial System** — for a payments-led company, a "definitive" Mexico model blind to money/credit/inclusion fails in the first five minutes.

**Missing DOMAINS to add:**
| Domain | Headline indicators | First-party source | Depth |
|---|---|---|---|
| **Credit & Financial System** (MUST) | bank credit by segment, deposits, NPLs (IMOR), access points, financial inclusion; credit to private sector; SPEI/CoDi volumes | **CNBV** (Inclusión Financiera — municipio!) + Banxico | **Municipio** |
| **Agriculture & Food** | production by crop, area, yields (Cierre Agrícola); wholesale food prices (SNIIM) | SIAP/SADER; SNIIM | **Municipio** |
| **Financial Markets** | IPC stock index, Bonos M yield curve, CETES curve, ITCR real exchange rate | **Banxico SIE** (all of it — no BMV license) | National, daily |

**Must-have indicator gaps (patch into existing domains):** informality rate (INEGI ENOE — 55% of jobs); **public finance elevated to Tier 1** + SHCP municipio transfers (Ramo 28/33) & subnational debt (biggest fiscal story in 40 yrs); gross fixed investment IFB (INEGI — FDI ≠ investment); current account/BoP (Banxico); minimum wage (CONASAMI — doubled since 2019); producer prices INPP (INEGI); Censos Económicos 2024 (municipio value added); vehicle production RAIAVL (INEGI, not AMIA); water/drought (CONAGUA Monitor de Sequía — municipio, biweekly, live). Nice-to-have: business/mfg confidence ICE/IPM (INEGI, not private IMEF), IFT connectivity (municipio), CONSAR pensions.

**Source-honesty relabels (both institutions were abolished):**
- **CRE → CNE/Sener** (extinguished in 2024–25 energy reform; fuel feed lives on). *[fixed in code]*
- **CONEVAL → INEGI** (absorbed Nov 2024; historical=CONEVAL, new measurements=INEGI). *[label ok]*
- **Remittances by municipio: use Banxico directly** (quarterly since 2022) for flows; CONAPO only for migration-intensity.
- Not first-party (label as third-party if used): EMBI/CDS (JPMorgan/S&P), IMEF PMI (private), AMIA, industrial-park data (AMPIP).

## Biggest risks to the plan
- **IMSS stays blocked** (WAF + bulk route both fail) → the Atlas loses its monthly crown jewel; re-weight wave 1 toward DENUE for municipio density. *Resolve first.*
- **INEGI API stays flaky** → build the connector with INEGI's **BIE bulk download as a config-pinned fallback**, so one vendor-side ID change never dims six domains again.
