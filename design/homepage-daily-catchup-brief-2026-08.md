# Design brief: The Mexico Brief homepage — "Daily" vs "Catch up"

Paste-ready prompt for a Claude design session. Written 2026-08-01. The design session decides; the build session implements what comes back.

---

## The product, in three sentences

The Mexico Brief (mexicobrief.com) is a personal daily brief on Mexico: official data, curated news from named outlets, and labeled opinion, in an Economist-adjacent, restraint-first visual language (paper background, mono small-caps labels, one green accent #0a7d4d, no photos, no decoration). The primary user is the owner, Alan: a payments founder who checks it every morning and wants everything he cares about on Mexico in one place, without noise. The site's soul is honesty: every number carries its date and source, generated content confesses its age, quiet days say "quiet" instead of padding, and the site never pretends to track the reader.

## The design problem

The morning reader has imperfect attendance, and that creates a three-way tension:

1. He visits daily and does not want to reread yesterday's page.
2. On a slow day, the site must not invent importance.
3. If a huge story broke Tuesday and he skipped Tuesday, Wednesday's visit must still surface it.

The current homepage solves this inside one flow (details below): a 48-hour "Key developments" block with pipeline-relative NEW badges (new = entered since the brief's own previous edition, never reader-tracking) plus a chip-selectable "last 7 days" archive below.

**Alan's hypothesis to explore:** split the homepage into two explicitly separated modes:

- **DAILY** — the brief (one synthesis paragraph + labeled "My view"), today's key stories, today's numbers. The two-minute morning read.
- **CATCH UP** — the top stories of the last week, per section. The surface for "I missed a day or three."

He is not sure this split is right ("idk" is a direct quote). Pressure-test it against the current single-flow version and recommend: full split, softer separation, or keep the current flow with better labeling. Then wireframe the recommendation.

## What is already settled — do not relitigate

- Seven sections, fixed order: Payments & fintech, Deals & investment, Economy & money, U.S.–Mexico (with a Mexico–China standing-theme rail), Politics, Security & society, Energy & infrastructure.
- The weekly layer is SELECTED, not scrolled: chips, one section's list on screen at a time, 5 visible then "Show more" to 10. Never seven stacked lists.
- Markets today and The week ahead both stay, as slim typographic lines (a one-line ticker; four dated agenda items), not card grids.
- The compiled daily digest (Key developments) is the spine of the product and must exist prominently.
- Briefly Explained (BE) accordion: Background / Drivers / Implications (+ optional What's next) rides on stories that have it. The BE button is a small "BE" mark.
- The clock contract: every block states what it is and when it updates ("Today · compiled each morning", "as of Jul 31 · updates each trading day", "Named outlets · Jul 25 – Aug 1"). Stale generated content shows a red confession, never silent decay.
- Newness is pipeline-relative (NEW badge + "N new since yesterday" count + honest "nothing new since yesterday" line). No reader tracking, no accounts, static site.
- No story thumbnails. Named outlets only in showcased slots; Google News discovery items never display as publishers. Quiet weeks/days say so.
- Fixed caps (loud weeks stay calm): daily digest ≤5; weekly per-section 5→10; theme rail 3.

## The current homepage, top to bottom (v3, ground truth)

1. Masthead + date + data-status line, then a one-line tagline: "Mexico's economic, political, security and business news, all in one place." (Settled copy; keep verbatim.)
2. **The brief**: kicker THE BRIEF, updated-stamp (+ red stale note past 48h), one synthesis paragraph, "My view:" line, source links.
3. **Glance block** (one bordered band): MARKETS TODAY ticker line (Peso, IPC, Cetes 28d, U.S. 10y, each with day-move, then "as of [date] · updates each trading day" and "All numbers →"); below it THE WEEK AHEAD line (four dated items: "Thu, Aug 6 · Banxico monetary-policy decision · in 5 days").
4. **Key developments**: header note "Today · compiled each morning · 3 new since yesterday" (or the nothing-new / stale variants), then ≤5 stories, each: section kicker + relative date + outlet, headline, one-line summary, NEW badge when new, BE accordion when context exists. Honest empty states.
5. **The last 7 days**: kicker + "Named outlets · [date range]" note, seven chips, one section list visible (5→10), each group ends with "Everything in [section] →".
6. Subscribe card.

Section pages (for context, not in scope): section header + scope line → "This week: the last 7 days" list (+ Mexico–China rail on U.S.–Mexico) → "The quarterly letter: the state of things, argued" → calendar → sources.

## Questions the wireframe must answer

1. **The separation.** If Daily and Catch up split: what marks the boundary (chapter heads, background shift, tabs, a toggle, separate routes)? What are the two labels, verbatim? If you recommend AGAINST the split, show how the current flow gets the same clarity with labeling/hierarchy alone.
2. **What lives in Daily.** Does the glance block (markets + week ahead) belong inside Daily? Does Key developments?
3. **What Catch up leads with.** Options to weigh: a 2–3 sentence generated "the week so far" summary (pipeline-written, staleness-gated, slot can be added); the chips directly; or a cross-section "top 5 of the week" before the chips. Pick one; say why.
4. **Attendance states.** Show the page for: (a) daily visitor, 3 new stories; (b) daily visitor, nothing new; (c) returning after 4 days away. State exactly what each reader sees first.
5. **Mobile.** Both zones at 375px. The morning read is often on a phone. Chips scroll horizontally today; keep or improve.
6. **Stale state.** Where the red confessions sit in the new structure so a pipeline outage degrades visibly but gracefully.

## Constraints

- Static Eleventy site, no accounts, no client-side personalization beyond a URL param (?topic= persists chip choice).
- Two-minute cap on the Daily read; Catch up can be as deep as the reader chooses.
- House visual language: type-led hierarchy, thin rules, generous whitespace, mono small-caps labels, single green accent, red reserved for staleness/negative moves. No new colors, no icons beyond the existing BE mark, no photos.
- Copy voice: plain, first person for opinion, no hype words, every claim dated. Section labels stay exactly as listed above.
- The wireframe is structure and hierarchy, not pixel polish: low-fi HTML or annotated boxes is right. Deliver desktop + mobile, exact block order, exact header copy, and one-line rationale per block.

## Deliverable

One recommended wireframe (desktop + mobile) plus, only if the call is close, one alternative. End with: the recommendation in one sentence, the three biggest risks of the recommended structure, and what should be measured or watched after shipping to know whether it worked (remember: the only user is Alan; "does he stop opening other tabs" is the metric).
