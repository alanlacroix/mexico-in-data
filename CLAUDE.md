# The Mexico Brief: working rules

The homepage is the product: one daily executive briefing in English and Spanish.
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
- Rank up to eight candidates and target three to five strong developments per daily edition.
  Size the batch within the unchanged budget, preserve the independent audit, and never pad with weak stories. Every
  published development has visible reporting, business implications, context, and a
  sourced next milestone. The primary reading path has no dashboard, calendar or weekly shelf.
- Write in clear, everyday English and natural Mexican Spanish. Retain background,
  context, why it matters and the next step. Simplify wording and sentence structure,
  not the substance, facts, attribution or uncertainty. Explain necessary technical
  terms and use two short sentences when clearer than one long sentence.
- AI compares new reporting with prior coverage. Archived prose is a retrieval index,
  never independent evidence; reopen original source articles before citing a connection.
- As authorized September 30, validated bilingual editions publish automatically every
  day, including weekend recaps. Evidence, translation, independent audit and the exact
  release gate must all pass. A failure retains the last good edition. Explicit manual
  review mode remains available for exceptional editorial work.
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
  Monthly and per-day budgets are hard limits. A failed slot may receive one bounded
  recovery, including after successful main-branch release checks or a scheduled backup.
- Each paid call reserves its maximum bill in both accounting ledgers and pushes
  them before contacting the provider. Only verified usage can refund the excess.
  Interrupted or ambiguous calls retain their full reservation; recovery stays bounded.
  A failed accounting push blocks the call. Never reset receipts to regain allowance.
- A release-only failure preserves the exact audited candidate and provenance for zero-model
  recovery. Invalid held content fails closed; never regenerate to hide preservation failure.
- Retain raw initial drafts, field-repair responses, evidence, audit verdicts and validation
  diagnostics in a one-day Actions artifact outside Git and the public build. A missing
  audit keeps its hash null. Diagnostic material never grants publication permission.
- Preserve complete extracted article evidence within a 16 KiB serialized UTF-8 record.
  An oversized body is unusable, never silently clipped or replaced with its RSS snippet.
  Skip oversized optional leads before paid work; required scheduled outcomes fail closed.
- Repair only rejected bilingual fields and citations; preserve passing fields exactly.
  Revalidate complete stories and run the mandatory independent audit after merging patches.
- Weekend recaps rank the permitted week by business importance before recency. Weekday
  editions still require exact-day coverage; neither mode may pad with weak reporting.
- Run the public artifact's evidence-free bilingual checks before paying for audit,
  alongside cited-evidence checks, so final validation cannot introduce a second dialect
  of the translation rules.
- Begin at 06:05 Mexico City, with GitHub backups at 06:20 and 06:40, targeting live
  verified delivery by 07:00. Worker code/config changes require a separate verified deployment.
- Successful main-branch morning collection can also start the bounded edition during
  06:05–06:45 Mexico City. Evening/late collections cannot initiate paid generation.
  This is a second GitHub trigger, not a guarantee against GitHub scheduling delays.
- The Cloudflare Worker is only a clock. It may dispatch each date/slot once; it never
  evaluates, repairs, or republishes content.
- A main-branch push changing only the dispatch path `ops/publication-request.json`
  can request a bounded fallback run. Its four-field schema is in
  `ops/publication-request.schema.json`: current Mexico editorial date, morning/noon
  slot, UTC expiry at most 30 minutes away, and a short purpose. Expired or malformed
  requests do nothing; published and exhausted attempts cannot regain model allowance.
- The six-hour refresh may update only inputs rendered on the homepage. Optional or
  historical datasets do not belong on the critical path.
- If curated recovery changes a feed lead to a canonical or primary source, include its
  original feed URL in `data/editorial-source-provenance.json`, bound to the exact
  published date, artifact hash, story ID and lead URL. Never infer coverage from
  background citations or broad topic similarity.
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
