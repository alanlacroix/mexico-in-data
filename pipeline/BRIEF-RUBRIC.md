# The Brief — selection rubric (Fable ruling 2026-07-12)

The homepage Brief is the daily glance: **3–5 of the most important things in Mexico right now**, each explained in 1–2 sentences, each linked to its source. This is the rubric that decides what makes it in, so "importance" is a score, not a vibe.

## How to score an event

Every candidate event in `data/happening.json` gets an `importance` from **0 to 10**: score it **0, 1, or 2** on each of the five criteria and add them up.

1. **National consequence** — does it change policy, the economy, or daily life for Mexico broadly? (2 = national; 1 = a sector or one state; 0 = one company)
2. **US–Mexico stakes** — tariffs, USMCA, remittances, migration, security cooperation. (2 = central; 0 = none)
3. **Model impact** — does it move or explain a board number (peso, inflation, rate, growth)? (2 = moves one; 1 = related; 0 = no)
4. **Durability** — will it still matter in 30 days? First report of a real change scores; commentary and re-reports score 0. (2 = lasting; 0 = noise)
5. **Officialness** — is a primary/official source available (Banxico, INEGI, DOF, SHCP, USTR)? (2 = official; 1 = official-ish/press; 0 = rumor)

## What ships

- **Threshold: importance ≥ 5.** Only events at 5+ are eligible.
- **Cap: 5.** Never more, even in a huge week.
- **Floor: 3 (soft).** If fewer than 3 clear the threshold, ship what clears it — never pad to a count.
- The number of items flexes by the week: a big week naturally yields 5, a slow week 3. Length follows item count, never fatter items (target 150–250 words).

## Where the context comes from

Each event's shipped context is its **`why`** field (or an explicit `context` field) — human-written, drawn only from the linked source and facts we already own. The lead item's context (the #1 story, the H1) Alan writes himself.

An LLM may pre-draft context into **`context_draft`** from a pasted `excerpt`, but **the build refuses to render `context_draft`** — nothing ships until it's promoted by hand to `context`/`why`. Draft text may never strengthen a claim beyond its source (no "proposed" → "passed").

## The law (unchanged)

- Closed world: the only inputs are the curated event log, standing facts, and the live board numbers.
- No sentence without a link: every shipped line carries its source id, or it's rejected.
- The model never does math; every number appears verbatim in a cited input.
- The Brief rebuilds once each morning, at Alan's curation pass. No intra-day updates.
