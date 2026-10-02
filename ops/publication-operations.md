# Daily publication acceptance and recovery

The outcome is a current Mexico City edition with three to five useful, source-backed
stories, accurate English and Spanish, and verified production delivery by 07:00.
A successful no-op, a green build, or a manually curated recovery does not prove that
automatic editorial generation succeeded.

## Triggering

- The independent Worker configuration targets 06:05 Mexico City. Changing its
  repository files does not deploy the Worker. Verify deployed cron and heartbeat.
- GitHub edition backups are 06:20 and 06:40. Successful morning `collect-news`
  completion also admits one bounded attempt between 06:05 and 06:45.
- GitHub schedules can arrive late or be dropped. On October 2, the workflow was
  active with valid cron and conditions, but no scheduled edition run had appeared.
  Earlier September 25, 28 and 29 runs were several hours late. The platform cause
  is unconfirmed; do not treat active workflow state as proof of timely dispatch.
- If the intended morning attempt has not started, an authorized operator can use
  the expiring `ops/publication-request.json` path. It retains production concurrency,
  current-day checks, published-day no-op, recovery limits and all budget gates.

## What to verify

1. A real current-day collection and editorial attempt started, not merely a code check.
2. Selection contains new reporting rather than previously published lead URLs.
3. At least three stories pass deterministic evidence/translation checks, independent
   audit and the full public artifact/release contract. Never pad to reach the minimum.
4. Both production pages and the receipt have the exact current editorial date/hash.
5. Record whether delivery was autonomous or independently curated recovery, settled
   spend, failure stage, and whether publication met the deadline.

## Failure recovery

- Failed drafts preserve structured rejection diagnostics and conservative paid-call
  accounting. Repair only rejected units within the existing call limit.
- When diagnostic storage is available, post-audit failures retain an Actions artifact for one day, containing
  exact drafts, cited evidence, audit verdicts, assembled candidate/hash when available,
  and validation reasons. It is outside the repository and public site, with normal
  repository Actions access rules. Its existence is not editorial approval.
- A corrected validator may replay unchanged, previously audited content through all
  current gates without new model work. Verify date, source/audit provenance, hash and
  absence of a newer publication. Changed prose needs a new independent review.
- Release-only rejection uses the existing held-edition mechanism. Deployment failure
  gets one hash-specific deployment retry and repeated zero-model verification.
- If a curated recovery is needed, retain exact sources and an independent field-by-field
  review. Preserve all original failed calls, spend and diagnostics. Keep last good
  production content until the complete replacement passes every gate.

## Budget evidence, October 2

The fixed budget remains $6 per month, with a proportional daily ceiling and pacing.
October 1–2 settled provider-reported usage totals $0.230088. Both days needed curated
recovery, so this is not evidence of affordable autonomous success or a provider invoice.
October 2 used $0.117062 across four calls, below its $0.193548 daily limit.

Conservative reservations prefer reducing a five-story Sonnet batch toward three
before choosing the cheaper writer. Three stories are the required floor; the fourth
and fifth depend on evidence, quality and available budget. A three-story batch has
no spare if one story fails. Do not increase limits or weaken the audit to claim success.
Measure clean automated deliveries and actual usage before deciding whether a budget
or model change would address the remaining reliability problem.
