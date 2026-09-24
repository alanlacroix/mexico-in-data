# Core source access audit

Audit run: 2026-09-24 13:31–13:32 UTC. Scope: the ten proposed core editorial desks in `SOURCES-AND-UPDATES.md`.

## Boundary

These are observations from the local development machine. They do **not** verify GitHub Actions, Cloudflare, or any production runner. Network policy, cookies, subscriptions and publisher controls can produce different results elsewhere.

The audit made ordinary unauthenticated HTTP requests. It did not bypass access controls, use paid content, call a language model, change the source registry, or publish anything. The initial run recorded HTTP access only: HTTP 2xx, HTML, and more than 1,000 bytes. It did not prove complete article extraction. The script now also runs each sample through the production `fetchArticle` helper and reports extraction separately; the table below predates that stronger check and must not be read as extraction evidence.

Reproduce from the repository root:

```sh
node pipeline/audit-sources.mjs
node pipeline/audit-sources.mjs --markdown
```

## Results

| Proposed desk | Feed locally | Items | Newest item (UTC) | HTTP sample locally | Operational reading |
|---|---:|---:|---|---:|---|
| El Economista | pass | 100 | 2026-09-24 13:12 | pass | Core-ready locally after tier normalization |
| El Financiero — Economía | pass | 9 | 2026-09-24 09:22 | pass | Core-ready locally |
| Expansión — Empresas | pass | 45 | 2026-09-24 11:55 | pass | Core-ready locally |
| Bloomberg Línea | pass | 100 | 2026-09-24 11:00 | pass | Core-ready locally; regional feed still needs the existing Mexico filter |
| Mexico Business News | pass | 50 | 2026-09-24 12:30 | pass | Core-ready locally |
| T21 | pass | 10 | 2026-09-24 13:03 | pass | Core-ready locally for logistics and infrastructure |
| El País — México | pass | 115 | 2026-09-24 12:43 | **403** | Discovery/watch until article access is established |
| Aristegui Noticias | pass | 15 | 2026-09-24 12:38 | pass | Core-ready locally; business consequence remains an editorial filter |
| Mexico News Daily | pass | 10 | 2026-09-23 23:17 | **403** | Discovery/watch until article access is established; normalize string tier |
| Financial Times — Mexico | pass | 25 | 2026-09-21 04:00 | **403** | Discovery/watch unless permitted subscription or licensed access is configured; normalize string tier |

All ten feeds were reachable and had parseable items. Seven sampled article pages passed the coarse local HTTP check. This historical table does **not** prove successful article-body extraction. El País, Mexico News Daily and FT returned HTTP 403 for their sampled articles. Feed success, HTTP page access and extracted article text are three separate results. Re-run the strengthened script for current extraction evidence.

## Practical pilot roster

Use seven desks as the locally demonstrated core: El Economista, El Financiero, Expansión, Bloomberg Línea, Mexico Business News, T21 and Aristegui Noticias. They provide a workable mix of macro/business, companies, markets, logistics/infrastructure, politics and accountability.

Keep El País México, Mexico News Daily and FT Mexico in the discovery/watch layer until the actual publication process can lawfully open and inspect their article bodies. A feed headline or snippet is insufficient evidence for a detailed summary. If the editor has permitted subscription access, test that explicit path separately without weakening the public-source fallback.

This recommendation is intentionally narrower than the registered inventory. Specialists and primary sources remain available for particular stories: Energía a Debate, Datoz, LAVCA and security/border desks for their beats; INEGI, Banxico, DOF, ministries, regulators and issuer filings for substantiation. Primary announcements establish what the issuer announced, not independent confirmation.

## Repository issues that affect selection

- El Economista, Mexico News Daily and FT Mexico use string tiers (`"1"` or `"2"`). The current edition gate accepts numeric 1/2 or `specialist`, so these sources are collected but excluded from selection until tiers are normalized.
- El Economista exists as both a direct feed and a Google News discovery query with the same display name. Identity should use stable source IDs, with publisher and discovery channel represented separately.
- Bloomberg Línea is a regional feed. Its successful sample was about Argentina; its registry `mx: true` filter is therefore necessary and should be tested rather than inferred from feed health.
- The committed collector health snapshot predates this audit. This report does not update it because collection persistence and source identity are being changed separately.

## Required production check

Run the same script once from GitHub Actions before describing any connector as runner-verified. When `GITHUB_ACTIONS=true`, the output sets `environment: "github-actions"` and `productionRunnerVerified: true`; that means the audit executed on the workflow runner, not that a deployed Cloudflare runtime was tested. Preserve the JSON output as a dated artifact. For each source, record feed access, newest source timestamp, HTTP sample access, extracted article body and eligibility separately. A 200 response with old items must not count as current health.

For the pilot, alert on two consecutive core-feed failures and review source-specific freshness against normal cadence. Those are proposed operating triggers, not validated thresholds. Article volume is diagnostic; reader value and correct story selection remain the outcome measures.

## Follow-up: actual extraction check, September 24

A second local run used the production `fetchArticle` helper and registry host restrictions, independently of the audit's HTTP check. All ten feeds parsed; six sampled pages returned a recognized article body: El Economista, El Financiero, Bloomberg Línea, Mexico Business News, T21 and El País México. Expansión, Mexico News Daily and FT returned no extracted body; Aristegui returned text but no recognized article body. El País succeeded through the normal public article-fetch path despite the first audit user agent receiving 403. These are sample-level observations, not blanket outlet access guarantees. Bloomberg's sample concerned Colombia, demonstrating why Mexico relevance filtering remains necessary.

The PR now runs this audit in GitHub Actions and retains a JSON artifact. A green audit job means the diagnostic ran; inspect individual feed and extraction outcomes before concluding a source works. Production deployment remains separate from runner verification.


## GitHub runner verification

[Run 36065476595](https://github.com/alanlacroix/mexico-in-data/actions/runs/36065476595) completed successfully. Its diagnostic JSON is saved as `source-audit-runner-2026-09-24.json`. All ten feeds parsed; nine had September 24 items, while FT's newest item was September 21. This is not ten fresh daily feeds.

The production article extractor recognized bodies in six samples: El Economista, El Financiero, Bloomberg Línea, Mexico Business News, T21 and El País México. Expansión and Aristegui's sampled pages returned HTTP 200 but did not yield a recognized article body. Mexico News Daily and FT samples returned 403. Keep those four as discovery/support sources until individual article evidence qualifies; FT is optional rather than a daily dependency. No per-outlet accessibility guarantee follows from a single sample.

The final implementation commit `0bd8b29f` also passed [release-check run 36065619707](https://github.com/alanlacroix/mexico-in-data/actions/runs/36065619707). Neither run deployed the Worker or approved a public edition.
