# The Mexico Brief

A sourced, always-current briefing on Mexico — for a smart outsider who starts near zero. Live at **mexicobrief.com**.

**Every figure is official, dated, and one tap from its source. Nothing is invented.**

- **The Briefing** (`index.html`) — the state of Mexico's economy in one read: the Board of live
  indicators, a "what to watch" catalyst calendar, forecasts, and the twelve questions an outsider
  actually brings.
- **The Model** (`model.html`) — a teaching causal model (`MODEL`-stamped): pull tariffs / the Fed /
  oil and watch the transmission to the peso, inflation, Banxico's rate and growth.
- **The Atlas** (`atlas.html`) — search any of Mexico's ~2,469 municipalities for its poverty and
  reported crime versus the national benchmark.
- **Data health** (`data.html`) — every source, its cadence, vintage, owner and status.

## How it works

Plain static HTML/CSS/vanilla-JS with inline SVG charts — no framework, no CDN, no runtime LLM.
The site only ever reads pre-baked static JSON in `data/`:

- A zero-dependency Node pipeline (`pipeline/`) fetches each official source (Banco de México SIE,
  INEGI, Secretaría de Economía, CONEVAL, SESNSP, World Bank…), validates it, **fails closed**, and
  writes slim JSON. A scheduled GitHub Action refreshes it and commits the result.
- Forecasts are *other people's* named, dated numbers (Banxico's Survey of Expectations, IMF, OECD).
  The causal model is labeled `MODEL` and is a teaching tool, never presented as data.

If a number can't be verified it isn't published; if a feed fails, the last valid value is served and
marked. See the Data-health page for the live status of every source.

## Sources

All data comes from public, first-party official sources, each linked in-place and on the Data-health
page. See `DATA-SOURCES.md` and `ACCESS.md` for the full provenance and refresh cadence.

*A personal project. Not affiliated with any of the institutions whose open data it republishes.*
