# Edition clock

This Worker is only a clock. Every 15 minutes it computes the current Eastern
publication slot and dispatches `.github/workflows/happening.yml` once for the
morning slot and once for the noon slot. A KV claim suppresses ordinary repeats;
the publication command's committed slot ledger is the authoritative duplicate
guard if Cloudflare and GitHub race.

It does not inspect the website, rewrite editorial state, retry failed content,
or publish anything. `GET /` and `GET /health` are read-only.

## Deploy

Store a fine-grained GitHub token with **Actions: read and write** for
`alanlacroix/mexico-in-data` as a Worker secret. No repository-content permission
is required.

```sh
cd ops/publication-watchdog
npx wrangler secret put GITHUB_TOKEN
npx wrangler deploy
```

The existing `WATCHDOG_STATE` KV namespace contains only slot claims and a health
heartbeat. Cron times are interpreted by the Worker in `America/New_York`, so DST
does not change the 9am/noon contract.

## Test

```sh
node pipeline/test/publication-watchdog.test.mjs
```
