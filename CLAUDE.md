# The Mexico Brief: working rules

The homepage is the product. The public site has two reader routes: `/` and `/es/`.
It also has a 404, Atom feed, sitemap, robots file, and the machine receipts used to
verify publication. Do not add another page or product without Alan explicitly
reversing this decision.

Eleventy builds the static site. Cloudflare Pages deploys `main` with:

```sh
npm run release
```

Run that exact command before pushing. A failed gate must leave the last good
deployment live.

## Product law

- The Brief is the reason the site exists. Ranking, factual accuracy, plain language,
  freshness, and useful Briefly Explained context come before new features.
- Keep five key developments at most. Analysis is optional; a missing analysis panel
  may not block or reorder factual news.
- Keep the homepage topic filters. They help a reader scan the week, but they are
  filters, not gateways to separate quarterly pages.
- English and Spanish are separate complete editions. Never mix languages inside one.
- Every figure carries its observation period and an original source. Never turn a
  fetch timestamp into an “as of” date.
- No em dashes in editorial prose. Factual copy reports actor + action + fact. Opinion
  lives only inside a labeled Briefly Explained field.

## Reliability law

- `happening.yml` is the only workflow that publishes the daily edition.
- Its order is fixed: collect RSS → curate facts without analysis → reconcile scheduled
  outcomes → lock the exact five → explain those five → build the final brief → translate
  → validate → receipt → release → push → verify production.
- The six-hour refresh may update only inputs rendered on the homepage. Optional or
  historical datasets do not belong on the critical path.
- Machine-generated `data/` changes win conflicts. Rebase before editing and never
  hand-resolve generated data in favor of an old editorial branch.
- `_data/releaseManifest.json` is the exact artifact contract. An unclassified HTML
  file blocks release; this is intentional.

## Public surface

The build copies only:

- the English and Spanish homepage;
- `404.html`, `feed.xml`, `robots.txt`, and `sitemap.xml`;
- the stylesheet and two social images;
- `publication-status.json`, `brief.json`, and `event-status.json` for production
  verification.

Raw data, source snapshots, prompts, docs, and model keys never enter `_site/`.
