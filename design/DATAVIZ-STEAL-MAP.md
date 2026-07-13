# Dataviz steal-map — who to copy for the Mexico cockpit

**What this is.** The best-in-class economic-data platforms in the world, and the *exact* patterns to copy and adapt for this site. Built from a fact-checked research pass (24 sources fetched, claims adversarially verified — 24 confirmed, 1 killed). Every recommendation is tied to a named source and translated into *our* constraints: **static site, hand-built inline-SVG charts, no chart libraries, McKinsey-MX house style, no runtime LLM.**

Read [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) first — that's the visual law. This doc is *what to build on top of it* and *who proves it works*.

---

## TL;DR — the four steals, in priority order

1. **Structure → clone Data México's profile-template pattern.** One reusable "ficha" template per geography, auto-filled by data. This is our municipio drill-down. → *Layer 0.*
2. **Engine → build one small reusable chart component (OWID-Grapher-lite).** Same dataset renders as chart ↔ map ↔ table via a toggle; a "facet" mode splits crowded lines into small multiples. Vanilla, no library. → *Layer 2.*
3. **Skin → we already have this** (McKinsey-MX = Urban-Institute-grade color discipline). Lock the encoding rules below into the CSS. → *Layer 1.*
4. **Feel → make the hero pages explorable.** A slider/lever the reader pulls and the numbers update live (Bret Victor). We already prototyped this in "The Mexico Machine." → *Layer 3.*

---

## Layer 0 — The direct template: **Data México** (copy this first)

Secretaría de Economía + INEGI, built on the **Datawheel** engine (same team behind Data USA). This is *our app, already shipped for Mexico*. It is the single most important thing to study.

**What to steal:**

| Pattern | What they do | How we adapt it |
|---|---|---|
| **Profile-template** | ~13k auto-generated profiles (one per geography, industry, occupation, product), each from **one reusable template** — you design the template once, data fills every page. | Our municipio "ficha": one template, ~2,478 municipios fill it. We already have the CONEVAL choropleth + crosswalks (`pipeline/crosswalks/`). Build **one** `municipio.html` template, not 2,478 pages. |
| **Geographic drill-down** | Nation → state → municipality. Monterrey, Guadalajara each have a real profile. | Nation → estado → municipio. We have `municipios.cvegeo.json` + topojson. The choropleth IS the navigation. |
| **In-place reframing toggles** | On the chart itself: linear/log, **per-capita** ("rate per 100k"), rolling-mean smoothing, rural/urban, sex split. Reader reframes without leaving the chart. | Bake these into our chart component as buttons: **absolute ↔ per-capita**, **linear ↔ log**, **raw ↔ trend**. Per-capita is the #1 benchmarking unlock. |
| **Chart library breadth** | Treemaps, population pyramids, geomaps, matrix/heatmaps, line + bar — all from the same data. | We don't need all of them. Priority set: **choropleth, line, bar, ranked bar (for high-vs-low), population pyramid** (demographics is a cockpit dimension). |

**Why it works:** the template pattern means *coverage scales for free*. You never hand-build a city; you improve the template and every city improves. That is exactly the leverage a one-person live-cockpit needs.

**Reinforcing official sources (same patterns, worth a look):**
- **INEGI Banco de Indicadores** — national/state/municipal drill-down + a **"Comparar áreas geográficas"** multi-region compare tool. That compare tool *is* our high-vs-low benchmarking UI. Copy it.
- **INEGI dashboard** — toggles between statistical treatments of one series (original / seasonally-adjusted / trend / cycle). Steal the **raw-vs-smoothed toggle** for noisy monthly series (IMSS employment, inflation).
- **Banxico Gráficas de Coyuntura** — each indicator is an interactive chart; indicators grouped into 7 thematic categories. Steal the **topic taxonomy** as our cockpit's section spine (FX, inflation, production, trade, wages/public finance…).
- **FRED Maps** (was "GeoFRED", renamed 2022) — same economic series as a choropleth at state / metro / county tiers. Proves the multi-tier-choropleth pattern at national scale.

### Atlas of Economic Complexity (Harvard Growth Lab) — the *legibility* template

Reviewed live at [atlas.hks.harvard.edu/countries/484](https://atlas.hks.harvard.edu/countries/484/product-table) (Mexico). If Data México is the **skeleton** (coverage + drill-down), the Atlas is the **skin that makes dense economic data feel easy**. It's a two-panel country profile: auto-written narrative + strategy selector on the left, a sortable "Top 50 Products" opportunity table on the right, with view-switcher menus (Economic Structure → export treemap / complexity; Market Dynamics → growth views). Two patterns here are the highest-value craft steals in this whole doc:

**🏆 Prize 1 — Rating glyphs instead of raw numbers.** The three hardest columns ("Nearby" Distance, Opportunity Gain, Product Complexity) render as **5-diamond fills (◆◆◇◇◇)**, not decimals. It turns three intimidating indices into a scannable at-a-glance rating a non-economist reads in seconds. → *Bake glyph-rendering into `Exhibit()` from day one.* In a municipio ficha: **poverty severity ●●●○○ · job growth ●●●●○ · safety ●●○○○.** A citizen reads their town in one glance, zero decimals.

**🏆 Prize 2 — Auto-written narrative from the data.** The left panel opens: *"Given its current exports, some of the sectors with high potential for new diversification in Mexico are: Industrial Machinery and Electrical machinery…"* — a sentence **templated from the top-N rows: deterministic, no LLM, always current, honest.** The "compile text from data" pattern done right — and it fits our no-runtime-LLM rule exactly. → Every ficha opens with: *"Comparado con el promedio nacional, [Municipio] destaca en X y va rezagado en Y."* Generated at build time, footnoted.

**Three more to copy:**
- **One categorical color spine, everywhere** — sector = colored left-border on each row, matched to a legend, *same palette across treemap + product space + table.* One palette, every viz.
- **Strategy-lens reframe** (Light Touch / Balanced / Strong Push) — a toggle that re-ranks the same data by intent. → our absolute ↔ per-capita ↔ vs-national.
- **Definitions baked into the header** — sortable columns whose dotted-underline labels reveal each metric's definition on hover. Teaches the jargon inline. Steal for any index we show.

**Where it's weak (don't copy):** expert-first framing ("Opportunity Gain" assumes you know the term — lead plainer); **~11-sector legend is over the <7 hue cap** and labels are clipped ("SERVI…", "TEXTI…") — a real bug; desktop-only two-panel layout; and its scope is *only* trade/export-complexity — that's **one tile** of our cockpit, so copy its patterns broadly but treat its content as a single section. (Complexity data is Harvard Growth Lab's and citable if we ever build that tile for real.)

---

## Layer 1 — Chart craft (visual design)

We already have McKinsey-MX. These two sources *validate and sharpen* it — treat them as the rulebook to encode.

### FT Visual Vocabulary — the chart-choice framework
FT's Visual Journalism team ships a free poster + [GitHub repo](https://github.com/Financial-Times/chart-doctor) sorting every chart into **9 intent categories**. Pick the chart from the *communication goal*, not habit:

| Intent | Use when you want to show… | Our go-to form |
|---|---|---|
| **Deviation** | +/- from a baseline | diverging bar (vs national avg) |
| **Correlation** | two variables relate | scatter / connected scatter |
| **Ranking** | order matters more than value | **ranked bar** (high-vs-low cities) |
| **Distribution** | spread / frequency | histogram, dot strip |
| **Change over time** | trend | line, area |
| **Part-to-whole** | composition | stacked bar, treemap |
| **Magnitude** | size comparison | bar; **choropleth** for geo |
| **Spatial** | geography matters | choropleth, symbol map |
| **Flow** | movement between states | sankey (remittances, migration) |

**Rule:** before building any chart, name its intent. It kills the "which chart?" dithering and stops us defaulting to lines for everything.

### Urban Institute style guide — the color/encoding law
Their [public style guide](https://urbaninstitute.github.io/graphics-styleguide/) is the gold standard for a *systematic* palette. Our McKinsey-MX already mirrors it (one primary + sparing accents). Encode these as hard rules:

- **Categorical:** distinct hues, **cap at <7 categories**. Beyond that, group or facet.
- **Sequential (magnitude choropleth):** single-hue light→dark ramp. → **our green ramp** (`#e7f2ec` → `#0a7d4d`) for poverty/employment intensity.
- **Diverging (change / vs-baseline):** neutral white/gray center, dark at both ends. → **green ↔ red through white** for "above/below national average." This is on-brand *and* correct.
- **Accent restraint:** reserve a highlight color for the *one* series that carries the message; gray the rest. (McKinsey-MX already says this — Urban proves it.)
- **Maps:** blue/green **sequential** for magnitude, **diverging** for change; **Albers Equal Area** for static/print maps, **Mercator** only for zoomable tile maps. (Our topojson should render Albers-style for the static choropleth.)

### The Economist move (craft, applied)
- **Title = the insight, not the topic.** "Mexico is a high-carry, low-growth credit," not "Interest rates." (Already our Exhibit law — the Economist is the proof.)
- **~80% of charts are simple** line/bar/scatter. Resist novelty. Reach for a fancy form only when intent demands it.
- **Highlight one line, gray the rest.** Visual hierarchy through color restraint.

*(Deeper Economist / NYT / FT / Gapminder craft techniques → Layer 4 below, landing from a second research pass.)*

---

## Layer 2 — Interaction: one reusable chart engine (OWID-Grapher-lite)

**Our World in Data's Grapher** is the engineering pattern to copy: *one* client-side library powers **almost every chart on the site**, config-driven from a database (not per-chart code). The reader gets:

- **Chart ↔ Map ↔ Table** — the same dataset, three views, switched by buttons.
- **Faceting toggle** — splits a crowded multi-line chart into **small multiples** instead of spaghetti.
- Consistent chrome (title, subtitle, source line, download) on every chart for free.

**How we adapt it (critical — we can't ship a heavy JS lib):**

Build a **small vanilla-JS component** — call it `Exhibit()` — that takes a config object `{ title, units, source, data, view, toggles }` and renders inline SVG in the McKinsey-MX Exhibit shell. One component, every chart on the site flows through it. Benefits:
- Every chart is automatically an Exhibit (number, conclusion-title, units, footnotes, Source line) — the honesty system is enforced *in code*.
- View toggles (chart/map/table) and reframe toggles (per-capita/log/trend) live in the component, so they exist everywhere at once.
- No dependency, self-contained → still works inside a Claude Artifact CSP (matches how the three published prototypes were built).
- Data comes from our static JSON (`data/series/`, `data/layers/`) — no runtime LLM, no server.

This is the highest-leverage build on the list. **Do this and Layer 0's template pattern becomes trivial** (a ficha is just a stack of `Exhibit()` calls).

---

## Layer 3 — Feel: explorable explanations (Bret Victor)

**[Explorable Explanations](https://worrydream.com/ExplorableExplanations/)** (Bret Victor, 2011) — the canonical pattern. Embed the *model inline in the prose*: the reader drags a slider / changes an assumption and the numbers + chart update live. Text stops being "information to consume" and becomes "an environment to think in." The "reactive document" integrates spreadsheet-like models into authored text so readers explore scenarios and see tradeoffs.

**We already did this** — "The Mexico Machine" (interactive causal model, pull-levers) is exactly this pattern. Formalize it:
- **Hero pages get one lever.** Not every chart — the flagship story per section. E.g. "nearshoring: move the FDI slider, watch jobs + peso respond."
- Keep it **honest**: levers driven by our stated causal coefficients, footnoted. Never fake precision.
- Vanilla JS, client-side math only (no LLM at runtime) — same as the Machine prototype.

**Scrollytelling** (NYT/Bloomberg house style) is the lighter-weight cousin: reveal one insight per scroll step, sync chart state to scroll position, reduce cognitive load by not showing everything at once. Good for the *narrative* briefings; the lever is for the *model*.

---

## Layer 3.5 — Storytelling structure (headline → detail)

How to sequence a page so a reader goes from the big number to the deep dive:

- **"Water Tower" structure** — open **inverted-pyramid** (key number + verdict up top) then transition to **stack-of-blocks** (modular deep-dive sections). Fuses the two dominant real-world structures (Inverted Pyramid ~34%, Stack of Blocks ~30% of data stories). *This is literally the McKinsey takeaway-first exhibit stack — the research names it.*
- **CHI 2024 "Design Patterns for Data-Driven News Articles"** — treats headline, narrative, chart **technique, annotation, caption, interactivity** as *separable* design decisions (72 patterns, 11 groups; 5 article types from Quick Update → In-depth Investigation). Use it as a **checklist** when composing a municipio ficha or a briefing: did we set the headline, the lead, the annotation layer, the caption, the interaction — each deliberately?
- **Article-type ladder** for our content: **Quick Update** (pulse strip) → **Briefing** (a dimension's page) → **Investigation** (a deep narrative w/ lever). Match production effort to type.

*Caveat: Water Tower & the CHI patterns are proposed academic taxonomies from single-sample studies (118 and 162 articles). Good scaffolding, not law.*

---

## Layer 4 — Craft techniques from the masters (Economist / NYT / FT / Gapminder / Numbeo)

Verified second pass. Concrete, copy-paste-level techniques for the chart layer.

### The Economist — "one chart, one message" (2017 Visual Style Guide v1.2)
- On compact tiles: **strip gridlines and per-point value labels** — show overall shape, not every value. The **title carries the takeaway.**
- **Cap categories at ~4.** Above 4, abandon pie/doughnut for stacked bar; >4 lines = "have a rethink."
- **Color by data meaning, not decoration:** single-hue **light→dark for ordered/chronological** series; reuse a hue only to reinforce a *real* group. (Matches our McKinsey-MX restraint + Urban's ramp rule.)

### FT Visual Vocabulary — the chart picker (in practice)
Same 9-category framework as Layer 1, now as an **implementation directive:** build a "what do I want to say → which chart" picker in the chart layer keyed to the 9 relationships (50+ chart types map in). This is literally the API for `Exhibit()`'s `intent` field.

### NYT / The Upshot — engagement + scrollytelling
- **Scrollytelling via Scrollama** — dependency-free, uses `IntersectionObserver` (not scroll listeners → main-thread scripting drops ~49%→23%). **Sticky-graphic pattern:** chart pins with `position:sticky` while text steps scroll past; fire chart-state transitions from `onStepEnter` keyed to step index (`offset` default 0.5). *This is our narrative-briefing engine — vanilla, tiny, CSP-safe.*
- **"You Draw It"** — reader draws a curve on a blank chart to predict a relationship, *then* the true data reveals against their line. High engagement. → e.g. "draw what you think happened to the peso / to poverty" then reveal. Capture an SVG/canvas path, overlay the real series.
- **d3-annotation** (Susie Lu) — first-class direct on-chart labeling; presets emit copy-paste code. Layer annotations as their own group so labels sit on the plot, not in a legend. *(Targets D3 v4 — adapt, or hand-roll the same idea in our vanilla SVG.)*

### FT / John Burn-Murdoch — trajectory charts
Log-scale trajectory charts + small multiples, indexed to a common start point (the COVID-curve house style). *(Principles confirmed; exact axis/breakpoint specs are an open question — see below.)* Use log scale when the story is **rate of change / multiplicative growth**; index series to a shared t=0 for honest cross-entity comparison.

### Bloomberg Graphics — takeaway + layered maps
- **Every graphic ships with ≥1 explicit takeaway** (drives sharing). Pair each map/chart with its one sentence.
- **Layered maps:** overlay multiple datasets on the same geography as **toggleable layers** (their D.C. Metro piece stacked traffic + bike-share + surge pricing). → our choropleth as a **base map with toggleable indicator layers** (poverty / employment / fuel price), one legend at a time.

### Gapminder / Hans Rosling — animation reveals change
The World Health Chart: **bubble chart, wealth (x) × outcome (y), bubble size = population**, with a **play button + time slider** animating 200 years; optional **motion trails** show each country's trajectory. → for us: estados as bubbles (e.g. GDP-per-capita × life-expectancy or × poverty, size = population), press play across years. Animation itself *is* the insight. Use sparingly — one hero per section.

### Numbeo / NerdWallet / Mappr — the high-vs-low compare UI (copy this for benchmarking)
The exact pattern for Alan's recurring "benchmarks, not bare numbers" ask:
- **Two-entity input flow:** current city · comparison city · (income/spend + currency) · one **Calculate**.
- **Lead with ONE directional headline** — *"Monterrey is 23% more expensive than Oaxaca"* / "equivalent income needed." The big normalized number first.
- **Category breakdown as secondary drill-down** (rent, groceries, transport…) *below the fold.*
- **Index-normalize** to a reference (Numbeo = NYC:100). → normalize municipios to **national avg = 100**; headline the delta, table the components. Mappr does true side-by-side + instant swap — copy the swap button.

---

## The build order (what to actually do)

1. **`Exhibit()` component** (Layer 2) — the reusable inline-SVG chart engine in the Exhibit shell, with chart/map/table + per-capita/log/trend toggles, an `intent` field (FT picker) → chart type, **glyph-rendering** (Atlas diamonds/dots for ordinal metrics), and a **templated-caption slot** (Atlas auto-narrative). Everything else rides on this.
2. **Municipio ficha template** (Layer 0) — one template, filled by our CONEVAL/crosswalk data, reached by clicking the choropleth. Opens with the auto-written headline sentence + a glyph row.
3. **Compare tool** (Layer 0 / Numbeo) — two-entity flow: pick municipios/estados, **lead with one directional headline** (delta vs national=100), category table below, swap button. The benchmarking Alan keeps asking for.
4. **One lever per hero section** (Layer 3) — formalize the Mexico Machine pattern into the section template.
5. **Encode the color/encoding rules** (Layer 1) into `mckinsey-mx.css` as documented ramp variables (sequential green ramp, diverging green↔red).

---

## Sources (verified)

- FT Visual Vocabulary — https://github.com/Financial-Times/chart-doctor/blob/main/visual-vocabulary/README.md *(primary)*
- Urban Institute style guide — https://urbaninstitute.github.io/graphics-styleguide/ *(primary)*
- OWID redesign writeup — https://ourworldindata.org/redesigning-our-interactive-data-visualizations *(primary)*
- OWID Grapher — https://github.com/owid/owid-grapher *(primary)*
- Bret Victor, Explorable Explanations — https://worrydream.com/ExplorableExplanations/ *(primary)*
- Data México — https://www.economia.gob.mx/datamexico/en *(primary)* · Monterrey profile — /en/profile/geo/monterrey
- Datawheel data platforms — https://www.datawheel.us/data-platforms *(primary)*
- INEGI Banco de Indicadores — https://www.inegi.org.mx/app/indicadores/ *(primary)*
- Banxico Gráficas de Coyuntura — https://www.banxico.org.mx/estadisticas/graficas-coyuntura-indicadore.html *(primary)*
- FRED / FRED Maps — https://fred.stlouisfed.org/ *(secondary; "GeoFRED" renamed to "FRED Maps" 2022)*
- Water Tower structure (data-journalism narrative taxonomy) — https://www.academia.edu/84989598/ *(primary; single-sample study)*
- CHI 2024 Design Patterns for Data-Driven News Articles — https://dl.acm.org/doi/10.1145/3613904.3641916 *(primary; single-sample study)*
- Atlas of Economic Complexity, Mexico — https://atlas.hks.harvard.edu/countries/484 *(primary; reviewed live)*
- The Economist Visual Style Guide v1.2 (2017) — Economist-CHARTstyleguide_20170505.pdf *(primary)*
- Scrollama — https://github.com/russellsamora/scrollama · The Pudding intro — https://pudding.cool/process/introducing-scrollama/ *(primary)*
- NYT "You Draw It" — via rethinkingvis.com/visualizations/264 *(secondary; primary NYT piece exists)*
- d3-annotation (Susie Lu) — https://www.susielu.com/data-viz/d3-annotation-design-and-modes *(primary; targets D3 v4)*
- Bloomberg Graphics team — https://digiday.com/media/bloomberg-graphics-team/ *(secondary; some descriptors embellished)*
- Gapminder World Health Chart — https://www.gapminder.org/fw/world-health-chart/ *(primary)*
- Numbeo / NerdWallet / Mappr cost-of-living compare — numbeo.com/cost-of-living/comparison.jsp · nerdwallet.com/cost-of-living-calculator · mappr.co/cost-of-living/ *(verified live, Jul 2026)*

**Open (named but not yet pinned):** exact mobile/responsive chart-sizing specs (Economist/FT breakpoints, aspect ratios, axis-label thinning); FT/Burn-Murdoch log-trajectory axis conventions; NYT animated-transition easing/duration/object-constancy; Gapminder "Dollar Street" photo-comparison UI. Worth a focused pass before building the mobile chart rules.

*Killed in verification (do not use): the claim that Datawrapper choropleths default to a green-to-blue sequential palette (refuted 1-2).*
