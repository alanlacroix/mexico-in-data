# Executive briefing pilot: implementation and release status

Prepared September 22, 2026. This branch is a pilot candidate, not evidence of improved production reliability or reader retention.

## Implemented

- A focused English/Spanish briefing with visible reporting, business implications, context, next milestone, direct sources, and computed reading time.
- A restrained responsive editorial layout. Market dashboards, general calendar, and weekly shelf are absent from the main reading path.
- An honestly dated delay notice that evaluates the reader's current Mexico City date even when a static deployment has stopped updating. Friday editions remain current during the weekend.
- Validated dated edition archives, original source attribution, language-preserving archive links, and sitemap coverage. September 3 and September 7 artifacts were recovered from actual published repository history, not reconstructed.
- Bounded issue-memory retrieval. Prior copy informs novelty ranking; only re-fetched original article bodies enter the drafting evidence packet. This first version uses conservative lexical matching and can miss relevant connections, especially cross-language matches.
- Strict evidence gates retained. Rejected bilingual model copy, field references, and reasons are retained in bounded internal diagnostics; fetched source bodies are excluded.
- A rendering fix prevents English acronym expansion from corrupting reviewed Spanish text.
- Candidate editions cannot pass the production release or archive write gates while marked as candidates.

## Current content candidate

`candidate-2026-09-22.json` and its companion markdown/evidence notes contain one development. Sol researched and drafted it; Terra independently checked the original INEGI and La Jornada sources. Review corrections narrowed timing to August, preserved nowcast uncertainty, and removed an unsupported explanation for the July revision.

It is a candidate for editorial approval, not a published edition. The existing public edition file has not been replaced. A separate local preview is clearly labeled unpublished.

## What the failure diagnosis established

The upstream repository continued recording scheduled data updates and edition attempts after September 7. September 22 drafts failed deterministic evidence/translation checks. The publication process preserved the previous edition as designed. Historical failure logs did not preserve enough draft text to establish whether the Spanish-negation rejection was a false positive; this branch does not claim to have solved that unknown.

Stronger prompting and diagnostics are improvements, not proof that future model drafts will pass. No paid generation call, production deployment, or live recovery test was performed during this implementation.

## Validation

Run `npm run release`. It includes bilingual content, history integrity, candidate-release blocking, Spanish rendering, reader-clock freshness, build, routing, sitemap, scripts, source boundaries, and existing pipeline checks.

Manual visual checks cover desktop and 390px mobile in both languages, source links, dated edition links, and archive language switching. Existing stale-series warnings concern retained datasets outside the redesigned reading path; they do not imply the current briefing has been refreshed.

## Remaining pilot work

1. Approve the candidate copy and reading experience, then publish the approved change through the existing production branch and verify the exact live artifact.
2. Confirm the pilot's publishing time and editorial owner. The existing generation clock is still morning/noon Eastern; the proposed reader deadline is 7 a.m. Mexico City. Align these before promising that time publicly, especially for winter time differences. No new scheduler was installed.
3. Observe successful real source collection, generation, editorial approval, deployment, and live receipt verification. Reliability is not restored until that path works.
4. Produce the next two real candidate editions, then run the ten-weekday pilot with the user's executives. Do not backdate synthetic samples as actual editions.
5. Measure added understanding, voluntary return visits, reading time, editorial effort, and cost. The proposed success thresholds are in the parent project plan; no reader metrics have yet been collected.

Candidate approval is required by the agreed pilot plan. Reader invitations, messages, and surveys have not been sent.
