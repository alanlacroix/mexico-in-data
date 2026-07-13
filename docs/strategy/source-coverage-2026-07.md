# The Mexico Brief — source coverage & wiring plan

*Fable verdict, 2026-07-08. Input: 14-domain source hunt (~130 candidates). All recommendations honor the honesty laws: official/primary, dated, one tap from source, fail closed, POINT/link-out for anything copyrighted.*

---

## 1. What we already have vs. the universe

Honest read: our wired stack covers roughly **a quarter of the "understand Mexico" surface — the headline quarter**. Banxico gives us the peso, inflation, the policy rate, and the remittance total; Data Mexico gives trade and employment cuts; World Bank gives annual structure; CONEVAL/SESNSP/GDELT give poverty, homicides, and a news pulse. That is a competent macro dashboard. It is not yet a briefing on Mexico.

The blind spots, in order of how badly they hurt in 2026:

1. **Tariffs and US policy — the single biggest story about Mexico right now — are entirely dark.** We have zero coverage of what the US charges, threatens, or proclaims (Federal Register, USITC HTS, CBP), and zero US-side demand data (yields, US CPI, auto sales) that actually moves the peso.
2. **Politics is dark.** No Sheinbaum approval, no election results, no Congress supermajority flag, no reform pipeline, no democracy indices. An outsider's first three questions about Mexico are political; we can't answer any of them.
3. **Fiscal is dark.** No deficit, no debt-to-GDP, no oil revenue. SHCP isn't wired at all.
4. **Security is one number.** We have SESNSP homicides but not extortion, cargo theft, kidnapping, disappearances, or the INEGI death-certificate cross-check — and the *gap between counts* is itself the story.
5. **Energy, markets beyond the policy rate, migration, and everything subnational** (prices by city, wages by state, FDI by state) are missing. So is everything **forward-looking**: release calendars, consensus forecasts, population projections.

One structural finding changes the economics of closing these gaps: **most of the universe rides on four connectors, two of which we already own.** Banxico SIE (wired) and World Bank REST (wired) just need new series IDs; INEGI's Indicadores API and FRED are single tokens that each unlock dozens of series across 6+ domains. Breadth is cheaper than it looks.

---

## 2. Coverage map by domain

| # | Domain | Status | Highest-value wires |
|---|--------|--------|--------------------|
| 1 | Trade & tariffs | **PARTIAL** (Data Mexico volume; zero tariff coverage) | US Census Intl Trade API · USITC HTS reststop · Federal Register API |
| 2 | US-side data that moves Mexico | **MISSING** | FRED (one token, ~8 named series) · CFTC COT peso positioning · Treasury FiscalData |
| 3 | Political polling & governance | **MISSING** | Oraculus approval aggregate · Congress supermajority flag (Diputados/Senado) · WGI codes via existing World Bank connector |
| 4 | Security & rule of law | **PARTIAL** (homicides only) | SESNSP full incidencia file (same source, ~40 crime types × municipio) · INEGI EDR + ENSU/ENVIPE (via INEGI API) · UCDP/ACLED events |
| 5 | Energy & infrastructure | **MISSING** | CRE fuel-price XML feed · EIA API v2 (incl. Henry Hub) · CENACE demand + PML |
| 6 | Labor, wages & employment | **PARTIAL** (Data Mexico cubes, secondary) | IMSS Datos Abiertos · ENOE via INEGI API · CONASAMI minimum wage |
| 7 | Investment, FDI & capital flows | **PARTIAL** (pipe exists, series unpulled) | SE RNIE FDI (the nearshoring number) · Mbonos foreign holdings via existing Banxico connector · BEA MNE |
| 8 | Prices, consumer & fintech | **PARTIAL** (headline CPI only) | INPC basket detail + INPP + ENCO via INEGI API · CNBV inclusión financiera · ANTAD scrape |
| 9 | Macro & fiscal | **PARTIAL** (annual WB + some Banxico; no IGAE/PIB monthly, no fiscal) | INEGI BIE (IGAE, flash PIB) · SHCP Estadísticas Oportunas + SHRFSP · Banxico expectations survey (existing connector) |
| 10 | Markets & rates | **PARTIAL** (policy rate, FX) | Banxico SIE series adds: CETES curve, TIIE de Fondeo, Bonos M/Udibonos breakevens, mezcla crude · EMBI (WB GEM / BCRP) |
| 11 | Demographics & migration | **MISSING** | CBP SW border encounters · CONAPO projections · Census ACS + IDB (one key) |
| 12 | News & release calendars | **PARTIAL** (GDELT aggregate) | SIDOF DOF JSON API · generic RSS connector + outlet allowlist · INEGI/Banxico release calendars |
| 13 | Cost of living & competitiveness | **MISSING** (CONEVAL adjacent only) | INPC-by-city + ENSU via INEGI API · SHF housing price CSV · IMCO ICE (annual) |
| 14 | International benchmarks & complexity | **PARTIAL** (WB + Atlas wired) | IMF DataMapper (flat JSON) · WTO/WITS tariff benchmarks · OWID grapher CSVs |

**Duplicate flags honored:** Data Mexico trade cubes, WB macro, Banxico headline series, and Harvard Atlas are already wired — items above marked "via existing connector" are *series expansions*, not new plumbing. That's the cheapest breadth available and should be exploited first.

---

## 3. The wiring roadmap

Principle: **wire connectors, not sources.** Four platform connectors (Banxico-expand, INEGI, FRED, World Bank-expand) plus a generic RSS connector cover ~60% of the list below. Every connector fails closed and stamps source + date per figure.

### Wire now — easy, high value (target: next 2–3 weeks)

| # | Source | Unlocks | Persona | Email module | Wire | Why here |
|---|--------|---------|---------|--------------|------|----------|
| 1 | **INEGI Banco de Indicadores API** | INPC basket + by-city, IGAE, flash PIB, ENOE, ENSU/ENVIPE, EMIM/EMEC/ENEC, EDR homicides — one token | all | Prices · Real Economy · Security · Cities | easy | The single highest-leverage wire (see §5) |
| 2 | **Banxico SIE — series expansion** (existing token) | CETES curve, TIIE de Fondeo, Bonos M/Udibonos breakevens, mezcla crude, Mbonos foreign holdings, expectations survey, remittances by state, consumer CAT | investor, FX | Peso & Rates · Markets | easy | Near-zero marginal cost; verify IDs vs `catalogoSeries` |
| 3 | **FRED API** | UST 2y/10y, Fed funds, broad dollar index, US CPI, INDPRO, retail sales, US auto sales | investor, exporter | The US Pull (new module) | easy | One token = the entire US-demand/carry-trade driver set |
| 4 | **Federal Register API** | Every tariff proclamation/EO, dated, linkable, no auth | policy, tariff watcher | Politics: Tariff Watch | easy | The primary document behind every 2026 tariff headline; honesty-law gold |
| 5 | **USITC HTS reststop** | Actual US tariff rates incl. §232/§301/IEEPA Ch.99 overlays, JSON, no key | tariff watcher | Tariff Watch | easy | Pairs the rate with #4's proclamation and #6's volume |
| 6 | **US Census Intl Trade API** | US–MX bilateral trade by HS, state, port, monthly | trade analyst | Trade | easy | The bilateral volume workhorse; free key |
| 7 | **SESNSP full incidencia file** | Extortion, cargo theft, kidnapping, femicide × municipio (same source we already cite) | investor, operator | Security | easy | Turns one number into the crime surface investors price; scrape landing page for rotating SharePoint href |
| 8 | **World Bank — WGI codes + GEM EMBI** (existing connector) | 6 governance dimensions + sovereign spread | investor, policy | Politics: Governance · Markets | easy | Six indicator codes on wired plumbing |
| 9 | **SHCP Estadísticas Oportunas + SHRFSP** | Deficit, revenue, spending, debt-to-GDP — the whole fiscal story | investor, policy | Fiscal (new module) | medium | Biggest single MISSING theme; ship a CA-bundle fix for TLS |
| 10 | **IMSS Datos Abiertos** | Formal jobs + registered wages, monthly ~day 8, by state/sector | investor, economist | Real Economy | medium | The market-moving labor print; richest labor file in Mexico |
| 11 | **CRE fuel-price feed** | Station-level gas/diesel, daily, clean XML | consumer, ops | Prices | easy | Most politically sensitive consumer price; cleanest energy feed |
| 12 | **SIDOF (DOF) JSON API** | Official gazette daily: decrees, tariff law, official FX/UDIS | policy, legal | Politics: What Changed in Law | medium | Official structured "what's legally in force today" — rare and differentiated |
| 13 | **SE RNIE FDI** | FDI by country/sector/state, quarterly | investor, PE | Investment (new module) | medium | The number the entire nearshoring narrative rests on; re-pull full history each quarter (revisions) |
| 14 | **CONASAMI minimum wage** | General + border-zone minimum wage, history | policy, operator | Real Economy | easy | Trivial annual wire, high political salience |
| 15 | **IMF DataMapper** | Mexico vs Vietnam/Poland/Brazil on any WEO indicator, flat JSON | analyst | Benchmarks | easy | Peer comparison in one call, no SDMX pain |
| 16 | **Treasury FiscalData + CFTC COT** | Full US yield curve (no auth) + weekly peso spec positioning | FX, investor | Peso & Rates | easy | Two no-auth wires; COT is a genuinely differentiated sentiment signal |
| 17 | **SHF housing price index** | Official house prices by metro, quarterly CSV | relocator, PE | Cities | easy | Only official housing series; static CSV |

### Wire soon — medium effort, fills the politics/migration/energy spine

| # | Source | Unlocks | Persona | Email module | Wire | Why here |
|---|--------|---------|---------|--------------|------|----------|
| 18 | **Oraculus poll-of-polls** | Sheinbaum approval aggregate | all | Politics: Approval | medium | THE governance number; scrape — verify JSON payload, fail closed |
| 19 | **Congress composition + supermajority flag** (Diputados SITL + Senado) | Derived indicator: coalition vs 334/86 thresholds | investor, policy | Politics: Congress | medium | The one fact that explains the constitutional-reform wave |
| 20 | **INE/SICEE electoral results** | All results incl. 2025 judicial election, casilla-level | policy, journalist | Politics (event-driven) | medium | Hard outcomes behind the polling narrative |
| 21 | **Generic RSS connector + allowlist** (El Universal, La Jornada, Animal Político, Aristegui, Reforma portada, Mexico News Daily, El Economista) | Named-outlet POINT feed with ideological spread | all | Politics: News Points | medium | One connector, config-table outlets; strictly headline+link (Reforma especially) |
| 22 | **INEGI + Banxico release calendars** | Exact dates of next inflation/GDP/rate decision | investor | What to Watch | medium | Powers the forward-looking module both emails end on |
| 23 | **CBP SW Border Encounters (+ DHS OHSS)** | Monthly encounters by citizenship/sector | policy | Politics: Border | medium | The most watched US–MX political number; needs UA header |
| 24 | **EIA API v2 + CENACE demand/PML** | Henry Hub, Maya crude flows; grid demand, reserve margin, nodal prices | investor, energy | Energy (new module) | medium | The grid-capacity dealbreaker behind nearshoring |
| 25 | **El Financiero + Mitofsky approval scrapes; Banxico auction results; UN Comtrade; CONAPO projections; CNBV inclusión; BEA; UCDP** | Triangulation + depth layers | various | various | medium | Second-source redundancy once anchors are live |

### Later / hard — flagged risks

- **Paid/licensed, do not ingest without a decision:** fDi Markets (greenfield announcements — the one leading FDI indicator; revisit with budget), ISM PMI (headline-scrape only or use S&P Global proxy via FRED), Numbeo (paid + crowdsourced — label non-official if ever used), IMD/Mercer (annual point figures, link-out only), official real-time IPC/Mexbol (license S&P DJI vs. EOD-with-caveat — decide before any equity module).
- **Licensing flags:** Freedom House = non-commercial without permission (matters if the Brief ever monetizes); TI-CPI is CC BY-ND (show as-is, fine); ACLED commercial terms need verification — prefer UCDP as the redistributable conflict layer.
- **Scrape-fragile (wrap fail-closed, monitor):** Oraculus, Alto al Secuestro, SIAVI, ANTAD, WorldGovernmentBonds CDS, IME matrícula, Milenio (no confirmed feed), SIL legislative pipeline (JS-heavy — highest-value hard scrape; attempt after politics anchors are stable).
- **Heavy batch, not live:** ENOE/ENIGH microdata, Latinobarómetro, Penn World Table — annual/quarterly bake jobs, low urgency.

---

## 4. Email architecture: one email or two

**Verdict: two emails — but sequenced, sharing one pipeline.**

Alan's instinct is right, and here's the strategic defense:

**They are different jobs with different clocks.** "What Moved: Mexico" is a *diff against a calendar* — official series print on schedule, the email reports deltas. The politics/news job is a *diff against events* — proclamations, polls, decrees, border prints land irregularly and are interpreted, not just plotted. Folding them together produces one long email where each half dilutes the other, and forces political items to wait for the data cadence (a tariff proclamation on Tuesday shouldn't sit until the data email).

**They also have different risk profiles.** The data email is 100% official figures — the honesty laws run themselves. The politics email leans on POINT/link-out (pollsters, press) where the laws need the most discipline. Separating them quarantines the higher-curation-risk content and keeps the data product's credibility untouchable.

**And different growth roles.** Politics/tariffs is why outsiders care about Mexico in 2026 — it's the acquisition hook and the forwardable email. The data diff is the retention product. Two lists let readers self-select and give us two share surfaces instead of one.

**The second email, defined:**

- **Name:** *"The Mexico Brief: Power & Policy"* (working title; keeps brand, says the job).
- **Cadence:** weekly, Thursday — offset from "What Moved" on Monday, so the brand touches inboxes twice without either email doing both jobs.
- **Structure (every section a pre-baked JSON module, fail-closed — a stale feed drops its section, never fabricates):**
  1. **Approval** — Oraculus aggregate + delta, one line per house (El Financiero, Mitofsky) with date + link.
  2. **Congress & Reforms** — supermajority flag (seats vs 334/86), new DOF decrees that matter (SIDOF), SIL pipeline when wired.
  3. **Tariff & USMCA Watch** — new Federal Register documents touching Mexico (title, date, link) + any HTS rate change + CBP CSMS operational notes. Pure primary documents; zero editorializing needed.
  4. **The Border** — CBP encounters print (monthly, when fresh) + SEGOB repatriations.
  5. **News Points** — 5–8 headlines from the RSS allowlist + GDELT, headline/date/link only, ideological spread enforced by the allowlist config.
  6. **What to Watch** — next week's INEGI/Banxico/Fed release dates + scheduled political events.
- **Solo-operator constraint:** both emails render from the same static-JSON → template → approve pipeline. Alan's weekly labor is two approve-or-kill passes (~10 min each), never writing. If a week's approval feels heavy, the kill switch is per-email, not per-product.
- **Sequencing (the one discipline):** launch "What Moved" first on the wire-now sources; launch "Power & Policy" only when its four anchor feeds (Federal Register, SIDOF, Oraculus, calendars) have run clean for 2–3 weeks. Don't announce two products and ship one.

---

## 5. The single highest-leverage source to wire first

**The INEGI Banco de Indicadores API.**

(The literal *first action* is even cheaper — adding series IDs to the already-wired Banxico connector, #2 above, same afternoon. But the highest-leverage *new source* is INEGI, and it isn't close.)

Why:

1. **One free token, one connector pattern, six domains.** The same endpoint with swapped indicator codes delivers: detailed CPI baskets and inflation by city (prices), IGAE and flash GDP (macro), ENOE unemployment/informality (labor), ENSU/ENVIPE security perception and the EDR homicide cross-check (security), consumer confidence (sentiment), EMIM/EMEC/ENEC sector detail, and subnational wage/price series (cities/livability). The source hunt independently flagged it as the top wire in *four separate domains* — no other candidate came up more than twice.
2. **It's the primary source for Mexico's own numbers.** The Brief currently reads Mexico through Banxico and Washington-adjacent mirrors. INEGI is the national statistics office — for an honesty-law product about Mexico, not citing INEGI directly is a credibility hole in itself.
3. **It unlocks the differentiator: subnational.** Prices by city, feeling-unsafe by city, wages by state. No outsider-facing product shows this cleanly; every series is official, dated, and one tap from source.
4. **It de-risks everything downstream.** Once the token + parser exist, roughly a third of the "wire soon" list collapses into adding indicator codes to a config table — exactly the connectors-not-sources economics that makes "more sources" a sustainable moat for a solo operator rather than a maintenance trap.

Wire INEGI first, expand Banxico the same day, then FRED and the Federal Register — and within two weeks the Brief goes from a macro dashboard to the only free product that covers Mexico's economy, politics, and the US policy machine moving both.