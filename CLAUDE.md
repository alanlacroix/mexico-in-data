# The Mexico Brief — working rules

Eleventy site, deployed to Cloudflare Pages. Deploy is a push to `main`.
Cloudflare runs `npm run release`, which builds and then runs the publication gate.
A gate failure blocks publication, so run it locally before pushing.

```bash
npm run check && npm run check:release
```

## Lane ownership (written 2026-08-01 after a 114-commit divergence)

Two lanes write to this repo: a scheduled machine lane and a human editorial lane.
They collided once because an editorial session worked for a day on a stale base.
The rules that prevent a repeat:

- **The machine owns `data/` and `.github/workflows/`.** An editorial session never
  hand-resolves a data conflict in its own favour. Take the machine's version, then
  re-run the pipeline on top of it so generated state matches the committed config.
- **Start from the same day's base or stop.** Run `git fetch origin` and confirm you
  are not behind before the first edit, not after the last one.
- **One editorial session at a time.** Claude.ai scheduled tasks also write here.
  Check for a running session before starting a long editing pass.
- **Push work in progress every session.** An unpushed day of work is the only thing
  that makes divergence expensive.

## What the gates protect

Nineteen checks run under `npm run check`. The ones that fail most often, and why
they exist:

- **Publication contract** — every data-backed page must have its files present.
  Runtime code may degrade gracefully; production ships complete.
- **Anti-resurrection guard** — `PUBLIC_TOPIC_AREAS` in
  `pipeline/lib/publication-contract.js` is the canonical topic taxonomy. A retired
  topic cannot come back through an old generated artifact. Retire a section here
  and in `_data/nav.js`, `_data/topicRoutes.js`, `_data/releaseManifest.json` and
  `_redirects` together.
- **Topic render smoke** — every quarterly review must render the full section
  anatomy: lede, how it works with a revised date, numbers where each slot carries a
  read, what changed, what is ahead, my view with what would change my mind, the
  record, sources and method. No placeholder copy. No conditionals inside judgment
  strings, which would launder a computed value as an opinion.
- **Voice and plain language** — house grammar and reading level. Warnings about
  em-dashes are worth reading: they belong to data placeholders, never to prose.
- **Release manifest** — a new page must be classified in
  `_data/releaseManifest.json` before it can publish.

## Standing editorial rules

- The figures are sourced. The argument and the forecasts are labelled as mine.
- A quiet week says so. Staleness is confessed, never hidden behind a stale number.
- No em dashes in prose.
- One name per room across cards, nav, sections and internal contracts.
- The site never pretends to know whether a reader visited yesterday.
