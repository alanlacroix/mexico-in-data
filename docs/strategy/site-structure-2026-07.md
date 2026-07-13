# The Mexico Brief — site structure & About (Fable decision, 2026-07-09)

Internal strategy doc. Excluded from the public snapshot. Execution spec for the restructure.

## Decision in three sentences
Keep the hub-and-spoke shape: one Briefing cover as the front page, four rooms
behind persistent tabs, plus a new About page. The Briefing's top becomes a fixed
five-slot cover that never reorders: masthead, a three-sentence "what this is," a
dated "What changed" strip, the metric board, and a jump-nav into the twelve
questions (which convert from a forced scroll into anchored sections, the plain
answer line always visible, the exhibit one tap below). First-timers and returners
are served by different permanent slots on the same page, and the weekly email
mirrors the "What changed" strip.

## Top-level structure
**Hub-and-spoke with persistent tabs.** Every credible reference (Atlas, OWID,
Trading Economics, FRED) converges on it.

**Nav, same on all pages:** `Briefing · Economy · Model · Atlas · Sources · About`
+ the status pill (`● N sources · updated Xh ago` → Sources) on the right.

- No rooms merge (Economy = composition, Model = causation, Atlas = geography).
- **"The Wire" leaves the nav.** It lives once, as a section of the Briefing. The "Latest" strip dies and is replaced by "What changed" (a returner asks "what moved," not "what did other outlets publish").
- Footers match the top nav exactly ("Sources" everywhere, never "Data health"; Economy in every footer).
- The Briefing is the only front door (no router cards yet).

## The one-time visitor — fixed top-of-cover order
1. Masthead + H1 + dek.
2. **"What this is" block: three sentences, always open** (copy below), with a "How this works →" link to About. Fixes the core gap: today nothing says what the site is until the footer.
3. "What changed" strip (returner slot; a first-timer reads it as proof of life).
4. The metric board, with the "How to read this page" stamp key moved to sit **directly above** it. Instructions before dials.
5. The Q1–Q12 contents grid, then the questions with answer lines visible, exhibits expandable.
6. "New to Mexico? five things" moves **up** to right after the What-this-is block, collapsed.

## The repeat visitor — the retention spine
**The "What changed" strip**, pinned between the What-this-is block and the board:
- 3–6 dated items generated deterministically from the same 6-hour JSON bake, over a **fixed weekly window** (since last Monday), identical for everyone. Example: "Jul 3 · Banxico held at 8.00% (was 8.25%)." Each item anchors to its metric row or question.
- **The weekly email is the same strip**, verbatim, with deep links to the anchors. One generator, two surfaces. The email is the saved-state substitute a static site cannot offer; the strip is where the email lands you.
- Stable skeleton (same board, tile positions, Q order every visit) so returners navigate by muscle memory and read change in place.

## The About / "What is The Mexico Brief"
Lives in **both** places: the three-sentence block atop the Briefing, and a full
About page as the last nav item. Ban list for this page: trusted, leading,
authoritative, definitive, go-to. Mission is one flat sentence; the method carries
the belief.

**Cover block (top of Briefing):**
> The Mexico Brief is a free public briefing on Mexico, built from official data for people who need to understand the country from the outside. Every figure comes from a first-party source such as INEGI or Banxico, is dated, and is one tap from where it came from. It refreshes every six hours and nothing on it is invented. **How this works →**

**About page (full copy):**
> ## What is The Mexico Brief
> The Mexico Brief is a free, public briefing on Mexico's economy and conditions, built from official data. It exists for people looking at Mexico from the outside: investors, journalists, people moving here, and anyone who wants the actual numbers in one place instead of scattered across a dozen institutional websites.
>
> ## Why it exists
> Most people outside Mexico form their view of the country from headlines. The official record is public, but it lives in separate portals, in Spanish, behind unfamiliar interfaces. We believe people make better decisions with real information, so we put the record in one place and keep it current.
>
> ## Where the numbers come from
> Mexico's own institutions: INEGI, Banxico, SHCP, CONEVAL, and others, plus international bodies where they are the primary source. The Mexico Brief renders official data. It does not originate it.
>
> ## How we handle the data
> These are the rules the site runs on, and they are checkable on every page:
> - Nothing is invented. If a number cannot be verified, it is not published.
> - Every figure is official, dated, and one tap from its source.
> - When a feed fails, we show the last valid value and mark it as stale. We never fill the gap ourselves.
> - Forecasts are named and dated. The causal model is labeled MODEL, because that is what it is.
>
> ## How it stays current
> The data refreshes every six hours. We are always adding new first-party sources; when one goes dark, you see the last good number and the date it stopped, not silence.
>
> ## What this is not
> Not opinion, not investment advice, not affiliated with any government or party, and not written by an AI at read time. The page you are reading was built from the sources it cites.
>
> ## Check us
> Every figure links to its source. If you find an error, tell us and we will correct it with a note.

## Sequencing
**Now (durable spine, one pass):**
1. Nav + footer unification across all pages, one label set, status pill everywhere.
2. About page + the three-sentence cover block.
3. Cover reorder: What-this-is → primer (collapsed) → What-changed strip → stamp key → board → contents jump-nav.
4. "What changed" weekly strip from the existing bake; kill the "Latest" strip; The Wire out of the nav.
5. Q sections: anchored, answer line always visible, exhibit collapsible.

**Later (additive, on a trigger):** per-visitor "since your last visit" via localStorage; Atlas-style "start here" router cards; per-metric drill-down pages. Nothing above needs a backend change beyond one new baked JSON field for the weekly strip.

## Riskiest assumption + cheapest test
**That weekly returners exist at all, and the changed-data strip plus email brings
them back.** Test: hand-write the "What changed this week" email for 4 weeks to
15–20 hand-picked people, each item deep-linking to a Briefing anchor. Measure
opens and clicks through to the site. This converges with the email decision's test.
