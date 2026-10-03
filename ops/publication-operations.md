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

## October 3 convergence repair

The October 3 automatic attempts settled four calls at $0.108734 and stopped
without an independently audited publishable candidate. A separately audited
four-story recovery reached production at 06:38 Mexico City. All four provider
responses ended normally; this is not evidence that a higher output limit or
monthly budget would solve the failure.

The retained rejected fields demonstrate overlong summaries and unusable watch
fields alongside three false translation alarms (undetermined/sin determinarse,
unresolved/sin resolver, untested/sin probar). Empty diagnostic fields describe
post-processing output, not necessarily the provider's original response.

- Repair requests now contain only the rejected bilingual fields and their
  citations. Passing fields remain byte-for-byte intact. Unknown fields, story
  keys and invalid references fail closed; the full deterministic and independent
  audit still review the resulting complete stories.
- Field-specific writing targets leave room below the release limits. The output
  reservation scales with repaired fields: one summary uses 360 tokens including
  framing instead of a whole-story 1,400. Input overhead also counts, so existing
  daily and monthly reservation checks remain authoritative.
- Weekend recap ranking uses existing business-importance scores across the week.
  Saturday how-to coverage no longer outranks stronger weekday reporting solely
  because of its date. Weekday exact-date coverage and required outcomes remain.
- Diagnostic artifacts retain initial raw responses, field patches, source text
  and rejection stages before the audit, with a null audit hash until an audit
  actually exists. They stay outside the public site, with normal repository Actions access and
  one-day retention; they cannot authorize publication.

Remaining editorial limits are specific: keyword importance can still miss or
mis-rank relevant developments, and an extracted article body does not establish
that it contains a supported next milestone. A broad future-tense filter or a
larger budget is not a demonstrated fix. Automatic drafts must still pass all
fields and the independent audit; source-backed operator recovery remains the
accepted contingency when they do not. The three-call ceiling makes one call per
story unsuitable because it would consume the audit allowance.
