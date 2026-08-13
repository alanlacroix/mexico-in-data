# The homepage data pipeline

The pipeline has two jobs.

## Every six hours

`pipeline/run.js` refreshes only the ten economic series rendered on the homepage:
peso, gasoline, Cetes, the US 10-year yield, the IPC, inflation, the policy rate,
economic activity, goods exports, and remittances. The shared connector harness
validates each response and keeps the last good observation on failure.

The same workflow collects the RSS ledger, updates translation caches, writes context
for the economy and calendar, synchronizes the brief’s fallback readings, validates the
assembled homepage inputs, and commits with `[CF-Pages-Skip]`.

## Once each morning

`.github/workflows/happening.yml` builds the edition. It selects facts before asking for
analysis, so model availability cannot affect ranking. It publishes at most five key
developments, creates a complete Spanish edition or carries the last complete one, runs
the exact production build, commits one receipt, and verifies that receipt on the live
site.

## Data rules

- Official observations are never guessed or replaced with zero.
- Every number uses its observation date, not its fetch time.
- RSS discovery and official release reconciliation feed the Brief. GDELT is not a
  discovery path.
- Model output never produces a number. It may summarize sourced reporting or write a
  labeled analysis field after selection.
- A missing optional explanation does not block factual publication.

Local commands:

```sh
cd pipeline
node run.js
node collect-news.js
cd ..
npm run release
```
