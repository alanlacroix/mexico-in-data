# The Mexico Brief: working rules

The homepage is the product: one weekday executive briefing in English and Spanish.
The approved September 22 plan adds dated editions and simple archives under
`/editions/` and `/es/editions/`, keeping the original sources and publication dates.
The site also has a 404, Atom feed, sitemap, robots file, and edition receipt.
Do not add dashboards, personalization, newsletters, or another product without approval.

Eleventy builds the static site. Cloudflare Pages deploys `main` with:

```sh
npm run release
```

Run that exact command before pushing. A failed gate must leave the last good
deployment live.

## Product law

- The Brief is the reason the site exists. Ranking, factual accuracy, plain language,
  freshness, and useful Briefly Explained context come before new features.
- Rank up to five candidates, lock the top three, and publish one to three key developments. Every
  published development has visible reporting, business implications, context, and a
  sourced next milestone. The primary reading path has no dashboard, calendar or weekly shelf.
- AI compares new reporting with prior coverage. Archived prose is a retrieval index,
  never independent evidence; reopen original source articles before citing a connection.
- During the pilot, a human approves each candidate before publication. The workflow
  writes review candidates separately and leaves the public edition unchanged.
- English and Spanish are separate complete editions. Never mix languages inside one.
- Every figure carries its observation period and an original source. Never turn a
  fetch timestamp into an “as of” date.
- No em dashes in editorial prose. Factual copy reports actor + action + fact. Opinion
  lives only inside a labeled Briefly Explained field.

## Reliability law

- `happening.yml` is the only workflow that publishes the daily edition, through one
  command: `pipeline/build-edition.mjs`.
- `data/edition.json` is the only public content authority. It contains the complete
  English and Spanish edition and weekly shelf. A failed build leaves it byte-for-byte
  unchanged and exits nonzero.
- Publication gets one morning attempt and one noon attempt. Each attempt has three
  bounded model calls and no internal retry loop. A same-input noon check is a zero-call
  no-op only after that morning successfully published the artifact still on disk.
  Monthly and per-day budgets are hard limits.
- The Cloudflare Worker is only a clock. It may dispatch each date/slot once; it never
  evaluates, repairs, or republishes content.
- The six-hour refresh may update only inputs rendered on the homepage. Optional or
  historical datasets do not belong on the critical path.
- Machine-generated `data/` changes win conflicts. Rebase before editing and never
  hand-resolve generated data in favor of an old editorial branch.
- `_data/releaseManifest.json` is the exact artifact contract. An unclassified HTML
  file blocks release; this is intentional.

## Public surface

The build copies only:

- the English and Spanish homepage, archive lists and dated editions;
- `404.html`, `feed.xml`, `robots.txt`, and `sitemap.xml`;
- the stylesheet and two social images;
- `edition.json` for exact production verification.

Raw data, source snapshots, prompts, docs, and model keys never enter `_site/`.
