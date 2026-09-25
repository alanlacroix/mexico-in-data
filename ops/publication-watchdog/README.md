# Edition clock

This Worker is only a clock. It dispatches `.github/workflows/happening.yml` once
on weekdays at 6:35 a.m. in `America/Mexico_City`, targeting a reviewed edition
by 7:00 a.m. The 15-minute trigger maintains the health heartbeat and provides
one bounded dispatch retry at 6:45 if the 6:35 GitHub request fails. A KV claim
suppresses ordinary repeats; the publication command's committed slot ledger is
the authoritative duplicate guard if Cloudflare and GitHub race.

There is no scheduled noon dispatch. Noon remains available only through the
workflow's manual recovery input and must not be added to the Worker schedule.

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
heartbeat. Cloudflare Cron Triggers use UTC, so the exact weekday trigger is
`35 12 * * mon-fri`; the Worker verifies the corresponding local time in
`America/Mexico_City` before dispatching. Mexico City's current UTC-6 clock makes
12:35 UTC equal to 6:35 a.m. local time.

## Test

```sh
node pipeline/test/publication-watchdog.test.mjs
```
