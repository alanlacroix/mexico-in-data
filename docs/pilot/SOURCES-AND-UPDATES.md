# Sources and keeping the brief current

Operating recommendation, September 23, 2026. This document does not change schedules, merge the draft PR, authorize reader messages, or claim current feed health.

## Decision

Maintain one weekday executive briefing. Collect sources independently of whether a draft is approved. Use AI to identify material changes and connect reporting across time; publish only what the evidence supports. Collection, review, publication and live verification have separate status records.

## What the audit found

- The registry contains 72 feed/API/discovery entries, including 17 aggregator queries. These are not 72 independent newsrooms.
- Nine entries use string tiers (`"1"`/`"2"`), while `build-edition.mjs` accepts numeric 1/2 or `specialist`. The collector copies the registry tier directly, so those records are excluded from edition selection. Examples include El Economista, FT, Mexico News Daily and BBC. Fix this before judging their editorial contribution.
- Both a discovery query and a direct feed use the display name El Economista. Name-keyed maps select different entries depending on construction/search order. Use a stable source ID and separate publisher identity from discovery channel.
- News collection occurs within edition generation. The workflow only stages `data/news/` after publication; failed and review-required runs lose the new ledger and health records. The inspected committed source-health snapshot therefore remains September 7. It does not establish current source availability.
- A parseable feed with any items counts as healthy. This does not distinguish a current daily feed from a feed whose last article is months old.
- Only September 3 and September 7 exist in the current-format published archive, using El CEO and Mexico Business News respectively. That small sample cannot demonstrate publication diversity or justify pruning other outlets.
- The existing clock uses Eastern time; the proposed reader deadline is Mexico City time. These must be aligned before making a publication-time promise.
- The pilot has a safe review hold but still needs a named editor, a way to surface candidates requiring attention, and an explicit approved-artifact promotion step.

## Source roles

Designate approximately ten core editorial desks rather than treating every feed equally: El Economista, El Financiero, Expansión, Bloomberg Línea, Mexico Business News, T21, El País México, Aristegui Noticias, Mexico News Daily, and FT Mexico subject to verified permitted access. These are proposed priorities, not a claim that all connectors currently work. Preserve other useful sources while measuring their contribution.

Specialists support specific questions: Energía a Debate for energy, Datoz for industrial property, LAVCA for transactions, and security/border desks when they explain operating consequences. Commentary, investigations and research publish at different cadences; do not judge them by a daily-news freshness rule.

Primary documents substantiate particular claims: INEGI releases, Banxico decisions, DOF publications, relevant ministry/regulator notices and issuer filings. A company's own announcement establishes what it announced; it does not independently establish project completion or commercial success. Similarly, several articles repeating that announcement are one evidence chain.

Discovery services identify leads. Resolve them to the originating publication and read the actual material before using it. A headline or inaccessible/paywalled snippet is not adequate evidence for a detailed summary. Use permitted subscriptions/licensed access or another accessible original source when appropriate; no access bypass.

Live web checks found active editorial pages for El Financiero, Expansión and T21. Those checks do not verify feed parsing or article extraction from the production runner. Each core connector still needs an actual runner test.

## Daily operation

Proposed schedule, all times America/Mexico_City:

1. Collect without model calls every six hours and perform a final morning collection around 06:05. Persist source-attempt health even if a feed fails; preserve last-good content separately. Independently commit valid news ledgers with deployment skipped.
2. Check expected official releases after their stated publication time. INEGI's 2026 calendar specifies 06:00 releases. A pre-06:00-only sweep would miss them. Banxico and other later announcements need event-aware checks.
3. Around 06:15, group reports by underlying event, identify shared origins, compare with previous editions, and rank a short candidate set. Rank genuine change and executive consequence above volume or outlet familiarity.
4. By approximately 06:35, prepare one bilingual candidate and a compact review receipt: sources, what is new, consequential claims, uncertainty and any coverage gaps.
5. A named editor approves during the pilot. Target 07:00 only after end-to-end timing is demonstrated. Approval refers to an exact artifact hash; content changes require a new review.
6. Publish the approved bilingual edition as a unit, archive it, and verify its date/hash and both language pages on the public domain. A running clock or green build is not proof of publication.

Retain the noon slot for a bounded recovery or a material correction, not an automatic second edition. Most later news belongs in the following morning's briefing. A material same-day update keeps a clear timestamp and correction/update note. Historical editions retain their original context.

## Failure behavior and attention

- One unavailable source: try an appropriate alternate source and continue if the evidence remains sufficient. Do not fabricate the missing material.
- One unsupported story: hold it and publish the other qualifying developments where omission does not make the edition misleading.
- No material changes after adequate collection: review a short quiet-day note. No qualified items because collection failed is a delayed edition, not a quiet day. The current schema does not yet support a quiet-day edition and needs an explicit implementation if adopted.
- No approved edition by the agreed deadline: preserve the old edition's actual date, show a delay notice, and alert the operator once. Recovery should clear the incident. The alert channel/recipient must be configured with explicit authorization before messages are sent.
- Invalid data: record the failed attempt but never overwrite last-good records with malformed content.

Use one internal daily receipt rather than another reader-facing product. Track fetch result, newest source-published timestamp, successful article-body extraction, eligible candidate count, selected story count, review status, and live publication receipt. Warn after repeated core-feed failures, using source-specific expected cadence; proposed thresholds need tuning from actual runs. Required official releases get immediate attention when their outcome cannot be verified.

## Weekly maintenance

Review useful distinct developments contributed, duplicated coverage, extraction failures, source concentration and important missed stories. Keep article counts as diagnostics, not success metrics. Do not impose equal-source quotas or require every topic every day. Investigate persistent blind spots in financing, regulation/trade, investment and operating conditions.

Pilot human review is a calibration step. After the ten-day test, decide explicitly which routine cases can publish automatically and which uncertainty should continue to require approval. The current review hold should not be described as hands-free publishing.

## Next implementation order

1. Normalize source tiers and source identity; add regression tests for the nine previously excluded entries.
2. Persist collection and health independently of editorial success, including failed and review-required runs.
3. Run core feeds from the actual production runner and measure freshness, article access and eligibility separately.
4. Align the Mexico City schedule and implement exact-artifact approval, operator attention and post-publish verification.
5. Observe one complete live weekday cycle before declaring reliability restored, then start reader testing.

## Reference checks

- [INEGI 2026 release calendar](https://www.inegi.org.mx/contenidos/saladeprensa/doc/cal_2026.pdf)
- [Banxico policy announcements and calendar](https://www.banxico.org.mx/publicaciones-y-prensa/anuncios-de-las-decisiones-de-politica-monetaria/anuncios-politica-monetaria-t.html)
- [El Financiero economy](https://www.elfinanciero.com.mx/economia/)
- [Expansión companies](https://expansion.mx/empresas)
- [T21 transport and logistics](https://t21.com.mx/)

Repository evidence: `pipeline/news-sources.json`, `pipeline/collect-news.js`, `pipeline/build-edition.mjs`, `.github/workflows/happening.yml`, `.github/workflows/refresh.yml`, `data/news/health.json`, `data/editions/`, and `ops/publication-watchdog/src/index.mjs`.
