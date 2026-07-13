# THE MEXICO BRIEF — DRIFT-PROOF SCAFFOLDING AUDIT PLAN
*Fable ruling draft, 2026-07-12. For Alan to redline. Planning only — a later Fable pass directs Opus to build it.*

---

## 1. VERDICT: the rules exist, the scaffolding doesn't

The site has already drifted. The 7 topic pages run on 2 different skeletons; 975 lines of CSS are copy-pasted across pages that should share ~150; `renderWatch` exists as 6 identical copies; trade and usmexico each invented their own tile function; economy is a bespoke page sharing almost nothing. Of the ~10 shared components this week's redesign ruling mandates, 0 exist. Of the 5 build-breaking checks the visual-grammar rule mandates (`pipeline/assert.js`, `pinned.json`), 0 exist. There's even a `</content></invoke>` garbage string committed live in society.njk — the exact thing a lint gate catches.

What IS strong: the laws. VOICE.md, visual-grammar.md, the brief rubric, the copy skill, the redesign ruling — all written, all good. But they're scattered across ~20 docs in 5 directories, two docs both claim to be the tone law, and the page-structure law lives in a doc explicitly marked "not deployed." What holds the site together today is manual discipline plus one shared chart library. That's not scaffolding; that's habit.

**Your Supabase question, plainly:** Yes, you have a Supabase database. It's private and optional — it stores two things only: raw captured news articles (so links can rot without losing the source) and a history of every data revision (so "The Read" can say what changed). **The site never reads from it.** The site reads flat JSON files committed to the git repo; every push redeploys. That is the correct architecture for a solo static site and we should not change it. You do not need another database, and you should not move site data into Supabase. Committed JSON in git IS your database — it's versioned, auditable, and free.

**Your scaffolding instinct: correct, with one addition.** A component/scaffolding model is exactly right. But scaffolding = template + shared components + **enforcement**. Rules that live in docs don't stop drift; builds that FAIL when a page breaks a rule do. Everything below is those three things.

---

## 2. THE SCAFFOLDING MODEL — one template, pages become data

**Confirming your suspicion: the 7 pages do NOT share one structure today.** Six share a legacy 7-block layout (including two blocks this week's ruling ordered deleted); economy is its own thing.

The target — one section template, six slots, in this order:

```
HERO        — H1 + dek (the one-sentence story)
STORY       — the standing-context block (slow, monthly) ← your idea, ruled on in §4
BOARD       — the live number tiles
BACKGROUND  — the exhibits (charts, from the closed vocabulary)
WATCH       — what to watch next
GO DEEPER   — sources + related pages
```

All 7 pages (Economy, Trade, Money, Politics, Security, Society, US-Mexico) use this template with zero exceptions. Pages contain **no layout code, no CSS, no functions** — each page is one config file listing: which series feed its tiles, which exhibits it shows (chart type + series id + note), its story text, its watch items. The shared library (`mb.js` + one CSS file) renders everything.

**What "adding data" looks like once built:** a new metric = (1) connector writes `data/series/new-metric.json`, (2) one entry added to a section's config. No HTML, no CSS, no new functions, ever. A whole new topic page = one config file. That's the "just add data" you asked for — and it's realistic, because the chart engine and formatters already exist; what's missing is the page layer on top.

---

## 3. THE SOP SET — six one-page rules an agent reads

These live in one manual (§6). Each is a page, not a treatise.

**SOP-1 DATA.** Storage: JSON-in-git is the ledger; Supabase stays private/optional/fail-soft; Beehiiv holds subscribers and sends the email. Pull cadence — codify what already runs, it's right:

| What | Cadence | Who |
|---|---|---|
| All numbers (macro, trade, fuel, news wire) | Every 6 hours | Deterministic code, no model |
| Insights: homepage brief, "happening," 7 area blurbs | 4×/day, 40 min after numbers | Model, reads finished numbers |
| The Read (weekly analysis) | Monday, **draft** — Alan publishes | Model drafts, numbers re-validated |
| Email issue | Built Saturday, **sent only by hand** | Model drafts, Alan gates |
| Standing-context story | Monthly review (§4) | Alan gates |
| IMSS employment | Monthly (~8th) | Deterministic |

The governing rule: **insights never refresh more often than the numbers under them, and never precede them.**

**SOP-2 STRUCTURE.** The template above. Iron rule: if a page needs something the shared library doesn't have, the component goes into the library and the manual — or it doesn't ship. No inline `<style>`, no page-local functions. Enforced by lint (§5), not goodwill.

**SOP-3 WRITING.** VOICE.md is the only voice law. The mexico-copy skill enforces it; BRIEF-RUBRIC governs story *selection* (what makes the brief), not style. Conflict to resolve: DESIGN-SYSTEM.md also claims to be "the tone law" — strip its tone sections, demote it to a CSS-token reference pointing at VOICE.md.

**SOP-4 LAYOUT.** visual-grammar.md is the law (closed chart vocabulary, fmt registry, color meanings). Already ruled; needs only its enforcement built.

**SOP-5 LLM BOUNDARY.** You said "The Read and the Brief are the only LLM analysis" — close, but the true count is **five** touchpoints, all editorial: happening, brief, the 7 area blurbs, email story-scoring/summaries, The Read. All read finished numbers; none produce a number; all fall back to deterministic output if the API key is absent. **Ruling: freeze this as a closed list of five.** Adding a sixth LLM touchpoint requires a Fable ruling — write that sentence into the manual. The number path (source API → connector → validation → JSON → site) stays 100% model-free. Confirmed by code audit: it already is.

**SOP-6 EMAIL.** Saturday 9am CDMX, the pipeline builds a draft (`email-preview.html` with a draft banner). Nothing sends on any schedule. You review it, run `prepare-beehiiv-review` for the exact week, and enter the package in Beehiiv. Beehiiv sends the test and the final email only after you approve the delivered test. The GitHub workflow has no provider secret and cannot send. Cadence: one issue per week, sent when you say so. Site copy must promise only that cadence.

---

## 4. THE STANDING-CONTEXT "STORY" BLOCK — ruled: yes, hoist it, with one condition

Good news: the component already exists (`storyBlock()` in mb.js, live on 6 of 7 pages; economy has an unmigrated inline twin). It's hand-written, updates monthly-ish, exactly the slow-context block you love.

Today it sits at the *bottom*, below the numbers. You want it at the top. My own ruling this week put only a one-sentence dek on top and kept the full story below. **I'm amending that ruling: the story moves up — Hero → STORY → Board.** First-principles reason: a first-time reader needs orientation before numbers; a returning reader skips one block. Your instinct as user #1 outranks my ordering preference.

The condition: **the block's numbers must be computed from the live series, not hand-typed, before it moves up.** Right now the story has literals like "+1.4% in 2024" baked into HTML. Below the board, a stale literal is embarrassing; above the board, it can visibly contradict the tiles two inches under it — a trust kill on a trust-first site. So: bind numbers first (already tracked as task #26), then hoist.

Rules for the block:
- **Cadence:** reviewed monthly, rewritten when the story actually changes (quarterly-ish). Never touched by the 6-hour or daily cycles.
- **Authorship:** model-drafted on a monthly trigger, **Alan approves before it ships** — same gate pattern as the email. Until that trigger exists, it stays hand-written; both are fine, the gate is the invariant.
- **Honesty:** every block carries a visible "as of" stamp plus an internal `review_by` date; the build warns when a story passes ~100 days unreviewed. Numbers computed, dates stamped, staleness flagged — that's how it stays honest sitting on top.

---

## 5. WHAT YOU DIDN'T ASK FOR (and need) — right-sized for one person

1. **Enforcement over documentation.** The single biggest gap. Build the 5 assertions in visual-grammar §8 (`assert.js` + `pinned.json`) plus one page lint: no inline `<style>`, no page-local render functions, template slot order intact. Drift stops when the build fails, not when a rule exists. This also would have caught the committed garbage in society.njk.
2. **Staleness policy.** Last-good fallback exists (a failed pull keeps the previous value — good). Missing: the reader-facing rule. Ruling: every tile already shows its vintage; add "if a source is >2 cycles stale, the stamp turns visibly amber; if >30 days, the tile says so in words." Never silently show old numbers as fresh.
3. **A change log for the laws themselves.** One dated line per ruling at the bottom of the manual. Without it, in 6 months you won't know which rule is current — that's how the two-tone-laws conflict happened.
4. **Ownership line on every SOP.** Alan approves content (email, Read, story); Fable owns rulings (structure, boundary, cadence changes); Opus/agents execute to the manual. One line each; kills "who decides this?" drift.
5. **A new-metric intake checklist** (source, license, cadence, connector, series file, page slot) so adding data is a 6-step checklist, not improvisation.
6. **What NOT to build** — flagging over-engineering preemptively: no CMS, no site data in Supabase, no staging environment, no pipeline dashboard (the GitHub-issue-on-failure alert is enough), no subscriber database (Beehiiv owns it). You're one person; every system you add is a system you maintain.

---

## 6. CONSOLIDATION — yes: one constitution, `docs/MANUAL.md`

One entry-point document every agent reads first. It **indexes and arbitrates**; it doesn't duplicate the laws. Table of contents:

```
0. Precedence — this manual > the named laws below > everything else.
   Any doc not named here is historical. (Kills the 20-doc scatter in one line.)
1. What this site is (one paragraph) + the trust doctrine
2. DATA        — storage, cadence table, staleness rules          [inline, 1 page]
3. STRUCTURE   — the template, slots, component index, intake     [inline, 1 page]
4. WRITING     — points to VOICE.md + mexico-copy skill + rubric  [pointer]
5. LAYOUT      — points to visual-grammar.md                      [pointer]
6. LLM BOUNDARY — the closed list of 5; adding one = Fable ruling [inline, ½ page]
7. EMAIL       — build → review → hand-send; weekly               [inline, ½ page]
8. STORY BLOCK — cadence, gate, honesty rules                     [inline, ½ page]
9. ENFORCEMENT — what breaks the build
10. CHANGE LOG — dated rulings
```

Where existing docs go: **VOICE.md and visual-grammar.md stay** as referenced laws. **The redesign ruling folds into §3** (it was planning, now it's law). **DESIGN-SYSTEM.md is demoted** to a CSS-token reference. **SITE-SPEC, REDESIGN-SPEC, PRODUCT-BIBLE, ECONOMY-SPEC and the older strategy docs move to `docs/archive/`** with a superseded header. The copy skill gets one line pointing at the manual.

---

## 7. IMPLEMENTATION PLAN (for the later Fable→Opus pass — nothing starts now)

**Already done this week:** type ramp · voice doctrine + mexico-copy skill · visual-grammar law · redesign ruling · Sources page rebuild. Roughly half the *law* is written; near-zero of the *scaffolding* is built.

- **Phase 0 — The manual + cleanup** (a day). Write MANUAL.md, archive superseded docs, strip DESIGN-SYSTEM tone claims, fix the "three emails a week" copy, delete the society.njk garbage. Pure text, zero risk, and every later phase is executed against it.
- **Phase 1 — The template + component library** (the big one, ~2–3 sessions). Extract the 975 inline CSS lines into the shared stylesheet; build the section partial + single renderBoard/renderWatch/GoDeeper in mb.js; migrate the 6 legacy pages; fold economy in. This is the redesign ruling's build, unchanged. **Highest-leverage single move in the whole plan** — it turns 7 drifting surfaces into 1.
- **Phase 2 — Enforcement** (~1 session). assert.js + pinned.json + the page lint, wired into the build so violations fail CI. Do this immediately after Phase 1, while everything is freshly conformant.
- **Phase 3 — The story hoist** (~1 session). Bind story numbers to computed series (task #26), add the STORY slot, add the monthly draft→approve trigger.
- **Phase 4 — Nothing.** The email gate, the data cadence, and the LLM boundary are already correct; they just get codified in Phase 0.

Sequence logic: the manual makes Phase 1 executable without re-briefing; Phase 1 makes Phase 2's checks meaningful; Phase 2 locks the door before Phase 3 puts prose above the numbers.

---

## 8. THE ONE DECISION I NEED FROM YOU

**Ratify the slot order: `Hero → Story → Board → Background → Watch → Go Deeper`.** Every phase builds against this spine, and changing it after Phase 1 means re-touching all 7 pages — it's the closest thing here to a one-way door. Note it amends my own 2026-07-12 ruling by hoisting your story block above the numbers.

Two small confirmations while you're redlining: (a) email promise — weekly, and we fix the "3×/week" copy? (b) story authorship — model-drafts monthly, you approve, same as the email?

Redline anything above; on your sign-off the next Fable pass hands Phases 0–3 to Opus.
