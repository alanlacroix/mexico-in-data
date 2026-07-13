# SITE-SPEC — «México, en tiempo real» (the cockpit)

> **SUPERSEDED (2026-07-09, same day): [PRODUCT-BIBLE.md](PRODUCT-BIBLE.md) is now the locked
> product definition** — audience is the non-Mexican outsider, language is ENGLISH, structure
> is the twelve-question spine + three rooms. This spec's component work survives (tile grid,
> metric rows, stamp grammar, fail-closed rules, no-composite-score reasoning) and is
> referenced by the bible; where the two conflict, the bible wins.

**Fable, 2026-07-09. This REPLACES the municipio-first spec (2026-07-08).**
The last frame made "find your municipio" the hero, and since the only municipio layers are
crime and poverty, crime dominated the screen. Alan's verdict: *"I don't get who this is for…
the goal: a real-time view of what's going on in Mexico — foreign investment, economic growth,
political sentiment, housing, inflation, everything in one place."* He is right. The municipio
ficha survives as a feature, demoted to the bottom of the page. Everything already built
(connectors, map, search, ficha, health page) is reused — this is a **restructure, not a rebuild**.

DATA-MODEL.md stays the connector backlog. PIPELINE.md and the design law stay unchanged.

---

## 1 · The one job

**In 60 seconds, a serious reader knows the current state of Mexico — growth, prices, the
peso, money, jobs, investment, housing, the household pocket, politics, security — every
figure dated and tied to its official source.**

- The edge is **comprehensive + current + sourced + one place**. That is what ChatGPT and
  ten government tabs cannot do. The edge is explicitly **NOT municipio granularity** — that
  is a feature (§08 below), not the job.
- Two tests. *Alan test:* opens it with coffee → knows what moved in Mexico today and the
  latest reading of every major dial. *Stranger test:* one scroll → knows how Mexico is doing
  and can verify any number in one tap.
- Brand promise unchanged: **nada se inventa.** No number without a Source line, nothing
  shown fresher than it is, fail-closed when a feed dies.

**Identity:** masthead brand stays «México, **en datos**» (the site). Page identity becomes
the cockpit — `<title>`: *México, en tiempo real — el país completo, con fuentes.*
H1: **«México, en tiempo real.»** Dek (one line): *«Crecimiento, precios, peso, empleo,
inversión, política, seguridad — cada cifra oficial, con su fuente y su fecha. Nada se inventa.»*

---

## 2 · The GLANCE layer — first mobile viewport (~380×700)

No search box. No map. No single hero number. What greets you is **the board**:

1. **Masthead** (sticky, one line): brand left; right, live status from health.json:
   `● 14 fuentes · hace 2 h` → links to *Estado de los datos*.
2. **Compact hero** (≤150px total): mono eyebrow `DATOS OFICIALES · EN TIEMPO REAL`,
   the H1, the dek. Nothing else — the hero's job is to get out of the way of the board.
3. **La línea HOY** — one deterministic line, template-built from the data (never an LLM,
   never adjectives): `MIÉ 9 JUL · actualizado hoy: peso 18.57 ▼ · gasolina 23.68 · tasa 8.00`.
   Rule: list exactly the series with `fetchedAt` < 24h, value + direction vs previous
   observation. If none: `sin actualizaciones hoy · último cambio: ayer`.
   - If a saved municipio exists (localStorage), append one small link chip:
     `Tu municipio: Iztapalapa →` (scrolls to §08, opens the ficha). Personal hook kept,
     without hijacking the cockpit.
4. **El Tablero** — the vitals grid. **8 tiles, 2×4 on mobile, 4×2 desktop.** Each tile:
   mono label · serif value + unit · direction vs previous observation (▲/▼ **in ink**, with
   the comparison period: "vs ayer", "vs abril") · freshness stamp (§5). Tapping a tile
   scrolls to its dimension section.

The 8 launch tiles (all wired in the pipeline today):

| Tile | Series (data/series/) | Stamp at launch |
|---|---|---|
| Peso — MXN por USD | banxico-usdmxn-fix | `● HOY` |
| Inflación anual | banxico-inflacion | `MENSUAL · mayo` |
| Tasa Banxico | banxico-tasa-objetivo | `● HOY` |
| Crecimiento (PIB) | wb-gdp-usd → INEGI PIB/IGAE | `ANUAL · 2025` + chip `placeholder` |
| Gasolina regular | cre-gasolina-regular | `● HOY` (4h) |
| Remesas (mes) | banxico-remesas | `MENSUAL · mayo` |
| Desempleo | wb-unemployment → ENOE | `ANUAL · 2025` + chip `placeholder` → `MENSUAL` |
| Reservas int'l | banxico-reservas | `SEMANAL · 3 jul` |

Hard rules for viewport one: **no crime, no poverty, no map, no search.** Crime first
appears in §07. Tiles carry **no good/bad coloring** — arrows in ink (a peso move or a rate
hold is not universally "good"); green is reserved for the live stamp (§5); red is reserved
for data-health alarms only.

---

## 3 · The dimension sections — set, order, indicators

Numbered `section-head`s per the design system. Order logic: money → investment → jobs →
housing → the pocket → politics → security → the lens. **Economía leads** — it is the
densest live data and the core of "¿cómo va?".

Every indicator renders as one reusable **metric row** (adapted from the ficha's rows):
mono label · serif value · **sparkline** (last 12–24 observations from the series JSON —
history already exists: 366 pts tasa, 251 FIX, 52 reservas, 22 inflación; hide the spark
until a series has ≥8 points, e.g. fuel) · one-line **template verdict** (deterministic,
from the data: "El peso se ha fortalecido 3.1% en doce meses") · freshness stamp ·
collapsible `fuente y fecha` details (source link, license, vintage, consultado).

### 01 · Economía
| Indicator | Source | Cadence | Launch status |
|---|---|---|---|
| Crecimiento del PIB (t/t y anual) | INEGI 381016 | trimestral | WB anual + chip `placeholder` |
| IGAE — actividad mensual | INEGI | mensual | `EN CONSTRUCCIÓN` |
| Inflación anual (INPC); subyacente después | Banxico SP1 / INEGI | mensual | **live** |
| USD/MXN (FIX) | Banxico SF43718 | diaria | **live** |
| Tasa objetivo · Reservas (one compact row) | Banxico | diaria/semanal | **live** |

Close the section with one mono **context line** (replaces the old "país en cifras" list):
`Contexto: PIB $1.9 billones USD (2025) · $X per cápita · 131 M habitantes — anual, World Bank/INEGI.`

### 02 · Inversión y nearshoring
| Indicator | Source | Cadence | Launch status |
|---|---|---|---|
| IED — flujo trimestral | Secretaría de Economía | trimestral | `EN CONSTRUCCIÓN` |
| Exportaciones y balanza comercial | INEGI balanza | mensual | `EN CONSTRUCCIÓN` |
| IED por origen (top 3 países) | Secretaría de Economía | trimestral | backlog |

Ships day one as an honest scaffold; dek: *«Los datos oficiales de inversión son
trimestrales; los feeds se conectan este mes.»* **No invented "nearshoring index", no
news scraping, no announcement-counting.**

### 03 · Empleo
| Indicator | Source | Cadence | Launch status |
|---|---|---|---|
| Desempleo (ENOE) | INEGI | mensual | WB anual + chip `placeholder` |
| Informalidad laboral | INEGI ENOE | trimestral | `EN CONSTRUCCIÓN` |
| Puestos formales IMSS + salario promedio (nacional) | IMSS | mensual | `EN CONSTRUCCIÓN` — **national totals need no municipio crosswalk; ship before the Atlas layer** |

### 04 · Vivienda
| Indicator | Source | Cadence | Launch status |
|---|---|---|---|
| Índice SHF de precios de la vivienda | SHF | trimestral | `EN CONSTRUCCIÓN` |
| Créditos hipotecarios (INFONAVIT) | INFONAVIT | mensual | backlog |

Two cards max at launch. An honest thin section beats a fake thick one.

### 05 · Bienestar — el bolsillo
| Indicator | Source | Cadence | Launch status |
|---|---|---|---|
| Gasolina y diésel (promedio nacional) | CNE/Sener (ex-CRE) | cada 4h | **live** |
| Remesas familiares | Banxico | mensual | **live** |
| Salario mínimo | CONASAMI | anual | addable now (static official fact) |
| Pobreza nacional (%) | CONEVAL/INEGI | quinquenal | **live** — `SNAPSHOT · 2020` (the national figure, not the map) |

### 06 · Política
Opens with a permanent honesty banner (mono, one line):
*«No existe una serie oficial en tiempo real del ánimo político; esto son encuestas y
consensos, con su casa encuestadora y su fecha.»*

| Indicator | Source | Cadence | Launch status |
|---|---|---|---|
| Aprobación presidencial | pollster with stable public series (El Financiero / Mitofsky / Oraculus consensus) | `ENCUESTA · mensual` | `EN CONSTRUCCIÓN` until a citable stable feed is wired — never scrape aggregators |
| Expectativas económicas (PIB e inflación esperados, cierre de año) | Banxico Encuesta de Expectativas (SIE) | `ENCUESTA · mensual` | addable now via SIE token |
| Próxima elección federal/local | INE calendar | static fact | addable now |

### 07 · Seguridad — one card
**Exactly one card.** Incidencia delictiva nacional per 100k hab. (aggregate the existing
SESNSP municipio layer — a sum, not a new connector) + 12-month spark; homicidio doloso
split marked `EN CONSTRUCCIÓN` until the by-type connector lands. `MENSUAL` stamp, cifra
negra footnote (denuncias, not delitos ocurridos), link: **«ver tu municipio ↓»**. No map
here, no red styling, no lead position. This is the entire crime presence above §08.

### 08 · Tu municipio — la lupa
The existing search + geolocate + chips + choropleth + ficha move here **intact** (they
are built and good — they were just in the wrong place). Dek: *«El país entero, arriba;
tu esquina, aquí.»* Map default layer = **pobreza** (structural), delitos second; IMSS
becomes the default the month it lands. Deep links (`#m/09007`) and the saved-municipio
chip land here, not at the top.

**Footer:** método in one paragraph + `Estado de los datos →` + license/attribution line.

---

## 4 · Freshness grammar — one stamp component everywhere

Same component on tiles, metric rows, and cards. Vocabulary (mono, 10px, uppercase):

| Stamp | Meaning | Visual |
|---|---|---|
| `● HOY · 09:02` | cadence ≤ daily AND fresh within cadence | the **only** green on the page (green = live, nothing else) |
| `SEMANAL · 3 jul` / `MENSUAL · dato de mayo` / `TRIMESTRAL · T1 2026` / `ANUAL · 2025` | periodic official series, showing the **vintage** (the period the number describes) | ink mono, no dot |
| `ENCUESTA · jun · Mitofsky` | poll/consensus, named house | ink mono |
| `SNAPSHOT · 2020` | structural (censo, pobreza) | ink mono |
| `EN ESPERA` | feed wired but failing or stale > 2× its cadence (driven by health.json) — shows last-good value | **amber** |
| `EN CONSTRUCCIÓN` | not yet connected — dashed card, **never a number**, names source + cadence + ETA | dashed outline |

**Two-dates rule:** the stamp always shows the *vintage*; the collapsible details show
*consultado* (`fetchedAt`), license, and the live source URL. Nothing may read fresher than
its vintage — a monthly number updated today still says `MENSUAL · dato de mayo`.

---

## 5 · «¿Cómo va México?» — the composite question: **NO score**

Decision: **no single composite number at the top.** Three reasons:
1. The weights would be ours — an invented number crowning a site whose brand is *nada se
   inventa*. One editorial score would poison every sourced figure below it.
2. Mixed cadences (4h → 5 years) mean any composite is mostly stale while looking live —
   exactly the dishonesty the stamp system exists to prevent.
3. Bloomberg and the FT do not score countries; they show the board. **El Tablero + la
   línea HOY *are* the answer** — eight dials and what moved today.

The only summary allowed is deterministic (the HOY line). Backlog, not v1: INEGI's own
**Sistema de Indicadores Cíclicos** (coincident/leading index) is the one *official*
composite that exists — if we ever want a single economic dial, that is it, placed inside
§01 Economía as "ciclo económico (INEGI)", never as a site-wide score.

---

## 6 · Keep / do NOT add

**Keep (unchanged):** one static page + pre-baked JSON; no frameworks, no chart libraries,
no runtime LLM; fail-closed with last-good serving; mobile-first; McKinsey-MX law — white
paper, black ink, Fraunces display + Inter body + Plex Mono data (already in
mckinsey-mx.css; DESIGN-SYSTEM.md prose still says "Source Serif" — one-word doc fix);
**green #0a7d4d = live/now only**; red = alerts only; exhibit discipline with Source lines;
health page; the existing map/search/ficha code.

**Do NOT add:** a composite score (§5) · runtime chat/LLM · news headlines · country
comparisons (v2, one WB call, not now) · accounts · dark mode (white paper is the brand) ·
auto-refresh timers/websockets (fresh JSON per visit is honest enough) · notifications ·
English version · PDF export · a second page · state-level everything (only where a source
is state-native, later).

---

## 7 · Build order (Opus) + acceptance

1. **Restructure index.html to this frame** (~1 day): tablero ← grow the existing HOY
   ticker; metric rows ← adapt the ficha rows; sections 01–07 from the 9 live series +
   `EN CONSTRUCCIÓN` cards; move search/map/ficha to §08 unchanged; update README's
   index.html line.
2. **Fix the INEGI connector** (INPC subyacente, PIB, IGAE, ENOE) — kills both
   `placeholder` chips on the board. (health.json shows HTTP 400s — likely the BIE/BISE
   path params; DATA-MODEL.md already flags this as the single highest-leverage task.)
3. **Cheap honest wins:** Banxico Encuesta de Expectativas · CONASAMI salario mínimo ·
   INE election date · SESNSP national aggregate (sum the existing layer).
4. **New connectors:** SHF vivienda · SE IED · IMSS national · pollster approval series.

**Acceptance:** first mobile viewport = masthead + hero + HOY line + ≥4 tiles of the
tablero, zero crime/poverty/map/search · every displayed number has stamp + Source ·
zero green outside `● HOY` stamps and links · crime appears exactly twice on the page
(§07 card, §08 layer) · placeholders show no fabricated numbers · with any fetch failing,
affected cells render `EN ESPERA`/`EN CONSTRUCCIÓN` (fail-closed, page still loads) ·
Lighthouse mobile ≥ 90.
