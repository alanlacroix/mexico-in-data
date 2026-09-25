# MexicoBrief editorial design polish

September 24, 2026. Implemented in the draft branch; production remains unchanged.

## Product definition

A short bilingual executive briefing for people operating businesses in Mexico. Each weekday edition selects up to three consequential developments from third-party reporting, explains the supported business implications, and adds relevant context from original sources and previous coverage. Original publishers remain visible. AI assists selection, comparison, synthesis and translation; editorial approval remains part of the pilot. The advantage must be useful selection and continuity, not the number of summaries.

The localhost:8779 page is a September 22 editorial preview, not a deployed current edition. Pipeline and schedule changes are in draft PR #8. A new approved edition and observed live publication cycle are still required.

## Direction

A restrained business publication: warm near-white paper, dark ink, readable serif headlines and text, simple sans-serif utility information, one muted green accent. Use typography, alignment and spacing to establish importance. Keep article headlines more prominent than the publication's description. Avoid oversized promotional language, repeated labels and ornamental interface elements.

## Planned changes, in priority order

1. Consolidate the page opening. Keep one masthead with a short descriptor, date and language control. Suggested descriptor: “A briefing on business in Mexico.” Remove the second “The Mexico Brief” kicker, “What matters for business in Mexico,” and “The changes, implications and context you need.” Remove the “Key developments” heading, numeric story count and decorative 01/02/03 numbering. Let the first story begin promptly below the edition line.
2. Replace the amber freshness box. Keep the edition date visible and show a readable inline status beside/below it: “September 22 edition · A newer edition is not yet available.” No tinted panel, warning stripe, large bold headline or duplicate explanatory sentence. Preserve accessible status semantics and browser-clock stale detection. Do not silently hide staleness. On a dated archive, show its historical date without treating it as a late current edition. In preview, keep one unobtrusive “Editorial preview · Not published” label and avoid implying an operational delay. Reserve stronger notice treatment for actual corrections or unusable content.
3. Replace the four-cell story layout with continuous reading. Lead with the headline and factual summary, then a clearly labeled “Business implications” paragraph. Follow with context only where it adds a distinct fact; use a short “Next” line only for a supported upcoming event. Preserve the underlying evidence fields and uncertainty even when the presentation is simpler. Do not invent practical advice to fill a box. Aim for roughly 60–70 characters per line, 18–19px body type and 1.55–1.65 line height. Test actual text rather than forcing identical paragraph lengths.
4. Reduce typographic noise. Use two font families; remove monospace from routine labels and dates. Use sentence case for most utility text. Limit horizontal rules to the masthead, boundaries between stories and footer. Make language selection clear as “English / Español,” with an unambiguous active state and adequate touch target. Avoid a dominant black footer for such a short page.
5. Consolidate the ending. One light footer with Previous editions, source/editorial-method information and a compact disclosure of aggregation, AI assistance and review. Keep source links beside each story. Remove the repeated brand promise and duplicate masthead at the bottom.
6. Tighten prose separately from styling. The September 22 sample repeats the confidence-interval limitation in several sections; state the uncertainty once where it best explains the estimate, retaining qualifications needed for any separate claim. Prefer “INEGI” in a headline, explaining the institution once in the body. Remove throat-clearing such as “The business question is whether…” when the following sentence supplies the actual point. Preserve all facts, source attribution and bilingual equivalence; substantive candidate edits require a new review hash.

## Implementation sequence

- First: opening, date/status, typography, story flow, footer in shared templates and stylesheet.
- Second: bilingual copy tightening and date/time formatting. Use the September 22 candidate only as an explicitly dated design specimen, not as current news.
- Third: verify homepage, dated edition and archive list together; check one-story and three-story editions, long Spanish headlines, fresh/delayed/preview states, mobile at 390px and desktop at 1440px, plus 200% zoom.
- Fourth: show desktop and mobile before/after views for review. Keep publishing separate from design approval.

## Acceptance criteria

- A reader can identify the publication, edition date and first substantive headline immediately.
- At a standard desktop viewport the first story headline and start of its summary are visible without scrolling; mobile reaches the first headline without a promotional hero in the way.
- The actual story is visually dominant; normal publication status remains legible but secondary.
- Every heading earns its place; no duplicate promise, count, decorative number or label remains solely for symmetry.
- Comfortable reading width, usable source links, visible keyboard focus and no horizontal overflow in either language.
- Freshness remains truthful; preview and archival content cannot be mistaken for today's published edition.
- Existing source, approval, archive and release checks still pass. This pass adds no new product sections.

## Verification

Full release gate passed. Browser review covered 1440px desktop, 390px English and Spanish, archive navigation and the quiet stale-edition notice. Spanish mobile had no horizontal overflow. Preview tabs were refreshed. The sample copy was shortened and rehashed; it remains an unpublished September 22 specimen requiring renewed editorial review.
