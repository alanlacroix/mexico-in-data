# PRODUCT BIBLE — «Mexico, in data»

**Fable, 2026-07-09. This is the locked product definition. Everything else builds to this.**

Precedence: this document **supersedes SITE-SPEC.md** (the Spanish cockpit frame) wherever
they conflict — most importantly on **audience and language**. It inherits, unchanged: the
McKinsey-MX design law (`design/DESIGN-SYSTEM.md`), the pipeline architecture (`PIPELINE.md`),
the connector backlog (`DATA-MODEL.md`), the hosting model (`HOSTING.md`), and the brand
promise — **nothing is invented**. SITE-SPEC.md's component work (tile grid, metric rows,
freshness stamps, fail-closed rendering) carries forward intact; only the frame around it
changes.

The goal, in Alan's words: *"A birdseye view of what is going on in Mexico — economic,
political, social — both lagging, current AND forward-looking, aggregating multiple data
sources for a dynamic view, including a causal model I am able to use."*

---

## 1 · The job

**Who it is for:** a smart outsider who is serious about Mexico but starts near zero — an
investor sizing exposure, a journalist needing grounding, an operator weighing nearshoring,
someone considering moving there, a curious generalist. **Not** assumed Mexican, **not**
assumed to know what INEGI is. Language: **English.** (A Spanish edition is v3 — a
translation of this product, not a different product.)

**The one job:** *replace a week of scattered Googling with one sourced, always-current
briefing on Mexico — what happened, what is true today, and where it is plausibly heading.*

**The five-minute test.** A person with zero Mexico context closes the tab knowing:

1. **Scale** — ~131M people, a ~$1.9T economy (top-15 world), the United States' largest
   trading partner; a manufacturing-export economy hardwired to the US.
2. **Now** — the actual current readings: growth slow, inflation vs Banxico's 3% target,
   the policy rate, the peso, remittances, FDI — each with a date and a source.
3. **Direction** — what named forecasters expect for the next 12–24 months, which levers
   matter (US demand, tariffs, the Fed, oil), and where the genuine uncertainties sit
   (USMCA review, security, institutional change).
4. **Trust** — that every figure on the page is official, dated, and one tap from its source.

The edge over ChatGPT and ten government tabs: **comprehensive + current + sourced + taught
+ in one place.** The moat under it: the municipio atlas nobody else assembles.

**Identity (locked):** masthead brand **MEXICO, IN DATA**. H1: **"Mexico, right now."**
Dek: *"What happened, what's true today, and where it's heading — every figure official,
sourced, and dated. Nothing invented."* `<title>`: *Mexico, in data — a sourced, live
briefing on the whole country.*

---

## 2 · The twelve questions — the spine

The product is not organized by dataset, domain, or horizon. It is organized by **the
questions an outsider actually brings.** Every section of the site is titled by the question
it answers; a section that answers no named question does not ship.

The full brainstorm (what does an investor / journalist / relocator ask?) reduces to twelve,
prioritized. E/P/S = economic/political/social; L/C/F = lagging/current/forward.

| # | The question | Domain | Horizon | Becomes |
|---|---|---|---|---|
| Q1 | **What kind of country is Mexico?** | E+P+S | L | Orientation strip + primer (§6) |
| Q2 | **How is Mexico doing right now?** | E+S | C | The Board — DataMapper-style tile grid |
| Q3 | **Is Mexico's money sound?** (peso, inflation, Banxico, reserves) | E | L+C+F | Section 03 |
| Q4 | **Is the economy growing — and on whom does it depend?** (GDP, IGAE, trade, the US tether) | E | L+C+F | Section 04 |
| Q5 | **Is the nearshoring story real?** (FDI flows vs headlines) | E | L+C | Section 05 |
| Q6 | **Are ordinary Mexicans getting better off?** (poverty, real wages, remittances, informality) | S | L+C | Section 06 |
| Q7 | **Who governs, and is it stable?** (system, Sheinbaum, approval, elections) | P | L+C | Section 07 |
| Q8 | **Where does the US relationship stand?** (USMCA, tariffs, border) | P+E | C+F | Section 08 |
| Q9 | **How dangerous is Mexico, really — and where?** | S | L+C | Section 09 |
| Q10 | **Where is Mexico heading?** (named, dated forecasts) | E | F | The Outlook table |
| Q11 | **What happens if…?** (tariffs, Fed, oil — pull the lever) | E+P | F | The Machine (causal model) |
| Q12 | **What happened this week?** | E+P+S | C | The Wire (news feed) |

Plus the drill-down that is a *room*, not a spine section: **"What is it like in one specific
place?"** → the Atlas (map + search + municipio profile), teased from Q9 and the footer.

Structure rule: **questions lead; horizons run inside each question.** Q3–Q9 each render
their strata in order — lagging exhibit(s) → current metric rows → one forward line. Three
horizon-pure surfaces bookend them: **the Board** (pure now, Q2), **the Outlook** (pure
forward, Q10), **the Machine** (pure what-if, Q11).

---

## 3 · The honest matrix — three horizons × three domains

What each cell truly contains, and how thin cells are handled without faking.

|  | **Lagging** (history / structure) | **Current** (live) | **Forward** |
|---|---|---|---|
| **Economic** | Long official series (GDP back 66 yrs, inflation incl. the 1980s, peso, FDI decade) + the briefing's structural exhibits | The live feeds: Banxico daily (FIX, rate, reserves), INPC monthly, fuel 4-hourly, IGAE, remittances, FDI quarterly | **Rich.** Banxico's own Survey of Expectations (official, monthly, ~40 named forecasting shops) + IMF WEO + OECD — a sourced forecast table with the spread shown. The Machine for what-ifs. |
| **Political** | Written primer: how the system works, the Morena era 2018→, the 2024 judicial reform, the USMCA timeline — narrative, dated, cited | Presidential approval (**POLL** stamp: named house + field date), INE election calendar (fact), USMCA status card (dated fact), The Wire's politics tag | **No forecast feed exists — we say so.** Forward = the fixed calendar (election dates, USMCA review milestones, budget dates) + named scenarios in the Machine. Never a predicted approval number. |
| **Social** | Poverty 2016→2024 (2-yr cadence, drawn as sparse dots, never smoothed), census demographics, homicide long trend (INEGI mortality) | SESNSP crime monthly, remittances monthly, consumer confidence monthly (INEGI/Banxico — official), IMSS formal wage when landed | **Thinnest cell.** The one honest forecast: CONAPO population projections (official, to 2070). Everything else: a plain "no honest forecast exists for this" note. Model outputs labeled MODEL. |

**The thin-cell law.** Every cell on the site renders in exactly one of six states, worn on
its sleeve via the stamp grammar (English version of SITE-SPEC §4):

| Stamp | Meaning | Visual |
|---|---|---|
| `● LIVE · 09:02` | cadence ≤ daily and fresh | the **only** green on the page |
| `WEEKLY · Jul 3` / `MONTHLY · May data` / `QUARTERLY · Q1 2026` / `ANNUAL · 2025` | official periodic series, showing the **vintage** | ink mono |
| `POLL · Jun · Mitofsky` | survey, named house, field date | ink mono |
| `SNAPSHOT · 2020` | structural (census, poverty) | ink mono |
| `MODEL` | output of our causal model — illustrative, never data | ink mono + dashed frame |
| `STALE` (amber) / `NOT YET WIRED` (dashed, no number, names source + cadence + ETA) | feed failing / not connected | fail-closed |

Two-dates rule unchanged: the stamp shows the vintage; the collapsible source line shows
*retrieved* date, license, and the live source URL. A monthly number fetched today still
says `MONTHLY · May data`.

**What "forward" honestly is (locked):** (a) *other people's* dated, named forecasts —
Banxico's expectations survey, IMF, OECD; (b) *fixed calendar facts* — elections, review
deadlines; (c) *our teaching model*, always stamped MODEL and visually distinct. We never
publish our own numeric forecast as if it were data. **No composite "Mexico score"** —
SITE-SPEC §5's reasoning stands in full: invented weights would poison a site whose brand
is "nothing invented." The Board *is* the answer to "how is Mexico doing."

---

## 4 · The causal model — the what-if engine

**Role (locked):** the Machine is the product's forward engine and its best teaching device
— not a separate toy. It lives in two places:

1. **Embedded on the spine as Q11** — three to five **explicit assumptions**, not event
   predictions: *"Additional 20% tariff"* · *"Fed cuts 2pp"* · *"US growth falls 2pp"*.
   Each preset shows the lever, the **drawn transmission path** (tariffs or US demand →
   exports and the peso → inflation → Banxico → growth), and a short readout of the
   direction of pressure.
2. **The full room at `/model`** — the existing Mexico Machine, restyled to house law: all
   levers unlocked, every dial visible.

**How a non-expert uses it to learn:** presets first, sliders second. A preset answers a
named question (Q8: what does the tariff lever actually touch? Q10: why do forecasters
disagree?); pulling it draws the causal chain step by step, so the user leaves with the
*mechanism*, not a number. After any preset runs, the card offers "now adjust it yourself"
— the same levers, unlocked. Fidgeting is the second visit; the first visit is a lesson.

**Label law (non-negotiable):** every model output carries the `MODEL` stamp; model dials
never wear the green live stamp. The public model reports **direction only**. It does not
publish an implied target, magnitude, horizon, or probability until those can be defended
with estimated and cited coefficients. If active forces disagree, it says `mixed`. The
current readings beside it remain dated source data and link back to their charts.

---

## 5 · Architecture — one spine, three rooms

**Decision: a single spine page plus three deep rooms.** The birdseye job (§1) must complete
in one scroll with zero navigation; the depth (full model, a 2,478-municipality Atlas with
2,466 published 2020 poverty values, source
audit) would wreck first paint if inlined. Hub-and-spoke resolves the tension.

| Page | Job | Contents (asset mapping) |
|---|---|---|
| **`/` — The Briefing** (the spine) | The five-minute job, end to end | Masthead + orientation strip (§6) → **the Board** (Q2; existing tile grid, English) → sections Q3–Q9 (existing metric rows + sparklines for *current*; the 22-chart briefing's exhibits redistributed as each section's *lagging* layer) → **the Outlook** (Q10) → **the Machine presets** (Q11) → **the Wire** (Q12; `build-news.js` output) → Atlas teaser + footer (method, data health, license) |
| **`/model` — The Machine** | Full what-if room | The published causal-model artifact, restyled to McKinsey-MX, all levers |
| **`/atlas` — The Atlas** | "What is it like in one specific place?" | The existing search + geolocate + choropleth + municipio profile card, moved intact; layers: poverty (default), crime, IMSS when landed |
| **`/data` — Data health** | The trust room | Existing health page, English: every source, cadence, vintage, license, last run, failures |

Fold-ins and outs: the **22-chart briefing artifact dissolves into the spine** (its charts
are the lagging exhibits; its long prose trims to section narratives — the artifact retires).
The **allocator memo** stays a published research piece and becomes a `/research` room in v3,
not before. The **CRM stays private** — it is not part of this product. Cross-linking rule:
rooms never introduce new numbers that bypass the pipeline; everything renders from
`data/*.json` with the same stamps.

---

## 6 · Orientation — the first screen for a zero-context reader

The current spec optimizes for someone who already knows what Banxico is. The outsider
needs **30 seconds of teaching before the dials mean anything.** First viewport, in order:

1. **Masthead** (sticky): brand left; right, live trust signal from health.json —
   `● 19 sources live · updated 2h ago` → links to `/data`.
2. **H1 + dek** (≤150px, per SITE-SPEC discipline).
3. **The one-paragraph country** — ~60 words, every claim sourced: *"Mexico is a country of
   131 million people with a $1.9 trillion economy — top-15 in the world, #1 trading partner
   of the United States. It mostly manufactures and exports; 80% of exports go north. It
   elects a president every six years — currently Claudia Sheinbaum (Morena), through 2030.
   This page is its live dashboard."*
4. **The four-fact strip** — population · GDP (world rank) · exports-to-US share · who
   governs + next election. Mono, sourced, one line.
5. **The Board** (Q2).

**"New to Mexico?" primer** — one expandable strip below the Board (collapsed after first
visit): five numbered cards, each one exhibit + 40 words — *the scale* (vs peers), *the US
tether* (trade share), *how it's governed* (system + judicial-reform note), *the two Mexicos*
(formal/informal, north/south — the map preview), *the security picture, honestly* (national
trend + "varies enormously by place" → Atlas). Teaching without dumbing down: real numbers,
real sources, no metaphors in place of figures.

**The benchmark law (site-wide, from Alan's standing rule):** an outsider cannot read a bare
number. Every headline figure carries exactly one comparison — **vs its own history** ("peso
strongest in X months"), **vs the fixed peer set** (US · Brazil · Poland · Turkey · Vietnam),
or **vs target** (inflation vs Banxico's 3% ± 1). One `vs` per number, never zero, never a pile.

**The gloss law:** first use of any Mexican institution gets a five-word gloss — *Banxico
(the central bank) · INEGI (the national statistics office) · IMSS (social security — the
formal-jobs registry) · SESNSP (the crime-report registry)*. After that, the short name.

---

## 7 · The right form for each question

| Question | Form | Steal |
|---|---|---|
| Q1 orientation | Fact strip + five primer cards | The Economist country page lede |
| Q2 the Board | **IMF DataMapper card grid** — big number + sparkline + vintage + stamp per tile; 8 tiles, 2×4 mobile. Arrows in ink, no good/bad coloring | IMF DataMapper (Alan's reference — yes, this is the pattern for "current") |
| Q3 money | Dual-line exhibit (policy rate vs inflation vs target band) + peso long line + reserves row | FT charts |
| Q4 growth & dependence | GDP/IGAE time-series + one trade-dependence bar (exports by destination — the 80% bar is the single most teaching chart on the site) | OWID |
| Q5 nearshoring | Quarterly FDI stacked bars (new vs reinvested) + honesty note ("announcements are not flows") | Atlas of Economic Complexity captions |
| Q6 better off | Poverty sparse-dot chart + real minimum-wage line + remittances bars | OWID sparse-data honesty |
| Q7 politics | Fact card (who governs, supermajority note, election countdown) + approval poll line, house-labeled | FiveThirtyEight approval tracker, single-poll version |
| Q8 the US relationship | Dated status card (USMCA state) + tariff timeline + Wire filter | Geopolitical nerve-center one-pagers (the Mkinsey PDFs) |
| Q9 security | National per-100k trend + benchmark line (vs LatAm peers) + one link into the Atlas. Never a red hero map | Our own SITE-SPEC §07 restraint, kept |
| Q10 the Outlook | **Forecast table**: rows = GDP, inflation, rate, peso; columns = Banxico survey consensus · IMF · OECD, each dated, min–max spread shown. No averaging across houses | IMF WEO tables |
| Q11 the Machine | Preset scenario cards → drawn causal chain → dials; full room at `/model` | Bret Victor explorables, disciplined |
| Q12 the Wire | Headline list: title + outlet + date + tag chips (politics/markets/trade). No fake summaries; optional *weekly* cited narrative written by the scheduled Claude routine, bylined and dated as editorial | Techmeme austerity |
| The Atlas | Choropleth + search + municipio profile card (six first-party facts) | Data México skeleton, Numbeo compare later |

Design law unchanged (white paper, black ink, green #0a7d4d = live only, red = alerts only,
Fraunces/Inter/Plex Mono, numbered exhibits with conclusion-titles and Source lines).
English page, Spanish institution names kept with glosses — that is the product's texture.

---

## 8 · The sequence

**v1 — build now (the spine, usable end-to-end):**
1. **Restructure `index.html` to this bible, in English**: orientation strip + primer;
   Board (existing 8 tiles, English labels); sections Q3–Q9 from the 13 live series +
   `NOT YET WIRED` cards; stamps in English grammar. Move map/search/profile to `/atlas`
   intact; health page to English at `/data`. (Mostly reuse — this is a re-frame, not a rebuild.)
2. **The Outlook (Q10)**: wire Banxico Survey of Expectations (SIE token exists) + IMF WEO
   (keyless API) → the forecast table. This is the cheapest honest "forward" on the internet.
3. **The Machine presets (Q11)**: port three presets from the published artifact into the
   spine with MODEL stamps; full room at `/model` restyled.
4. **The Wire (Q12)**: `build-news.js` already exists — schedule it, render the list.
5. **Redistribute the briefing's exhibits** into Q3–Q9 as the lagging layer (top 8–10
   charts first, rest in v2).

*v1 acceptance:* the five-minute test passes with a cold reader · first viewport = masthead
+ H1 + country paragraph + fact strip + ≥4 Board tiles · every number stamped + sourced ·
zero green outside live stamps · model outputs all stamped MODEL · any feed failure renders
fail-closed with the page still loading · benchmark law holds for all Board tiles ·
Lighthouse mobile ≥ 90.

**v2 — deepen (the placeholders die):** direct INEGI connector (kills WB placeholder chips
— DATA-MODEL.md's highest-leverage task) · enable IMSS + SESNSP (crown-jewel Atlas layers +
Q9 national aggregate) · approval-poll feed + consumer confidence + trade balance · the full
benchmark pass (peer-set data, one World Bank call) · remaining briefing exhibits · Atlas
profile upgrade toward the six-fact card · state-level layers where source-native.

**v3 — widen:** `/research` room (allocator memo + long-form, house-styled) · scenario
library in the Machine (saved/sharable runs) · **Spanish edition** (translation of this
product) · comparisons room (Mexico vs peer set) · optional metered chat (API, costed) ·
optional domain + paid tier if an audience shows up.

**Do NOT build (unchanged where not superseded):** composite score · runtime LLM · invented
indices (nearshoring index, announcement-counting) · auto-refresh websockets · accounts ·
dark mode · PDF export · municipio GDP/inflation promises. **Superseded from SITE-SPEC:**
"no English version" (English is now the language) and "no news" (the Wire is in — it was
already built honestly) and "no second page" (three rooms, one spine).

---

*The weakest part of this plan, named out loud: the political and social forward cells are
structurally thin — no feed exists, and the honest treatments (calendar + scenarios + one
demographic projection) are less satisfying than the economic cells. We ship the honesty
rather than fake the symmetry; if a reader notices the asymmetry, the product is working.*
