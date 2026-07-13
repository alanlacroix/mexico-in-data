I have everything I need — real selectors, functions, tokens, and strings. Here is the synthesized spec.

# REDESIGN-SPEC — Mexico, in data v2

*The design lead's build order. Every number is a real px/ch value, every recommendation names its exemplar, every token is from `design/mckinsey-mx.css`. This answers all eight of Alan's complaints. Read top to bottom; the Build Checklist (§9) is the task list.*

**The one sentence that fixes the whole site:** stop centering a 820px column in dead space, spend the left margin on a sticky TOC, make every chart carry its numbers on the marks, make every title a sentence with a period, and lift the Wire out of the basement. That is McKinsey geometry + FT chart craft + Trading Economics wayfinding.

---

## 1. LAYOUT & GRID

**The complaint:** "why is everything so tight in the middle?"

**The diagnosis (do not misread it).** The prose measure is *not* too narrow — 68ch is correct and every exemplar (McKinsey body ≈90ch, OWID ≈50ch/col) keeps a tight measure. The problem is that `index.html` sets `.wrap{max-width:820px}` (line 19) and *centers* it, so the reading column floats between two dead margins. McKinsey's fix, measured off both PDFs: an **asymmetric** frame — column pushed right, a wide **left rail** that carries structure (exhibit numbers, section eyebrows, and here, the TOC), and exhibits that **bleed left** past the text edge onto a pale panel. We copy that exactly, using the OWID/Stripe three-region layout.

**The spec.**

- Page container: `.wrap{max-width:1140px}` (was 820). This overrides the local rule; the shared `--maxw:1120px` already agrees, so delete the local `.wrap` width override in `index.html` line 19 and let a new grid drive it.
- Desktop body becomes a **2-column grid**:
  ```
  .briefing{
    display:grid;
    grid-template-columns:232px minmax(0,1fr);
    gap:40px;
    max-width:1140px;margin:0 auto;
    padding:0 clamp(18px,4vw,44px);
  }
  ```
- **Reading column stays 720px** (≈68ch at 16px). Prose measure is *unchanged* — it will not read looser or wider. Enforce with `.briefing > .content{max-width:760px}` and keep text blocks at `max-width:68ch` (the existing `.country`/`.dek` caps are right).
- **Left rail = 232px, sticky:** `position:sticky; top:72px; align-self:start; max-height:calc(100vh - 90px); overflow-y:auto`. Holds the TOC (§2). *(Exemplar: Stripe Docs / OWID topic pages.)*
- **Exhibits and tables break out of the reading measure.** Give `.exwrap`, `.octbl`, and the Board `.tablero` `width:100%` of the content column (so ~720px, up from cramped), and let the **2–3 flagship exhibits** go **full-content-width** with a pale panel behind them:
  ```
  .exhibit--wide{
    margin-left:calc(-1 * ((1140px - 232px - 40px) - 720px) / 1);
    /* simpler: put flagship exhibits in a full-bleed row that
       spans the content column edge-to-edge on a #f7f7f4 panel */
    background:var(--paper-2);          /* #f7f7f4 — McKinsey panel #F2F3F4 analog */
    padding:22px 26px;border-radius:4px;
  }
  ```
  *(Exemplar: McKinsey exhibit gray panel runs x25→562pt, wider than the 138→561pt text column.)*
- **Whitespace rules (McKinsey-measured):** body `line-height:1.5–1.6` (already 1.62 — good), **a full blank line between paragraphs** (`p + p{margin-top:1em}`), section vertical rhythm `padding:26px 0` (already set on `section.dim`). Whitespace is the wide left rail + inter-paragraph air, not a loose measure.
- **Responsive:** below **900px** collapse to one column (`grid-template-columns:1fr`), hide the left rail, and switch to the mobile pill bar (§2). Reading column goes full width at `padding:0 clamp(16px,5vw,32px)`.

**Decision — does the Briefing get a sticky left-rail TOC? YES.** It is the single highest-leverage change: it fixes "tight in the middle" (fills the dead margin), "hard to navigate / what is where" (persistent index), and "where is the news" (pin the Wire to the top of it) in one move.

---

## 2. NAVIGATION & WAYFINDING

**The complaint:** "hard to navigate, what is where" + "where is the NEWS???"

**The spec — four wayfinding devices, all vanilla JS + IntersectionObserver (no framework, no CDN — matches the constraint).**

### 2a. Top masthead nav (`header .mnav`) — make the four surfaces + NEWS obvious
Current nav is `Model · Atlas · [status→Data]`. Rebuild to:
```
The Wire ·N   |   Briefing   |   Model   |   Atlas   |   Data
```
- **`THE WIRE ·N`** goes **first**, with a pulsing green dot (reuse `.status .dot` `@keyframes lp`), `href="#q12"`, and a live count badge from `NEWS.articles.length`. Mono 11px uppercase like the rest of `.mnav`. *(Exemplar: Bloomberg persistent live rail; Trading Economics leads with the calendar.)*
- Keep `.mnav a{color:var(--mut);text-transform:uppercase;letter-spacing:.04em}`; active/here page gets `color:var(--green-d)`.

### 2b. Sticky left-rail TOC (desktop) — the 12 questions as a visible index
Single source of truth — add a `NAV` array and render both the rail and the sections from it:
```js
const NAV=[
 {g:'LIVE',    items:[{q:'',   t:'The Wire',        id:'q12', live:true}]},
 {g:'SNAPSHOT',items:[{q:'Q1', t:'Mexico in one look', id:'q1'},
                      {q:'Q2', t:'How is it doing?',    id:'q2'}]},
 {g:'THE ECONOMY',items:[{q:'Q3',t:'Money sound?',      id:'q3'},
                      {q:'Q4', t:'Growth & the US',     id:'q4'},
                      {q:'Q5', t:'Nearshoring real?',   id:'q5'},
                      {q:'Q6', t:'Better off?',         id:'q6'}]},
 {g:'POLITICS & RISK',items:[{q:'Q7',t:'Who governs?',  id:'q7'},
                      {q:'Q8', t:'The US relationship', id:'q8'},
                      {q:'Q9', t:'How dangerous?',      id:'q9'}]},
 {g:'FORWARD',items:[{q:'Q10',t:'Where it\'s heading', id:'q10'},
                      {q:'Q11',t:'What if…?',           id:'q11'}]},
];
```
- Row markup: mono `Q3` label in `--green`, 11px, tabular-nums, fixed 28px width + short 2–4-word title in `--ink-2` 12.5px/1.35, `padding:5px 0`. **Use the short title, never the full question.**
- Group eyebrows: mono uppercase 9.5px `--mut`, `letter-spacing:.06em`, with a right-aligned `· N` count.
- **The Wire row is pinned to the TOP** under a `LIVE` eyebrow with the pulsing dot. *(Exemplar: OWID grouped TOC + Stripe left-nav sections.)*

### 2c. Active-section scrollspy (the CSS-Tricks canonical recipe)
```js
const io=new IntersectionObserver((es)=>{
  es.forEach(e=>{ if(e.isIntersecting){
    document.querySelectorAll('.toc a').forEach(a=>a.classList.remove('active'));
    const link=document.querySelector('.toc a[href="#'+e.target.id+'"]');
    if(link){link.classList.add('active');
      history.replaceState(null,'','#'+e.target.id);}
  }});
},{rootMargin:'-45% 0px -50% 0px',threshold:0});
document.querySelectorAll('section[id^=q]').forEach(s=>io.observe(s));
```
Active style: `border-left:2px solid var(--green); margin-left:-12px; padding-left:10px`; title → `--ink` weight 600. Instant class swap (no moving indicator — reduced-motion safe). *(Exemplar: css-tricks.com sticky-TOC scrollspy; Linear/Stripe "On this page".)*

### 2d. Three more must-haves
- **`scroll-margin-top:80px` on every `section[id]`** — one line, fixes the existing `#q4/#q7/#q10/#q11` cross-links that currently land *under* the sticky masthead (reads as a broken link today).
- **Reading-progress bar:** 2px fixed top bar, `--green` fill, `width = scrollY/(scrollHeight-innerHeight)*100%`, rAF-throttled passive scroll listener. ~10 lines. *(Exemplar: FT/Reuters long-reads.)*
- **Back-to-top button:** `position:fixed;right:24px;bottom:24px`, 40px circle, `--paper` bg, `1px solid --line`, `↑` in `--ink-2`; `.visible` after `scrollY>innerHeight`; respect `prefers-reduced-motion`.
- **Hero "What this page answers" contents grid:** directly under the dek, before the fact-strip — a 12-item 2-col grid (`Q# · short title` anchors), hairline dividers, green mono numbers. Reader sees the whole argument in one screen. *(Exemplar: OWID "Key Insights" / McKinsey article contents box.)*

### 2e. Mobile wayfinding (< 900px)
Left rail hidden → replace with a **sticky horizontally-scrolling Q-pill bar** under the masthead: `position:sticky;top:56px; overflow-x:auto; scroll-snap`. Pills `Q1…Q12` mono 11px, `--paper-2` chip, active = `--green` bg / white text. The same IntersectionObserver callback calls `activePill.scrollIntoView({inline:'center'})`. *(Exemplar: Reuters/Pudding mobile section nav.)*

**Where Model/Atlas/Data/News live:** Model, Atlas, Data = masthead top-nav (separate pages, unchanged). **News (the Wire) lives in three places at once** — top-nav (`THE WIRE ·N`), pinned top of left rail, and a Latest-strip teaser high on the page (see §7). It is never "just Q12" again.

---

## 3. TYPE SCALE & COLOR

**The complaint (implicit):** headings do the wrong work; the copy and charts feel amateur. McKinsey's lesson: **small quiet type, loud structure** — hierarchy from weight + whitespace + the exhibit template, not size inflation. Body is only 9.5pt in their decks.

**The exact web scale (px). Set these, stop inflating.**

| Role | Size / line-height | Font | Weight | Notes |
|---|---|---|---|---|
| h1 (hero) | **40px** / 1.02 | Fraunces (`--serif`) | 600 | Cap the `clamp(30px,7vw,46px)` down to `clamp(28px,5vw,40px)` — 46 is too loud |
| h2 (section) | **26px** / 1.14 | Fraunces | 600 | `clamp(22px,3.2vw,28px)` |
| h3 / exhibit conclusion-title | **20px** / 1.25 | Fraunces | 600 | The loud element is *this sentence*, not a hero |
| exhibit subtitle / units | **14px** / 1.4 | Inter (`--sans`) | 400, `--mut` | "what's plotted + unit" |
| body | **16px** / 1.55 | Inter | 400, `--ink-2` | McKinsey 9.5pt/1.37 web-equivalent |
| kicker / eyebrow / mono labels | **11px** | IBM Plex Mono | 500, `--mut` | `letter-spacing:.08–.16em` uppercase |
| table numerals | **13.5–14px** | IBM Plex Mono | 400 | `font-variant-numeric:tabular-nums`, right-aligned |
| footnotes / source line | **11–12px** | IBM Plex Mono | 400, `--mut` | |

Rule to encode: **hierarchy comes from weight + whitespace, never from a >40px heading.** *(Exemplar: McKinsey Sans scale extracted via pdfplumber — body 9.5pt, exhibit title 12.5pt.)*

**Color — reaffirm the one-hue discipline.** Map **flag green `#0a7d4d` to McKinsey's RED subject-highlight role**: it is the **subject / live / accent hue only.** Everything else on a chart is a neutral ramp.

- Chart series order (cap 6, colorblind-safe): `--ink #141414` (primary/total) → **green #0a7d4d (Mexico / the series the title is about)** → then muted `teal #2b7a9e`, `clay #b5651d`, `slate #6a6f7a`, `gold #b8952a`. One series = ink or green; two = ink vs green; **grey out every non-focus series and color only the one the title names** (the Economist "highlight one" move).
- **Ban categorical rainbows.** Ban a second saturated hue live at the same time.
- Green stays reserved for: links, exhibit numbers, live/positive, the subject series, active-nav. Red `#c8102e` for negative/alert only. Amber `#a6791a` sparingly for stale/watch. *(Exemplar: McKinsey deep-blue→light-blue→gray ramp + single red subject; the Economist highlight-one.)*

---

## 4. THE CHART ENGINE

**The complaint:** charts "look lazy — hard to read, small, not interactive. Where are the bar charts, tables, etc.?"

**The doctrine (FT/Economist/OWID, verified against McKinsey):** conclusion-title, **numbers on the marks**, strip the chrome, go bigger, **direct-label instead of legend**, add a hover crosshair, and add a **Chart⇄Table toggle**. A static bordered SVG with a legend and a full y-axis is exactly what reads as "Excel default / lazy."

### 4a. The exhibit frame (rewrite `exhibit()`)
Current `exhibit(no,title,units,svg,srcHTML)` renders a **label**-title in a bordered box. New contract:
```js
exhibit(no, finding, subtitle, svg, src, opts)
// finding  = takeaway SENTENCE with a period (Fraunces 20px/1.25 bold)
// subtitle = metric + unit + geo + period (Inter 14px --mut)
```
Frame, top→bottom (the fixed 7-part McKinsey template, every figure identical):
1. **Green tag** `28×5px` rect flush-left above the title (the Economist red-tag move, in `--green`).
2. Kicker: `EXHIBIT 3.1` mono 11px uppercase `--green`.
3. **Conclusion title** — the finding sentence.
4. Subtitle — what's plotted + units.
5. The SVG (no border — see 4c).
6. Optional footnote(s) mono 11px `--mut`.
7. `Source: …` line mono 11px, then a small `Mexico, in data` signature.

**Remove** `.exwrap svg.chart{border:1px solid var(--line);border-radius:8px}` (line 123) — newsroom charts have **no box**.

### 4b. Canvas sizes & margins (design at these px so type isn't microscopic in a 720px column)
- **Line / dual / area time-series:** `viewBox 720×400` (1.8:1). Margins: top 8 / **right 96** (reserved for end-labels) / bottom 28 / left 44. *(Current lineChart is 680×200 — too short and too small.)*
- **Vertical bars:** 720×400, same margins, bottom 34 for rotated-free labels.
- **Horizontal ranked bars:** width 720, **height = 44 + rows×32**.
- **Small-multiple tile:** 200×140, 3–4 across, shared y-scale.
- All keep `width:100%;height:auto` to scale down. *(Exemplar: Reuters/Datawrapper defaults, FT 1.6–1.8:1.)*

### 4c. Minimal axes + value labels ON the marks (the "not lazy" core)
- **Y:** no axis spine, no ticks; **4 faint horizontal gridlines** `stroke:var(--line) 1px`; numeric label just above its gridline, left-flush, mono 10px, rounded to 2 sig-figs (`40%`, `1.2k`). *(Current draws 4 gridlines — keep, but drop label clutter to 4 values.)*
- **X:** no gridlines; label only first, last, + 2–3 interior; 4-digit years.
- One heavy rule only: the **zero baseline** when data crosses zero (`.zero` already exists).
- **Bars carry their value as `<text>` at the bar end:** inside white (`fill:#fff;text-anchor:end;x=barEnd-6`) if bar > 64px, else outside ink at `x=barEnd+6`. Category name left of the bar (`text-anchor:end; x=plotLeft-8`). The current `hbarChart` (lines 377–385) is 80% there — keep it as the reference and apply the same to vertical `barChart`. *(Exemplar: Economist/Bloomberg value-on-bar.)*

### 4d. Direct end-of-line labels (kill the legend)
At each line's last point, `<text x=plotRight+6 y=lastY fill=seriesColor>Name value</text>` (12px). Nudge ±7px on collision. **Delete the `.leg` legend blocks** (line 135–136) and the inline legend in the Q3 exhibit (line 512). *(Exemplar: FT multi-line charts, OWID direct labeling.)*

### 4e. Unified hover tooltip + crosshair (the biggest "interactive" win)
One transparent full-height `<rect>` captures pointer x → nearest-index lookup → draw 1px vertical crosshair + a filled dot on each series at that x → position an **absolutely-positioned HTML div** (not SVG) listing: bold x-value header, then one row per series `swatch  Name  value`, values right-aligned tabular-nums. Hide on `mouseleave`. *(Exemplar: OWID/FT/Bloomberg "read all series at one x".)*

### 4f. Chart ⇄ Table toggle (answers "where are the tables?")
On the 2–3 flagship exhibits, pill tabs top-right of the title: `[Chart] [Table]`. Table view renders the same data as a styled data table (4g). Reuse the `model.html` preset-pill styling. *(Exemplar: OWID Grapher view tabs.)*

### 4g. DATA TABLE as a first-class chart type (FT/Economist/Datawrapper styling)
`table.mck` in the shared CSS is close. Enforce for every data table: **no zebra, no vertical rules, hairline 1px `--line` row rules only**, header a heavier 1.5px bottom border; header text mono 11px uppercase `--mut` `letter-spacing:.04em`; body 13.5px; **numbers right-aligned, `font-variant-numeric:tabular-nums`, fixed decimals, thin-space thousands**; text left-aligned; row padding ~10px; **sortable** headers (button + ▲/▼, sorted header ink-bold). Optional Datawrapper trick: a tiny inline magnitude bar (filled div sized to value%) in a `magnitude` column.

### 4h. Chart-type map for our real exhibits (FT Visual Vocabulary applied)
| Exhibit (real id / section) | Message | **Chart type** | Why |
|---|---|---|---|
| **3.1** rate vs inflation (`dualChart`, Q3) | two series over time + target | **Dual line + shaded 3%±1 band**, direct end-labels "Inflation 4.2 / Policy rate 6.50" | already right; add band label + end-labels, kill legend |
| **4.1** real GDP growth (`lineChart`, Q4) | change over time, crosses zero | **Line with zero baseline**, value on last point | keep; add crosshair |
| **4.2** exports by destination (`hbarChart`, Q4) | ranking / part-to-whole | **Ordered horizontal bars, value-on-bar** (US 80% green, rest grey) | the model exhibit — keep verbatim |
| **5.1** FDI quarterly (`barChart`, Q5) | magnitude over time | **Vertical columns**, value labels every 4th | add labels; grey bars, green only if highlighting |
| **6.1** minimum wage (`lineChart` green, Q6) | deliberate rise over time | **Line, green (subject)**, annotate "2.4× since 2018" | keep green = subject |
| Poverty (national, Q6) + Atlas | ranking across places | **Choropleth** (the map, §5) + a **dumbbell** 2012 vs 2024 if two points exist | dumbbell for two-period change by state |
| Remittances (Q6) | level over time, big number | **Big-number callout + 90px sparkline + line** | Bloomberg lede-stat |
| Outlook (Q10) | forecasts, 3 houses × years | **Actual-vs-projected TABLE** with year columns, shaded projected region | never prose; already a table — add the shaded forecast band |
| "Two Mexicos" / states | same metric across many states | **Small multiples** (200×140, shared y, ghost national line) | FT small-multiple grid |
| Deviation stories (states vs national avg) | above/below a reference | **Diverging bar around zero** | FT deviation pattern |

**Big-number callout / stat tile** (for the Board + section ledes): huge Fraunces (~44px) figure + a +/- delta chip (green/red) + one-line label + inline 90px sparkline. *(Exemplar: Bloomberg Graphics.)*

---

## 5. THE MAP

**The complaint:** "not good, hard to use, zooms in, not intuitive, really confusing."

**The root cause, in the code:** `atlas.html` line 187 — the `wheel` handler calls `e.preventDefault()` (scroll-hijack trap), pointer-drag pans, and **click does two things**: `goFicha()` *and* `__mapFly()` (the surprise zoom). `__mapSelect` (line 188) *also* calls `__mapFly`. That double-duty click + auto-zoom is precisely "it zooms in, confusing." The fix: **the map is a picker, not a canvas** — search is the hero, click = select only, the map holds still. *(Exemplars: NYT/CDC/USAFacts "find your ___", Datawrapper choropleth.)*

**The exact new interaction model.**

1. **Default view:** whole country, fixed. `viewBox 0 0 800 560`, **never mutated by scroll**. Legible, centered, no accidental pan-away.
2. **Search is the hero.** Promote `#q` above the map: 44px tall, 16px font (prevents iOS zoom-on-focus), left magnifier icon, autocomplete max 8 rows showing `NOMBRE · Estado`. Keyboard ↑/↓/Enter already works (line 162). On select: fill `.sel`, 2px green halo outline, open the ficha — **do NOT zoom.**
3. **Kill scroll-hijack.** Remove the `wheel` listener entirely (or gate behind Cmd/Ctrl+scroll with a transient overlay hint "Use ⌘ + scroll to zoom"). This one change removes most of the "confusing/hard to use" feeling. *(Exemplar: Datawrapper — no wheel-zoom by default; Google Maps embed ⌘-gate.)*
4. **Click = select only, map holds still.** In the `pointerup` handler (line 187) **remove the `__mapFly(...)` call**; keep `goFicha(...,false)`. Add `.sel` + green halo, raise z-order (already done). Only if the selected polygon is off-screen, a **250ms center ease** — **never change zoom level.** Remove `__mapFly` from `__mapSelect` (line 188).
5. **Zoom becomes deliberate + optional.** Keep the `+`/`−` buttons (step 1.5×, max ~6×). **Relabel the reset button from the bare `⤢` glyph to "See all Mexico"** (line 104 — the bare icon is undiscoverable).
6. **Tooltip anatomy** (3 lines max, cursor +14px offset — already positioned): line 1 bold = municipality; line 2 muted 11px = state; line 3 = active-metric value + units + one-word benchmark vs national ("18.2 / 100k · above national"). *(Exemplar: Datawrapper tooltip editor.)*
7. **Legend — teach the encoding.** Replace the "less → more" gray strip (line 186) with a **5-class** segmented bar (down from 7): swatches 28×12px, **numeric break labels under the boundaries** (`|0 |8 |18 |35 |60+`), metric name + unit above, and a **detached "No data" swatch** in `#f7f7f4`. State the method ("quantile"). *(Exemplar: FT / ColorBrewer / Datawrapper.)*
8. **Color — give data a real sequential ramp.** Replace `RAMP` (line 172, the 7-step gray) with a **5-step single-hue sequential**, and set `quant()` to 5 classes:
   - Crime / poverty (dark = worse, intuitive): `#fdf0e6 → #f4b183 → #d9741f → #a84800` (+ a light step) — warm `YlOrBr`-family, colorblind-safe.
   - A "good/neutral" metric: mono-green from the flag green `#eef6f1 → #b8dcc8 → #6fbf97 → #2f9e6a → #0a7d4d`.
   - **Sequential only, not diverging** (these metrics have no meaningful midpoint). *(Exemplar: ColorBrewer sequential, Datawrapper defaults, FT dark=more.)*
9. **Persistent readout panel** = why zoom is unnecessary. Make the ficha / `#miniback` always show the selected municipality: name, state, population, metric value, **national percentile** ("more crime than 78% of municipios" — already computed via `below`), source stamp. The answer lives in text, not in a zoomed polygon. *(Exemplar: NYT Upshot sidebar readout, IMF DataMapper panel.)*
10. **Mobile (< 640px):** disable **all** map drag/zoom — remove `pointerdown`/`pointermove` pan, hide `.zoomctl`. Map = **tap-to-select only**; search + autocomplete is the primary path above the map; data opens in the existing `#miniback` bottom bar. Lets the finger scroll the page. *(Exemplar: Datawrapper responsive maps.)*
11. **"Use my location" (`#geo`)** → snap to nearest municipality centroid and **select** it (open ficha) at full extent — reinforces selection ≠ zoom.

---

## 6. THE FEEDS / DATA-HEALTH TABLE

**The complaint:** "hard to read"; wants columns: last updated · cadence · what data it feeds · link to source · who owns it.

**The root cause in `data.html`:** `table.mck{min-width:820px}` (line 33) forces horizontal scroll inside a 960px wrap (the #1 readability killer); `cad()` (lines 76–84) **regex-guesses** cadence from the id and silently returns "—"; and the page **conflates "last run" (fetch) with "vintage" (newest data point)** — two different facts. Current columns are `Feed(id) · Source · Cadence · Vintage · Rows · Status · Last run` — a machine dump led by a technical id.

**The spec — rebuild around 8 columns, grouped by owner, no horizontal scroll.** Widen the wrap `960px → 1120px`; explicit widths sum to ~1080px so it fits desktop with no scroll; collapse to card-per-row on mobile. *(Exemplars: OWID "Sources & Download" two-freshness-facts model, FRED "Updated:" stamp, World Bank owner+license, Trading Economics reference column, Statista progressive disclosure.)*

| # | Column | Width | Type / rule |
|---|---|---|---|
| 1 | **Dataset / What it feeds** | ~300px (flex) | 2-line: **bold human name** (text face) + muted one-liner naming which tiles/exhibits depend on it. Demote the technical `id` into the expand row. |
| 2 | **Owner** | 150px | Institution name + a **small colored type chip**: `green`=gov/national-stats (INEGI, CONAPO, CONEVAL), `deep-green`=central bank (Banxico), `grey`=multilateral (World Bank, OECD, IMF, BIS), `blue`=US-federal (FRED, Census, CBP, BTS, BEA), `slate`=social security (IMSS), `slate`=security & justice (SESNSP), `amber`=energy (CRE, CFE, Pemex, CAPUFE) |
| 3 | **Cadence** | 90px | mono, **controlled vocab** (`Every 4h · Daily · Weekly · Monthly · Quarterly · Annual · 5-yr`) — **explicit field, not regex** |
| 4 | **Vintage** (newest data point) | 90px | mono date, right-aligned |
| 5 | **Last updated** (last fetch) | 130px | mono `Updated: Jul 9`, right-aligned, prefixed by an 8px **status dot** |
| 6 | **Next due** | 100px | mono date = vintage + cadence, right-aligned; drives the status color |
| 7 | **Source** | 110px | clickable dataset name with `↗` → the **exact database/endpoint**, not the org homepage |
| 8 | **License / status** | 110px | license micro-tag (`Libre Uso MX` / `CC BY-4.0` / `⚠ Banxico — not open`) over the live/flagged/failed badge |

**Status dot logic (this makes it a health monitor, not a run log):** green = not yet due; **amber = overdue by < 1 cadence OR vintage is stale even though fetch succeeded** (e.g. SESNSP mirror ends Dec-2025); red = failed; grey = behind a flag. Drive off **Next-due vs now**, not fetch time alone.

**Grouping — 6 sticky owner-type bands** (mono 11px uppercase `--mut`, right-aligned `· N feeds`), in order: **Central bank (Banxico) · National statistics (INEGI, CONAPO, CONEVAL) · Social security (IMSS) · Security & justice (SESNSP) · Energy & infrastructure (CRE, CFE, Pemex, CAPUFE) · Multilateral & US-federal context (World Bank, OECD, BIS, IMF, FRED, Census, CBP)**. Within a band: priority (H before M), then cadence (fastest first). Default sort by **Last updated desc** so stale surfaces. *(Exemplar: FRED "Browse by Source" / OWID Data Catalog producer grouping.)*

**Row expand (Statista pattern):** chevron reveals full citation, Retrieved-on, CVEGEO granularity, exact endpoint URL, license clause, and the honest "catch" already in `DATA-SOURCES.md` (e.g. "clean mirror ends Dec-2025", "IMSS ~400MB/mo, WAF").

**Typography:** row height **48px**, single 1px `--line` hairline between rows (**no zebra, no per-row border/radius**), sticky header, every date/cadence/count cell IBM Plex Mono `tabular-nums` right-aligned. **Labels quiet, values loud** (don't bold whole rows). **Hard-flag the restricted source visibly:** Banxico gets `⚠ Banxico — not open (Clause 8)` amber tag per `DATA-SOURCES.md §6` — governance caveat lives in the trust room, not buried.

**Data-model change:** add an explicit `cadence` field per source in `health.json`, and split the single date into `vintage` (newest data point) and `lastFetchedAt` (fetch time). Delete `cad()`.

---

## 7. WHERE THE WIRE (NEWS) LIVES

**The complaint:** "where is the NEWS???" — it's buried at `#q12`, the last of 12 sections. The entire competitor class (Trading Economics, Bloomberg) treats recency as **top-of-page**. A live-news feature 11 sections down is functionally hidden.

**Placement — surface it in three tiers, keep the "no invented data" guard:**

1. **Masthead:** `THE WIRE ·N` as the **first** `.mnav` item, pulsing green dot, `href="#q12"`, count from `NEWS.articles.length`.
2. **Left rail:** pin a `LIVE — The Wire` row to the **top** of the TOC (above SNAPSHOT), pulsing dot.
3. **On the page:** a slim **"Latest" teaser strip directly under the hero fact-strip** — the 3 most-recent headlines (mono 11px, dated) + `See all in The Wire →` linking to `#q12`. It becomes the **second thing seen**, not the last.

**Guard:** the strip reuses the existing `renderWire` empty-state guard — if `NEWS.articles` is empty it shows nothing (no invented headlines). The full Wire at `#q12` stays as the deep view. *(Exemplars: Bloomberg persistent live rail; Trading Economics calendar as the beating heart; news-dashboard "latest" strips.)*

**Optional upgrade (Trading Economics calendar grid):** if/when forecast+actual data exists, render the Wire as `Date header · Event · Actual · Consensus · Previous · Importance dot` so it doubles as "what changed" and "what's next." Not required for v2; the dated-headline list is fine to start.

---

## 8. COPY VOICE

**The complaint:** copy is "weird, AI-driven" — wants McKinsey/Bain: outline structure, em dashes, takeaway-first.

### The 10 rules
1. **Takeaway-first (Minto/Bain "answer first").** Titles and deks state the **conclusion**, never the topic. Full sentence with a verb + a period. *("Banxico is holding rates high," not "Interest rates and inflation.")*
2. **Quantify every claim** — a number or direction in the title itself. Any adjective (weak/high/strong) must be pinned to a figure nearby.
3. **Declarative, present tense.** State sourced facts flat. No "appears to," "seems to," "could be seen as."
4. **Cut throat-clearing.** Delete "It's worth noting," "Importantly," "In many ways," "when it comes to," "at the end of the day." Start on the subject.
5. **Numbers over metaphors.** Kill "near stall speed," "the machinery that," "the engine of," "headwinds/tailwinds." The figure already says it.
6. **Em dash for the pivot, tight, no spaces, one per sentence max** — `consequences—from X to Y—could…`. Snap to the consequence: "FDI is high—but flat."
7. **Short sentences, 12–20 words, one idea each.** If a dek needs a semicolon, it's two deks.
8. **Concrete subjects, active verbs.** "Banxico held rates." Avoid nominalizations ("the concentration of exports," "the sustainability of growth").
9. **No forced rule-of-three / parallelism.** "What happened, what's true today, and where it's heading" is an AI tell — state one thing plainly.
10. **Say what it is, then caveat once.** Lead with the fact, add exactly one honest qualifier. Don't stack caveats or protest the sourcing ("Nothing invented," "no AI summaries").

**Sourcing mechanics:** sources as **superscript footnotes → a "Fuente/Source" line**, never a naked URL in body copy. Percentages spelled "percent" in prose, `%` only in exhibits.

### The "AI tells" blacklist (lint these strings out of `index.html`)
`stall speed` · `machinery` · `headwinds` · `tailwinds` · `the engine of` · `pillar` · `backbone` · `it's worth noting` · `importantly` · `notably` · `nothing invented` · `no AI summaries` · `appears` · `seems` · `suggests` · `relatively` · `somewhat` · `arguably` · `in many ways` · `when it comes to` · `in terms of` · `two questions with one answer` · `the answer is simple` · `very` · `really` · `quite` · `remarkably` · `strikingly` · rule-of-three deks · em-dash overload (>1/sentence) · rhetorical-question-as-assertion ("But is it sustainable?").

### 14 before → after rewrites of the real strings
1. **H1 dek** (line 233) — *before:* "What happened, what's true today, and where it's heading — every figure official, sourced, and dated. Nothing invented." → **"The state of Mexico's economy, in official numbers—sourced, dated, and updated as the data lands."**
2. **Meta description** (line 7) — *before:* "What happened, what's true today, and where Mexico is heading — … Nothing invented." → **"Mexico's economy in official numbers: growth, the peso, inflation, jobs, investment, politics and security—every figure sourced and dated."**
3. **Q3 dek** (line 514) — *before:* "The peso, inflation, and the central bank — the machinery that keeps money holding its value." → **"Inflation sits above Banxico's target, so the bank is holding rates high—and the peso is holding with them."**
4. **Q4 dek** (line 535) — *before:* "Two questions with one answer: growth is weak, and it rides almost entirely on the United States." → **"Growth is weak—about 0.4% a year—and almost all of it depends on demand from the United States."**
5. **Exhibit 4.1 title** (line 528) — *before:* "Growth has slowed to near stall speed" → **"Growth has slowed to 0.4% a year"** (keep the subtitle — it's correct McKinsey form).
6. **Verdict `banxico-pib-crecimiento`** (line 399) — *before:* "…growing +0.4% a year in real terms — near stall speed." → **"Real GDP is growing 0.4% a year—barely above zero."**
7. **Exhibit 3.1 title** (line 510) — *before:* "Banxico has held rates high while inflation drifts above target" → **"Banxico is holding rates high while inflation stays above target"** (present tense; "stays" is more factual than "drifts").
8. **Exhibit 5.1 title** (line 546) — *before:* "FDI is steady and high — but it is not the boom the headlines imply" → **"FDI is high and steady—but flat, not the boom headlines claim."**
9. **FDI honesty note** (line 492/551) — *before:* "…announcements are not flows — this is money actually recorded, not press-release pledges." → **"This counts money Banxico actually recorded—not the press-release pledges that drive most FDI headlines."**
10. **Exhibit 6.1 title** (line 558) — *before:* "The minimum wage has been driven up on purpose" → **"The minimum wage has doubled since 2018, by policy."**
11. **Wire dek** (line 622) — *before:* "English-language headlines … indexed and dated. Each links to its source — no AI summaries." → **"Every English-language headline on Mexico's economy and politics, dated and linked to its source."**
12. **Wire empty-state** (line 674) — *before:* "The news builder runs on a schedule and writes data/news.json. Until its next successful run, no headlines are shown here — rather than invent any." → **"No headlines yet—the next scheduled run will post them here."**
13. **Footer** (line 263) — *before:* "Every figure comes from an official source … Nothing is invented: if a number can't be verified it isn't published…" → **"Every figure is official and dated. If a number can't be verified it isn't published; if a feed fails, the last valid value is served and marked."** (drop the double-negative protest).
14. **Q10 dek** (line 613) — *before:* "The cheapest honest forward on the internet: three named houses, each dated, the spread shown. We never average them." → **"Three named forecasters, each dated, with the spread shown—never averaged into a false consensus."**

**Keep verbatim (the model to copy):** Exhibit 4.2 "Four out of five export dollars go to one country" — quantified, active, one finding.

**Encode in `SITE-SPEC.md`:** every exhibit title = a sentence with a verb + a number; every section dek = the verdict in one ≤22-word sentence; ship a lint check over `index.html` strings against the blacklist.

---

## 9. BUILD CHECKLIST

Prioritized. P0 = the changes that answer Alan's complaints most directly and unblock the rest.

**P0 — structure & wayfinding (fixes "tight middle," "what is where," "where's the news")**
1. `index.html`: replace `.wrap{max-width:820px}` with the `.briefing` 2-col grid (`232px minmax(0,1fr)`, `max-width:1140px`, gap 40); content column capped 760px. (§1)
2. Add the `NAV` array; render the **sticky left-rail TOC** (12 questions, 5 grouped eyebrows, Wire pinned top). (§2b)
3. Wire the **IntersectionObserver scrollspy** (rootMargin `-45% 0px -50% 0px`) → active highlight + `history.replaceState` hash. (§2c)
4. Add `scroll-margin-top:80px` to every `section[id]` (fixes existing broken-feeling anchors). (§2d)
5. Masthead: add **`THE WIRE ·N`** first, pulsing dot, `href="#q12"`; add the **"Latest" teaser strip** under the fact-strip. (§2a, §7)
6. Add hero **"What this page answers"** 12-item contents grid. (§2d)
7. Mobile: collapse to 1 col < 900px; add the **sticky Q-pill bar**. (§2e)
8. Reading-progress bar + back-to-top button. (§2d)

**P0 — the map (fixes "zooms in, confusing")**
9. `atlas.html` line 187: **remove the `wheel` listener**; **remove `__mapFly` from the `pointerup` click** and from `__mapSelect` (line 188). Click = select + halo, map holds still. (§5)
10. Promote `#q` search to hero (44px/16px, magnifier); relabel reset `⤢` → **"See all Mexico"**. (§5)
11. Replace `RAMP` (line 172) with a 5-step sequential ramp; set `quant()` to 5 classes; rebuild `#maplegend` (line 186) with numeric breaks + units + "No data" swatch. (§5)
12. `@media(max-width:640px)`: disable pan/zoom, hide `.zoomctl`, tap-to-select → `#miniback`. (§5)
13. Make `#miniback`/ficha a persistent readout (value + national percentile + source). (§5)

**P1 — the chart engine (fixes "lazy charts")**
14. Rewrite `exhibit()` → `(no, finding, subtitle, svg, src)`; add the 28×5px green tag; remove `svg.chart` border (line 123). (§4a, §4c)
15. Bump canvas sizes to 720×400 (line/dual/bar); horizontal bars `44+rows×32`. (§4b)
16. Add **value labels on bars** (extend `hbarChart` pattern to `barChart`) and **direct end-of-line labels** to `lineChart`/`dualChart`; delete `.leg` legends. (§4c, §4d)
17. Add the **unified hover crosshair + HTML tooltip** to line/dual/bar. (§4e)
18. Add **Chart⇄Table toggle** to Exhibits 3.1, 4.2, and the Outlook (reuse model.html pills). (§4f)
19. Grey out non-focus series; green = subject only; cap 6 colors. (§3)
20. Rewrite every exhibit title + section dek to takeaway-first (the 14 rewrites). (§8)

**P1 — the feeds table (fixes "hard to read")**
21. `data.html`: widen wrap 960→1120; remove `table.mck{min-width:820px}` scroll; rebuild to the **8 columns**, 6 owner bands, 48px rows, hairlines, no zebra. (§6)
22. `health.json`: add explicit `cadence`; split `vintage` vs `lastFetchedAt`; delete `cad()`. Drive status dot off **Next-due vs now**. (§6)
23. Add owner-type chips + license column + `⚠ Banxico — not open` flag; row-expand for citation/endpoint/catch. (§6)

**P2 — polish**
24. Apply the type scale (cap h1 clamp to 40px; set exhibit title 20px). (§3)
25. Add the McKinsey rhythm devices: low-contrast pull-quote between hairlines for long sections; tinted sans sidebar box for method/"about the data" notes. (research §McKinsey)
26. Add the blacklist lint over `index.html` strings; encode the title/dek rules in `SITE-SPEC.md`. (§8)
27. Full-content-width flagship exhibits on the `--paper-2` panel (McKinsey left-bleed). (§1)

**Files touched:** `index.html` (grid, TOC, scrollspy, exhibit engine, copy, Wire), `atlas.html` (map interaction, ramp, legend, mobile), `data.html` (8-col table), `data/health.json` (cadence/vintage/lastFetchedAt fields), `design/mckinsey-mx.css` (table + type tokens if shared), `SITE-SPEC.md` (copy law + lint).