# The Mexico Brief — the weekly email (Fable decision, 2026-07-09)

Internal strategy doc. Excluded from the public snapshot.

## Decision in three sentences
The email is a weekly, sourced diff of Mexico's official numbers: what moved this
week, by how much, versus a year ago, and what the move does to the peso, prices,
rates, and growth. It is built for the non-Mexican professional who has money, a
budget, or a byline exposed to Mexico and no cheap way to assemble Banxico, INEGI,
Data México, and SESNSP themselves. Its one job: let that reader re-underwrite
their Mexico view in three minutes from primary sources, every Monday, without
trusting a pundit.

## Name
**What Moved: Mexico** (from The Mexico Brief). The name is the promise.

## Audience — one email, for outsiders. Do not segment.
The five outsider personas (EM allocator, PE site-selector, founder, FP&A manager,
journalist) all want the same object: the sourced diff plus consequence. Their
differences live in a future paid layer, not the free email.

The insiders (wealthy Mexican businessman, corporate employee) are accepted but
**not served**. Most of our content is noise to a Monterrey patriarch, and the one
thing he values is a paid-tier feature. You cannot write a sentence that both
explains Mexico to a Kansas PM and never explains it to him. Choose the PM.

Willing to NOT serve: Mexican insiders as a segment; the relocator's granular needs
(paid tier later); day-traders; people who want takes (the English Substacks own
opinion, and that is the corner our trust posture exploits).

## The wedge
**The free, English, reproducible weekly diff of Mexico's primary data, with the
consequence attached.** Every neighboring corner is occupied and each fails one
test: bank desks (gated, monthly), official sources (raw, Spanish-first, no so-what),
English Substacks (voice but no receipts, key-person risk), news aggregators
(events, not the macro diff). The center is empty because only an operator with our
data plumbing can sit in it. It earns the open because the diff engine makes it
never the same twice, and the promise is one no reader can self-serve: exactly what
changed in Mexico this week, in numbers you can forward to your boss without
re-sourcing. The forward is the growth loop.

## Product
- **Cadence:** Monday 06:00 ET, fixed. Under 900 words, a 3-minute read. Quiet week = shorter, and say so.
- **Structure:**
  0. **Subject + standfirst** — numbers in the subject, no clickbait. *Alan approves.*
  1. **The Board** — 6 metrics (peso/USD, CPI y/y, Banxico rate, rate gap vs Fed, exports y/y, homicides), each with level, week-over-week, 12-month, sparkline. *Zero-touch.*
  2. **What Moved** — the 2-3 biggest changes by z-score, fixed labels: WHAT MOVED / WHY IT MATTERS / WHAT'S NEXT. *Numbers zero-touch; the why-it-matters lines model-written from our numbers, Alan approves.*
  3. **Chart of the Week** — auto-ranked by surprise magnitude, 2-sentence caption. *Alan approves the pick.*
  4. **The Causal Receipt** — the external lever that actually moved (US rate, oil, US demand), run through the model: modeled direction and rough magnitude on peso/inflation/rate/growth. Always "modeled, not a forecast." *One framing sentence approved.*
  5. **What to Watch** — next Banxico decision, next INEGI prints, US data that moves the peso, with days-to-go and survey consensus. *Zero-touch.*
  6. **From the Trusted Press** — 4 links, POINT format (headline, source, date, one neutral line), de-duped. *Zero-touch.*
  7. **Pulse** (conditional) — homicides or poverty, only in weeks a new official print landed. *Zero-touch, event-gated.*
- **Subject logic:** top two movers as bare numbers plus the scheduled event, e.g. "Peso 18.63, core inflation 4.05%, Banxico decides Thursday." No drama verbs, ever. The one string worth a human glance every week.

## Productization / approve-and-send
Sunday 22:00 job: snapshots the board, diffs vs the stored prior-issue snapshot,
ranks movers by z-score (min-observation + min-move floors so a glitch never
headlines), picks the chart, detects the biggest lever move and runs the causal
model, pulls the calendar, ranks and de-dupes the news. One model call writes the
small prose surfaces, strictly from the JSON. It renders the complete issue to a
one-screen approval. Monday 5:30 Alan reads 3 minutes, edits any highlighted string
inline, presses **Approve & Send**. No compose step, ever. If he does nothing, it
does not send.

- **V1 now:** Board, What Moved, Chart, What to Watch, Trusted Press POINT, event-gated Pulse, the diff snapshot store, the approval screen. All deterministic over data already wired.
- **Additive later (on a trigger):** Receipts scorecard (named forecasts vs actual prints — add after ~8 issues once there is history to score); State/Sector spotlight (when demand shows); paid tier (scenario sandbox, alerts, API, sector cuts — only after open rate proves the audience).

## Kill list
Daily cadence; news summarization as a standing feature (POINT only, never SUMMARIZE
in v1); any voice/banter/persona; the full 12-metric board (6 is a briefing);
evergreen "structural fact of the week"; standing weekly homicide/poverty sections
(event-gate them); point forecasts; segmented editions; relocator neighborhood
tooling in the email.

## Riskiest assumption + cheapest test
**That a voiceless, auto-generated numbers email earns a repeat open.** Every
indispensable newsletter in the evidence except Chartr rides a trusted human voice.

**Test before building the pipeline:** hand-assemble 4 consecutive weekly issues
from the already-baked JSON (a few hours each), send to 40-60 hand-recruited people
matching the five personas, and measure two things: the issue-4 open rate among
issue-1 openers (target above 60%), and any unprompted forwards. Four weeks, near-
zero code. If issue-4 opens hold, build the pipeline knowing the product works.
