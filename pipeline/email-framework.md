# The Mexico Brief weekly email

This is the email I want on Monday morning.

It should tell me what changed in Mexico during the previous week, why I should care, which numbers moved, and what is coming next. I should be able to read it in five minutes, trust every factual claim, and open the original source when I want more.

The reader is me. If an item would not change how I understand Mexico, run a business there, or follow the country this week, it does not earn a place.

## The issue

A normal issue has four parts.

### 1. The week

One development gets the most space. It is the event that most changed my view of Mexico that week.

Use:

- What happened.
- The evidence.
- Why I think it matters.
- What is still uncertain.
- What happens next.
- The original source and the best reporting used for context.

Aim for 150 to 220 words. If no development earns that space, say it was a quiet week and skip the lead.

### 2. Other things worth knowing

Zero to three items. Each gets 60 to 90 words.

An item should answer:

- What changed?
- Compared with what?
- Why does it matter?
- Where can I check it?

There are no topic quotas. Do not add a politics item because the politics section is empty.

### 3. The numbers

A small, deterministic board built from the site's verified data, not from generated prose.

Each row contains:

- Metric.
- Current value.
- Change and comparison period.
- Observation period.
- Source.
- Freshness status.

Only show a number when its comparison is meaningful. A daily market price can show a weekly move. Monthly inflation should not be presented as though it moved during the email's seven-day window unless a new release actually arrived.

### 4. Next

Up to three dated releases, votes, decisions, or deadlines that I am likely to care about.

Include the date, what it is, and one sentence on why it is worth watching. If the calendar is empty, omit the section.

## The opening

Two sentences, written or rewritten by Alan after the evidence is frozen.

The opening can have personality. It cannot introduce a new fact that is absent from the evidence file. No generic scene-setting, fake suspense, or “Mexico is at a crossroads.”

## What earns a place

An item must first pass all of these:

1. It happened or materially changed during the issue window in Mexico City time.
2. It is specifically relevant to Mexico.
3. It is news or a new official release, not opinion, promotion, or a repeated story.
4. A primary document or credible report is available.
5. The available text supports the summary. A headline alone cannot support details.
6. Other reports about the same event are clustered into one item.

Then score it from 0 to 2 on:

- Consequence for Mexico.
- Usefulness to a decision or a change of view.
- New information this week.
- Durability beyond the news cycle.
- Evidence quality.
- Importance to the economy, politics, or the US–Mexico relationship.

A lead normally needs 10 of 12. A supporting item normally needs 7. The score creates a shortlist. Alan makes the final choice and can override it with a recorded reason.

## Facts, analysis, and sources

Every sentence is one of these:

- **Official:** directly supported by an original institution.
- **Derived:** calculated from official inputs with the method retained.
- **Reported:** supported by a news source because an original document is unavailable.
- **Analysis:** Alan's interpretation, with the facts it rests on recorded.

Every numeral maps to retained evidence. Every source record keeps its URL, publisher, publication time, retrieval time, source type, and a hash of the fetched body. If the source cannot be fetched, the item can carry a headline and link but no generated summary.

Analysis cannot be generated and silently published. Alan approves every analytical sentence.

## Weekly workflow

### Monday through Friday

Collect official releases and trusted reporting. Normalize URLs, cluster duplicate coverage, retain the fetched evidence, and track source health.

### Saturday

Freeze the seven-day window in `America/Mexico_City`. Build the data board, rank eligible events, and produce a review packet with the evidence beside each candidate.

Alan selects one lead and up to three supporting items.

### Sunday

Draft only the selected items from the frozen evidence. Produce the site preview and the Beehiiv review package.

Alan rewrites the opening and approves every analysis sentence.

### Monday

Run all gates. Enter the reviewed package in Beehiiv's Post Builder, then send a Beehiiv test. Alan approves the delivered test before scheduling or sending.

No approval means no send.

After sending, retain the approved JSON, review-package manifest, Beehiiv post ID, and sent time.

Beehiiv is the canonical subscriber list and the only delivery system. The GitHub workflow only exports a package; it has no Beehiiv secret and cannot send. Manual entry is intentional while Beehiiv's Send API is an Enterprise-only feature. Do not add a second provider to automate around that boundary.

## Files

Each issue has immutable stages:

```text
data/news/2026-W29.json
data/email/2026-W29.evidence.json
data/email/2026-W29.draft.json
data/email/2026-W29.approved.json
tmp/beehiiv-review/2026-W29/manifest.json
tmp/beehiiv-review/2026-W29/body.md
data/email/2026-W29.sent.json
```

The approved artifact includes:

- Issue window and timezone.
- Subject and preheader.
- Selected items and their scores.
- Fact-to-source mappings.
- Analysis-to-fact mappings.
- Data-board rows and freshness.
- QA results.
- Approver, approval time, and SHA-256 of the source draft and rendered reference.
- Delivery provider, provider ID, and sent time.

## Send gates

Do not schedule or send the Beehiiv post unless:

- The schema is valid.
- Every factual sentence and numeral maps to retained evidence.
- No event appears twice.
- Data units, periods, revisions, and comparisons pass.
- Every analysis sentence is approved.
- All links resolve.
- The Beehiiv review package exists and its manifest hashes match.
- The delivered test was approved.
- Beehiiv is still the signup and delivery system.
- The issue week has not already been sent.
- Sender authentication and unsubscribe behavior are verified.

Two consecutive shadow issues must pass before the first public send.

## What not to do

- Do not fill sections.
- Do not send a list of everything collected.
- Do not summarize an article that was not fetched.
- Do not let fallback copy pass as a finished issue.
- Do not call every El CEO article fintech.
- Do not mix a new observation with an old comparison without showing both periods.
- Do not send automatically because a workflow ran.
- Do not publish generated judgment under Alan's name without Alan reading it.

The email succeeds if it saves me time and leaves me with a more accurate view of Mexico. Open rate, length, and the number of stories are secondary.
