# Site redesign ruling (Fable, 2026-07-12)

Internal planning doc, not deployed. Full ruling from the verify+rule workflow.

# FABLE RULING — Mexico Brief feedback bundle (2026-07-12)

Decisions are final unless the named reversal trigger fires. Everything here is buildable by Opus solo, no new dependencies, design stays locked.

---

## 1. Section-page template + component library

**Canonical section page — this exact block order, all 8 topic pages, no exceptions:**

1. `Hero` — eyebrow · short-label H1 · dek · "as of" date
2. `Board` — "The numbers now" tile grid
3. `Background` — exhibits + storyBlocks (the explained story)
4. `Watch` — "What to watch" calendar of record (future-dated only)
5. `GoDeeper` — tools, source receipts, and cross-links (replaces "Tools & sources")

**WHAT/NOW/NEXT: KILL.** Alan finds it confusing and the audit proves why: it is a fourth orientation layer that restates the hero above it and the board and calendar below it. Do not rework it into new furniture. Fold each row into its rightful home:
- WHAT → becomes the dek. The dek IS the section's story sentence.
- NOW → dies. The board is the now. To make this clean, standardize the H1 to a short label (2–4 words: "Money", "Security", "U.S.–Mexico") per my own CSS ruling, and let the headline stat live exactly once, in the dek.
- NEXT → one line hung off the Board header: "Next: Banxico rate decision, Aug 7." Not a labeled block.
- Delete `pageIntro()` from mb.js when the last caller is gone.

**H1/dek law:** H1 = short label. Dek = one sentence, one dated fact, VOICE-compliant. Example (security): "Mexico's homicide rate fell to about 26 per 100,000 in 2024, from 29 in 2018."

**The story model (Alan's item 3) — four layers, identical on every section page:**
- **L0 The story:** the dek. One sentence a checker can mark true or false. Every section page must have one; if Opus cannot write it, the page is not ready.
- **L1 The evidence:** the Board. The 3–6 numbers that carry the story.
- **L2 The context:** Background exhibits + storyBlocks. Each exhibit answers one question the board raises.
- **L3 Go deeper:** the `GoDeeper` block. Fixed slots: (a) Atlas drill link where geographic ("See this state by state → Atlas"), (b) the relevant Read dashboard ("Our read → The Read"), (c) source receipts with series IDs, (d) The Model where applicable. This is the "3 layers lower" — it is links to depth we already built, not new content.

**Component library (Alan's item 2) — formalize, then delete every inline copy:**
- Move the ~150-line inline `<style>` into `mckinsey-mx.css` (one `/* section pages */` region). Highest-value single win. Kill the dead `max-width:22ch` selector, the `--amber2` fork (use `--amber`), and unify `.fwdline` padding.
- `Hero` → Nunjucks partial `_includes/partials/section-hero.njk` (params: eyebrow, title, dek, asof).
- `renderBoard(tiles)` + ONE `tile()` in mb.js — collapse the four forks (money `tile`, two `ctile`s, politics inline, security inline). Board grid: `repeat(3,1fr)`, everywhere.
- `renderWatch(section)` in mb.js — kill the 5 copies. One kind→color table; resolve the political/election conflict as **red** (homepage wins). Render future-dated events only; past events drop automatically.
- `GoDeeper(links, srcnote)` → partial, replaces the 6 hand-copied tools blocks.
- `SECTION_FILTERS` — one exported section→regex map in mb.js; homepage and sections import it.
- `bootAsOf()` — one shared boot helper.
- Promote economy's chart primitives (`stack100`, `divBar`, `dualLine`, `ranked`, `dumbbell`) into mb.js as part of the one chart grammar, then re-express economy on the canonical template (hero → board [its heroband becomes the board] → background → watch → GoDeeper). Trade gets Watch and GoDeeper back.
- Exhibit numbering: adopt economy's auto-sequence (1, 2, 3 per page). Delete all "3.1"/"8.2"/"Vital signs" hand numbers.
- Move `.factcard`, `.honesty`, `.teaser`, `.constr-lite`, `.heroband`, `details.more` into shared CSS.
- Fix the committed `</content></invoke>` garbage at `society.njk:413`.

**Reversal trigger:** if Alan rejects short-label H1s on sight, NOW returns as the single home of the headline stat and the dek shrinks to scope only. One or the other, never both.

## 2. Atlas

**Keep the hand-rolled SVG. REJECT Leaflet/D3/MapLibre/tiles.** The viewBox foundation is exactly right for everything Alan asked for; a map library is over-built for one country, two levels, zero external hosts.

Build, in order:
1. **Kill the jump (trivial):** guard the `scrollIntoView` at `atlas.njk:304` to fire only when the ficha is offscreen; reserve fixed height for `#statesum` and `#crumb` so state clicks stop reflowing the map.
2. **Animated zoom:** ~30-line rAF tween on the four viewBox numbers, honoring the existing `RM` reduced-motion flag. Country↔state glides instead of snapping.
3. **Zoom buttons + drag-pan:** +/− controls and pointer-drag pan via viewBox math (~40 lines). Persistent, always-visible reset ("See all Mexico") in country view too, not only after drilling. Wheel/pinch: DEFER.
4. **Hover:** keep the tooltip; make state labels (`" .stlabel"`) trigger the same tooltip on hover (pointer-events on labels currently pass to nothing).
5. **Spelling:** normalize the 3 prose lines (`atlas.njk:110, 237, 282`) to American "color". Do NOT touch `currentColor` or the HS4 trade nomenclature in `exports-hs4.json` (official names; changing them desyncs the source).

**The Atlas's single use case, stated on the page:** *answer "how does this place compare?"* Pick any state or municipality and see where it stands against the other 31 states or the national line, with the source attached. Every Atlas feature must serve that question; anything else (layers, time sliders, routing) is out of scope.

DEFER: mobile tap-tooltip/bottom sheet (trigger: mobile traffic evidence), metric persistence when drilled (trigger: after 1–3 ship and muni-level data exists for a second metric).

**Reversal trigger:** adopt MapLibre only if the Atlas ever needs tiled basemaps or >2 geographic levels with time series.

## 3. Brief vs The Read

**Adopt A + B + C from the audit, together.**
- **Nav (top level, in order):** **Brief · The Read · Topics · Atlas · Sources · Subscribe.** About moves to footer only. The Read leaves Topics→Lab; The Model stays in Lab.
- **Brief = facts only.** Strip the interpretive "context" from `renderBrief` items. Each item: what happened, dated, linked to source. Nothing a checker can't verify.
- **The Read = the dated analysis column.** Restructure `/the-read.html`: dateline + "What we're seeing" entries at top (newsletter-in-website-form, fed from the same curated store), the five standing dashboards below as the evergreen backbone, Receipts at bottom. Delete the dead `.wire` CSS (`theread.njk:140–150`).
- **Signposting, exact copy (both pass VOICE):**
  - Brief header line: *"The facts, each dated and linked to its source. The interpretation lives in The Read."*
  - Read keeps its disclosure box, plus: *"Just the numbers? They live in the Brief."*
  - Fixed pair used everywhere: Brief = "The facts". Read = "Our read". Standardize the trade.njk "Go deeper → The Read" card as the cross-link component.

**Reversal trigger:** if Alan cannot sustain the dateline rhythm for 2+ weeks (solo bandwidth), The Read collapses back to evergreen dashboards and the Brief carries one labeled "our read:" line per item. Watch this honestly; a stale newsletter is worse than none.

## 4. Live-link / staleness policy (repo-wide rule)

**The rule Opus enforces:** *An external, dated third-party link (news outlet, headline) may render in exactly two places: the Brief (homepage `#brief`) and The Read. Topic/section pages are evergreen: official series, exhibits, and the forward calendar of record only.*

- Delete the `#latest` / `renderDevelopments` blocks from money, politics, security, society, usmexico (this also fixes economy-has-news-but-no-block and society's permanently empty block). `happening.json` feeds the Brief and Read only.
- The Watch calendar stays on section pages (it is a calendar of record, not news) but renders future events only.
- Optional cheap enforcement: a build-time grep that fails if `happening.json`/`renderDevelopments` is referenced outside index/theread. Add it; it is 5 lines.

## 5. Sources architecture

**IA: ONE page, one URL. REJECT** the /sources + /sources/status split and the sticky-tabs variant — inventory machinery for 43 feeds. **ADOPT** issues-first ordering (flagged/skipped rows float to top).

**Adopt (the four trust-critical fixes plus the light wins):**
1. Registry-driven truth: replace the hand-typed "27" with rendered `h.sources.length`; fold the 16 orphan Banxico series into `SRC_META` (or auto-derive owner from the source string) so "Other sources" is empty and dies.
2. Fix the 3 dead links (World Bank root → a real human destination, OpenSky doc path, Banxico oil page) and add a link-checker that flags 404 but ignores 403/timeout.
3. Reword the overclaim at `sources.njk:1071` to the truth: *"94 of the 97 catalog entries link to their source. Three proprietary series (EMBI+, sovereign CDS, mobility) have no public link."*
4. One new column, **"Data through"**, from the registry's unused `vintage` field. Rename the retrieval column **"Last checked"**. REJECT "publisher released" (not tracked) and defer "next expected".
5. Status in words: Current / Update expected / Fetch issue / Paused. “Update expected” is neutral: it does not guess whether the publisher or our connector caused the delay. Color stays; words carry the meaning.
6. Series ID as a mono tag per row (the SIE/SR codes already in the registry strings). This is the one thing a reader cannot reconstruct elsewhere.
7. Drop the A–G letters; keep the grouping and hierarchy with plain labels, e.g. *"Mexican official, the core"* / *"International official"* / *"Market and proprietary estimates"* / *"Reporting and analysis"*. Opus relabels all 7 in this register (plain-factual, no letters, no adjectives).
8. Mobile: give the live-status table the card collapse the catalog already has at ≤600px.
9. **Indirect sources (Alan's item 7): ADOPT as a tier, not a mix.** One new evidence-type tag on every entry: `primary data` / `official-derived` / `reporting & analysis` / `proprietary estimate`. Hard rule printed on the page: *"A reporting source can contextualize a figure. It is never the sole origin of one."* The 3 unlinked entries get `proprietary estimate`, so they read as intentional.

**REJECT as inventory-for-its-own-sake:** the six-field provenance schema per row; faceted search/filters (97 rows, Cmd-F works; revisit past ~300 rows); chart↔source bidirectional backlinks (best idea in the audit, real project, DEFER with trigger: after the component library lands and stabilizes).

**The external audit's prose ships nowhere.** Findings in, wording out — every visible string rewritten under VOICE.

## 6. Voice mandate

**Approved rewrite: Candidate A**, pending number-binding:
> "The USMCA stays in force but now comes up for review every year through 2036. It governs about $840 billion in annual two-way trade, roughly 80% of Mexico's exports, most of it autos and manufactured goods."

Bind $840B, 80%, and the 2036 review mechanics to dated primary sources before shipping. If a number cannot be bound by ship time, ship sentence 1 alone. "$1.8T" never returns; it was GDP mislabeled as the trade relationship.

**Enforcement rule (permanent):** every new or changed user-facing string passes the five VOICE checks before commit: (1) dated number inside a real clause, (2) checkable true/false, (3) one idea per sentence with periods between clauses, (4) no em-dash, lists only when 3+ items each carry a number, (5) no persuasion adjectives, no financial-metaphor jargon, no sentence that exists to sound good. Any external review's prose (this audit included) is treated as findings, never as copy. If a sentence cannot be marked true or false, it does not ship.

## 7. Build sequence

**Phase 1 — trust hotfixes (do first, one sitting):** 3 dead source links · "27" → rendered count · reword sources.njk:1071 · colour→color ×3 · Atlas scroll-jump guard + statesum height reserve · society.njk stray tags · watch kind-color conflict.

**Phase 2 — Brief/Read split (Alan's clearest ask):** nav promotion + About→footer · strip `#latest` from 5 section pages · Brief facts-only trim · Read dateline restructure + signpost copy · staleness grep check.

**Phase 3 — component library + canonical template:** shared CSS extraction · Hero partial · kill WHAT/NOW/NEXT + short-label H1/dek law · one tile/renderBoard · shared renderWatch · GoDeeper partial · SECTION_FILTERS + bootAsOf · exhibit auto-numbering · economy folded onto the template (its charts promoted into mb.js) · trade regains Watch/GoDeeper.

**Phase 4 — Sources rebuild:** registry-driven grouping · Data-through column · status words · series-ID tags · evidence-type tier + tier rule copy · plain group labels · issues-first ordering · mobile cards · link-checker in the pipeline.

**Phase 5 — Atlas interactivity:** viewBox tween · +/− buttons + drag-pan · persistent reset · label hover.

**DO NOT BUILD (rejected or deferred, with triggers):** two-URL Sources split (rejected) · six-field provenance schema (rejected) · faceted source search (trigger: ~300 rows) · chart↔source backlinks (trigger: post-Phase-3 stability) · any map library (trigger: tiles or >2 geo levels) · wheel/pinch zoom (trigger: demand) · Atlas mobile bottom sheet (trigger: mobile traffic) · metric persistence in drill (trigger: second muni-level metric) · "next expected"/"publisher released" clocks (rejected/deferred) · WHAT/NOW/NEXT in any reworked form (rejected).

## 8. Reversal triggers per major call

- **Kill WHAT/NOW/NEXT:** reverses only if Alan rejects short-label H1s; then NOW survives as the sole home of the headline stat.
- **Hand-rolled Atlas over a map library:** reverses if the Atlas ever needs tiled basemaps, >2 geographic levels, or time-sliding choropleths.
- **The Read as dated newsletter:** reverses if Alan can't feed it for 2+ weeks; falls back to evergreen dashboards + one "our read:" line per Brief item.
- **News links only in Brief/Read:** exception path if a section needs dated context (election week): a dated Read cross-link card on the section page, never raw external links.
- **One Sources page:** reverses past ~300 catalog rows or a second maintainer.
- **Candidate A rewrite:** swaps to Candidate B only if the $840B two-way-trade figure can't be bound but the component figures can.
- **Voice mandate:** no trigger. It is law.
