# The public data contract

The site is a starting point, not a data warehouse. It should answer four questions quickly:

1. What changed?
2. What does it connect to?
3. How old is the underlying observation?
4. Where can I check it?

The system should save Alan from opening ten sites without asking him to trust a black box.

## Three dates that must never be confused

- **Observation date:** the period the number describes. This is the prominent date beside a number.
- **Last checked:** when the pipeline contacted the source. It says nothing about how current the observation is.
- **Generated at:** when a summary, connection, or page-level synthesis was rebuilt.

A fetch today does not turn a 2024 figure into 2026 data. Conversely, an annual figure labeled `2025` runs through December 2025; it is not treated as if it occurred on January 1.

## The update path

```text
official source
  -> connector / specialized builder
  -> normalize
  -> validate against the prior last-good file
  -> atomic write
  -> refresh freshness labels
  -> rebuild deterministic facts and summaries
  -> validate every page dependency and cross-file invariant
  -> publish
```

No validation step should invent a replacement value. It either accepts the new data or keeps the last-good file.

## One observation contract

Every series carries:

- Stable ID and title.
- Source and source URL, without embedded credentials.
- Units and cadence.
- Observation vintage and fetch time as separate fields.
- Non-empty, finite values in strictly increasing, unique periods.
- A row count that matches the payload.
- Flags for age or anomalies.

Every map layer adds:

- The canonical `CVEGEO` join key.
- Exact coverage against the municipality registry.
- Null for a genuinely unavailable value. Never zero.

## One page contract

`pipeline/lib/publication-contract.js` lists the required files for Brief, Charts, every Topic, Atlas, Model, and Sources. Runtime code still degrades gracefully if a request fails in one browser. Publication, however, is blocked when a required file is absent or malformed.

This distinction matters:

- **At build time:** do not knowingly publish an incomplete product.
- **At runtime:** do not make the whole page disappear because one request failed.

The shared page shell shows a small data warning when a runtime request fails. Static explanation and the rest of the data stay available.

The public topic registry is also a build contract, not loose content. It contains exactly six topics, in this order: Economy & money, Payments, Trade, Politics, Society & security, and U.S.–Mexico. Their keys, labels, and destinations are shared by the area builder and the publication gate. A leftover `Money`, `Security`, or `World` block therefore blocks a build instead of quietly returning to the homepage.

## Freshness is release-aware

Freshness starts at the end of the observation period and includes normal publication lag. Structural five-year data is not judged by an annual clock. A connector can set `thresholds.freshnessGraceDays` when its official release calendar needs a specific window.

Stale is a visible state, not a reason to erase a valid number. A stale observation remains usable when its date is obvious. A missing or malformed observation does not render.

## Summaries and connections

Automatic summaries may only use accepted files.

- The deterministic facts pack must reproduce the latest source observation within its documented rounding precision.
- Every Brief claim needs a source, URL, and evidence reference into the curated event ledger.
- Every topic headline needs a source, URL, and date.
- Empty topics stay empty. The pipeline does not generate filler to make the grid look complete.
- A generated synthesis is dated separately from the observations it discusses.
- Titles, source names, and context are untrusted input. Raw, entity-encoded, double-encoded, or percent-encoded markup and control characters block publication.
- Public evidence links must be absolute `http` or `https` URLs. Script URLs and credential-bearing URLs block publication.

This keeps automation useful: new data can fill the same structures and rebuild the same summaries without quietly changing the rules.

## Visual invariants

A graphic must conserve the quantity it represents.

- Treemap children may not exceed their parent.
- Atlas state totals reconcile to their published national control.
- Shares use a common denominator and reference year.
- Mixed periods are labeled; they are not presented as a same-period comparison.
- A drilldown that does not reconcile is omitted. It is never rescaled until it looks plausible.

## Fail-closed behavior

| Failure | What is served | What is visible |
|---|---|---|
| Source request fails, last-good exists | Last-good | Fetch issue plus observation date |
| Source request fails, no last-good | No value | Feed unavailable; publication blocks if the page requires it |
| New payload collapses or has a bad schema | Last-good | Connector alert |
| Observation misses its release window | Last-good | Update expected |
| Derived summary disagrees with source | Previous public build | Publication blocked |
| One browser request fails | Remaining page | Data-load warning and Sources link |

## Commands

```bash
npm run test:data   # unit cases plus the current public data
npm run build       # Eleventy, UI assertions, and data publication gate
npm run check-links # external and internal links
```

The scheduled refresh, narrative refresh, weekly facts job, and IMSS job run the publication gate before committing their output.
