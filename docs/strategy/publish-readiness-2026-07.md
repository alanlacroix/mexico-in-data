# Publish readiness

Date: 2026-07-13

The site should not be pushed yet. The public pages can be made ready, but the first email still needs two shadow issues and a delivered-test review.

## Ready on the site

- One shared header, footer, and navigation.
- About is a top-level item.
- About and Subscribe use the same typography and spacing as the rest of the site.
- The Atlas uses current official state releases, keeps pesos as the primary unit, and links every active metric to its source.
- Development and generated-email previews carry `noindex, nofollow` in page metadata and Cloudflare headers.
- Desktop and mobile layout can be checked from the same Eleventy build.
- Every public data page now has an explicit file contract. Missing files, malformed observations, drifted deterministic facts, unreconciled map totals, and invalid chart hierarchies block publication.
- Observation dates and fetch times are separate. A successful check no longer makes an old observation look current.
- Runtime data failures show a small warning while leaving the rest of the page usable.
- Freshness follows the source cadence and the end of the observation period; source-specific grace windows are supported.
- The homepage topic registry is fixed to the approved six topics. Retired categories or changed destinations block publication.
- Curated narrative fields reject encoded markup and control characters, and evidence links must use `http` or `https`.

The full rule is in `docs/strategy/data-publication-contract.md`.

## Blockers before a public push

### 1. One subscriber system — resolved

Beehiiv is the canonical subscriber list and the only delivery system. The signup form creates subscribers through `functions/api/subscribe.js` with confirmation enabled.

`pipeline/prepare-beehiiv.js` creates a review package for Beehiiv's Post Builder. It has no provider secret, makes no provider API call, and cannot send. The GitHub workflow does the same and only uploads the package as an artifact.

The final test, schedule, send, unsubscribe, and delivery record all happen in Beehiiv. Do not add a second subscriber list or a silent dual write.

### 2. Replace the current email draft path

The existing generated sample is not suitable for readers. It contains too many items, classification mistakes, fallback copy, and no immutable fact-to-source evidence file.

The canonical replacement is `pipeline/email-framework.md`. Run two shadow issues through that process before the first real send.

### 3. Keep the manual Beehiiv send fail closed

Do not schedule or send the Beehiiv post when any of these is missing:

- Approved issue status.
- Alan's approval identity and time.
- The review-package manifest and source hashes.
- Passing source, numeral, link, rendering, and delivery checks.
- A successful test send.
- A check that the issue week has not already been sent.

The GitHub workflow requires an exact week and only exports files. Beehiiv is the only place with a send control.

### 4. Verify production configuration

Before launch, check in the production environment:

- `/api/subscribe` reports configured.
- A real test address reaches the canonical subscriber list.
- Confirmation and welcome behavior match the copy on the site.
- Unsubscribe works in the delivered email.
- SPF, DKIM, and DMARC pass.
- Scheduled data workflows have every required secret.
- Cloudflare cache rules do not cache `/api/*`.

## Final site QA

Run against the production build, not individual source files:

- Build and assertions pass.
- Internal-link check passes.
- No horizontal overflow at 390 px, 768 px, 1280 px, or 1440 px.
- Header menu works with keyboard and touch.
- Subscribe forms show validation, loading, success, and server-error states.
- Atlas works with mouse, keyboard, and touch. State selection and the explicit municipal drill remain distinct.
- Every Atlas metric shows its period and original source before a user has to open a profile.
- About and Subscribe contain no stale cadence promises.
- Prototype pages are not indexed.
- No console errors or failed first-party requests on Brief, Charts, each Topic, Atlas, Sources, About, and Subscribe.

## Release order

1. Finish local QA.
2. Prepare and review the Beehiiv handoff.
3. Publish to a preview deployment.
4. Run the final QA list on the preview URL.
5. Publish production.
6. Complete two shadow weekly issues.
7. Send the first issue only after the exact delivered test is approved.

The launch standard is not “all pages look finished.” It is that the site saves Alan time, every important number can be checked, and a reader who subscribes will reliably receive exactly what the site promised.
