# Publication watchdog

This Worker checks the live publication receipt every 15 minutes. After the
morning or afternoon edition is due in Eastern time (plus a 20-minute grace
period), it dispatches `.github/workflows/happening.yml` only when:

1. the live receipt does not cover the due edition; and
2. no recent run of that workflow is queued or in progress.

`GET /` and `GET /health` are read-only health responses. HTTP requests cannot
dispatch the workflow.

## Deploy

Create a fine-grained GitHub token for `alanlacroix/mexico-in-data` with
**Actions: read and write** access. Store it as a Worker secret; never add it to
`wrangler.jsonc` or the repository.

```sh
cd ops/publication-watchdog
npx wrangler secret put GITHUB_TOKEN
npx wrangler deploy
```

Cloudflare Cron Triggers run in UTC. The Worker converts each invocation to
`America/New_York`, so the two publication windows continue to work across EST
and EDT. Cron changes can take several minutes to propagate after deployment.

## Test

```sh
node pipeline/test/publication-watchdog.test.mjs
```
