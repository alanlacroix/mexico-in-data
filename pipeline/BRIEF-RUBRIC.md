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

Each part must add something the visible summary did not already say. Ordinary headlines never get this layer.

**Length.** Aim for roughly 30 words of Background, 35 of Our view, 25 of What we're watching, so about 90 for the layer. These are targets to write toward, not a gate: nothing fails a build for missing them. The reason to hold them is that the layer shipped at 140 to 160 words through July, and a reader who opens Briefly explained and meets three dense paragraphs closes it and stops opening it. Budgeting each part separately is what keeps Our view from absorbing the other two, which is where the overrun came from. If a story genuinely needs more room, spend it in Our view and cut Background to the one structural fact a newcomer cannot do without.

An LLM may pre-draft context into **`context_draft`** from a pasted `excerpt`, but **the build refuses to render `context_draft`** — nothing ships until it's promoted by hand to `context`/`why`. Draft text may never strengthen a claim beyond its source (no "proposed" → "passed").

## The law (unchanged)

- Closed world: the only inputs are the curated event log, standing facts, and the live board numbers.
- No sentence without a link: every shipped line carries its source id, or it's rejected.
- The model never does math; every number appears verbatim in a cited input.
- The Brief may refresh as new reporting arrives, but the selection and analysis contract does not change during the day.
