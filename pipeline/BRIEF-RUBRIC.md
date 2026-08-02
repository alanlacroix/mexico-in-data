# The Brief — selection rubric (Fable ruling 2026-07-12)

The homepage Brief is the daily glance: **3–5 of the most important things in Mexico right now**, each summarized and linked to its source. The count follows the news. Never pad the page.

## How to score an event

Every candidate event in `data/happening.json` gets an `importance` from **0 to 10**: score it **0, 1, or 2** on each of the five criteria and add them up.

1. **National consequence** — does it change policy, the economy, or daily life for Mexico broadly? (2 = national; 1 = a sector or one state; 0 = one company)
2. **US–Mexico stakes** — tariffs, USMCA, remittances, migration, security cooperation. (2 = central; 0 = none)
3. **Model impact** — does it move or explain a board number (peso, inflation, rate, growth)? (2 = moves one; 1 = related; 0 = no)
4. **Durability** — will it still matter in 30 days? First report of a real change scores; commentary and re-reports score 0. (2 = lasting; 0 = noise)
5. **Officialness** — is a primary/official source available (Banxico, INEGI, DOF, SHCP, USTR)? (2 = official; 1 = official-ish/press; 0 = rumor)

## What ships

- **Threshold: importance ≥ 5.** Only events at 5+ are eligible.
- **Cap: 5.** Never more, even on a huge day.
- **Floor: 3 (soft).** If fewer than 3 clear the threshold, ship what clears it. Never pad to a count.
- **A fourth or fifth item must earn the extra space.** It needs importance ≥ 6 or a direct match to the stated interest list. A routine importance-5 item does not fill an empty slot.
- Two reports about the same meeting or decision use one slot and retain both source links.

## Where the context comes from

The visible summary is factual and comes from the linked report. Only the three key developments can open **Briefly explained**, which has a stricter contract:

- **Background:** the structural fact a newcomer needs, drawn from the report, related reporting, and the site's sourced standing facts.
- **Our view:** a narrow judgment tied to a concrete mechanism or tradeoff. This is analysis, not reported fact.
- **What we're watching:** a specific expectation or observable condition that would confirm or weaken the view.

Briefly Explained never uses first person. State the likely next outcome directly, then name the evidence that would prove it wrong. Start with the actual actor, event, or outcome. Do not repeat "The base case is" or "That view would change if" as a template across stories. First-person analysis belongs only in the quarterly review.

Ordinary headlines never get this layer.

### Briefly explained: the length law

*(Fable, 2026-08-02, replacing the per-part word budgets. The July layer ran 140 to 160 words and the least consequential story on the page carried the longest view, so the page was telling the reader that a technical MOU mattered more than the USMCA review. Under accuracy-is-law, misallocated length is a form of inaccuracy.)*

Length is a claim about stakes. The room a story gets tells the reader how much it matters; make that claim true. Effort-to-explain is not consequence: the reader gets the conclusion of your work, not the work.

Three checks enforce it:

1. **Shape.** Each part has one job; doing the job ends the part.
   - *Background*: the one structural fact a newcomer needs to follow the story. Usually one sentence; two if the fact needs a number.
   - *Our view*: verdict first, then only the mechanism and magnitude that carry it. A "this matters less than it looks" verdict is nearly done when stated. A "this changes the rules" verdict earns its mechanism spelled out.
   - *What we're watching*: one observable, plus the date, release, or event that will reveal it.
2. **The dek test.** Every sentence must add a fact, mechanism, or magnitude the visible summary did not contain. Restating the dek's figure is a cut, not a warm-up.
3. **The rank check** (run once before publish): the longest "Our view" on the page must belong to the day's biggest story. Fix a violation by cutting the smaller story's view. Never pad the bigger one.

Calibration, not a target: recent BEs that read well land roughly 60 to 120 words; deflations run shortest. No length fails a build.

Nothing here caps depth on a story that earns it. If the view needs 90 words of mechanism, it gets them.

An LLM may pre-draft context into **`context_draft`** from a pasted `excerpt`, but **the build refuses to render `context_draft`** — nothing ships until it's promoted by hand to `context`/`why`. Draft text may never strengthen a claim beyond its source (no "proposed" → "passed").

## The law (unchanged)

- Closed world: the only inputs are the curated event log, standing facts, and the live board numbers.
- No sentence without a link: every shipped line carries its source id, or it's rejected.
- The model never does math; every number appears verbatim in a cited input.
- The Brief may refresh as new reporting arrives, but the selection and analysis contract does not change during the day.
