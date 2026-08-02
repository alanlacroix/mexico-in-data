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

## The design is LOCKED (2026-08-02)

Two "this supersedes everything" critiques landed in one day and both were executed
in full. Fable's call: further critique loops are a treadmill that always finds a next
defect. **Design changes now need a reader-evidence trigger, not a critique.** Park new
critiques until something observed says the page failed a reader.

The laws that came out of it, in case a future change tempts you:

- **Twelve columns, one spine.** Meta rail 1-2, text 3-9, art 10-12, rules span all
  twelve. The text column never reflows: art drops in or it doesn't, and where it
  doesn't the columns hold whitespace, never a drawn placeholder. No edge that is not
  a column edge. Every prose block shares one left edge; rails live left of it.
- **Art appears in Key developments only** (Alan, 2026-08-02). The week's list never
  carries images, so its rows are uniform.
- **Two colour encodings, ever.** The link green, one job. Section identity, seven
  muted hues, only on the section word in the rail and the active chip. Colour answers
  what kind, never how good or which direction, so no delta, indicator or number is
  coloured. The test: greyscale the page and nothing is lost. The peso trap is why —
  a falling MXN/US$ is the peso strengthening.
- **Caps on the section kicker and the nav only.** The meta layer keeps mono, in
  sentence case, with no added tracking.
- **Honesty marks take the smallest form that prevents a false belief** — a date, a
  label, a noun. Never a sentence. A sentence explaining the page is the page
  apologising. One exception: the data-versus-argument line, once, where argument
  begins.

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
