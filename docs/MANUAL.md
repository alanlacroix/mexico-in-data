# The Mexico Brief: operating manual

## Purpose

Make one homepage exceptionally useful to someone who wants to understand what changed
in Mexico, what the important numbers mean, and what to watch next.

The public product is the daily Brief in English and Spanish. Topic filters stay on the
homepage because they make the week easier to scan. Quarterly reviews, reports, source
directories, About, Atlas, newsletter pages, and separate topic rooms are retired.

## Homepage order

1. Edition date and short brief.
2. Five readings that moved.
3. Up to five key developments, each with a complete Briefly Explained unit.
4. This week, filterable by topic.
5. Scheduled releases and decisions.
6. Five slower economic readings with named comparisons.

Do not add explanatory furniture around these sections. Improve the selection, copy,
comparisons, sources, and analysis inside them.

## Editorial boundary

- Headline and summary: shortest accurate report of what happened.
- Background: structural fact a newcomer needs, connected to evidence beyond the original article. Prefer the primary public record when one is available.
- Our view: narrow, evidence-backed judgment.
- What we’re watching: the next real step and the observable result that would confirm or weaken the view. Do not force a prediction when the evidence supports only the next decision or release.
- Insider shorthand such as “hawkish” or “dovish” is not public copy.
- If the source does not support a factual phrase, remove it. The generated sentence may
  never be used as evidence for itself.

## Automation boundary

The model may curate the event log, write the daily brief, explain the selected stories,
translate, and write economic/calendar context. It may not create numbers or decide which
stories rank differently because analysis was easier to produce.

Analysis runs only after the exact factual story order is locked. If any selected story
lacks a complete, independently contextualized explanation that cleared the separate evidence audit, the new edition does not publish and the
last complete edition stays live. The pipeline may never demote a story because it is hard
to explain. A quiet day may contain fewer stories; it may not be padded.

## Independent review hold

Production generation in `happening.yml` sets `EDITION_REQUIRE_REVIEW: '1'`
for every schedule, dispatch, workflow-completion and repository-request trigger.
A model audit pass alone is not editorial approval. Successful generation writes a
hashed `candidate` under `data/candidates/` with a `review-required` attempt receipt;
it preserves the last-good public edition and does not claim fresh publication.
Collection, durable model accounting, the serialized writer lock and existing
attempt/spend limits remain in force. Replays do not regenerate or spend again.
Automatic restoration of a held release-failure artifact is also blocked in this
mode, before recovery or accounting changes, even if its earlier model audit passed.

Before publication, independently review every English field against the complete
cited source bodies and every Spanish field against both its English text and those
sources. Check subjects, reference/publication periods, procedural scope, comparison
arithmetic, denominators, causal language and qualifiers, not merely matching digits.
Review and record the exact candidate hash; any edited text requires renewed review.
Only then may an authorized publication route preserve accounting, pass the complete
release checks and verify the final exact artifact/date/hash in live JSON and both
languages. A green candidate/no-op run is not publication.

The existing `approve-edition` workflow promotes an artifact but does not reconcile
its attempt ledger. It is not a workaround for accounting or approval restrictions;
do not use it as a complete publication route while that reconciliation is unresolved.
Do not alter historical failed attempts, receipts or spend to make a candidate look
published. Hold and report an approval/access blocker rather than bypass it.

The deterministic CPI guard covers a narrow explicit named-product monthly-rate
binding, not general factual truth or all grammar. It does not validate movement
sign, broader timing/scope/causality or arithmetic claims. Independent review remains
required even when this guard and every model verdict pass.

## Change control

Before adding any page, database, signup flow, connector, workflow, report, or recurring
model job, answer: does this directly improve the homepage a reader sees today? If not,
leave it out.
