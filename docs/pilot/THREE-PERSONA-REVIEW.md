# Three-reader editorial review

September 24, 2026. Astra review of the combined timeline/margin preview. These are simulated reader perspectives, not interviews or measured audience results.

## Overall judgment

The design has an identifiable editorial character, but the first combined version repeats too much and postpones its most useful information. It looks more sophisticated than the underlying explanatory copy. The right revision is to improve information density and reading order, not add another visual element.

## 1. Busy CEO: “Why am I reading a timeline before the news?”

- **High:** On mobile, the date, headline and three-step timeline consume almost the entire initial screen before the factual summary begins. The timeline becomes a toll the reader must pay to get to the story.
- **Medium:** “Its next move remains conditional” is weak headline language: most future policy decisions are conditional. It does not earn the length, especially in Spanish.
- **Medium:** The same rate appears in the headline, timeline and background. Repetition is useful only when each appearance changes the interpretation.

**Decision:** Put the factual summary directly under the headline. Keep the thread, but reduce its spacing and citation clutter. Cut headline filler. Do not add a separate executive-summary box that repeats the same news again.

## 2. Mexico-based finance director: “What does this change for my business?”

- **High:** “No policy-rate reduction to the financing backdrop” is abstract, while “a loan depends on its benchmark, spread and terms” reads like a textbook disclaimer. The paragraph needs a bounded interpretation of this decision, not general financial education.
- **Medium:** “Holgura económica” is accurate central-bank vocabulary, but a short executive brief should avoid stacking formal terms where plain Spanish works.
- **Medium:** The July release is more informative than the generic “picture has improved.” The useful distinction is a stronger reading for July versus proof of continuing growth.

**Decision:** Tighten implications around what the evidence actually establishes. Keep uncertainty; do not manufacture an action recommendation or a new forecast. Preserve the same meaning and numbers in both languages.

## 3. Skeptical editor: “Show me which claim comes from which document.”

- **High:** The same publisher label refers to different documents. Repeated “Banco de México” links look transparent but make verification unnecessarily slow.
- **Medium:** Marginal notes largely paraphrase the body. “Same month. Better information.” performs editorial confidence without adding much explanatory precision.
- **Medium:** Presentation fields were validated for presence and reference IDs but did not receive the same numeric/negation translation checks as core story fields.
- **High operational limit:** This remains an unpublished candidate. A current date in a local preview is not evidence of a working daily publication operation.

**Decision:** Use compact numbered citations with descriptive accessible names and uniquely anchored source entries. Distinguish reporting, statement/bulletin and decision history. Give the margin a concise, distinct interpretation; verify its references. Apply bilingual fidelity checks to timeline and margin copy too.

## Execution responsibilities

- **Sol:** Rewrite both candidate languages; shorten weak headlines and duplicate passages; preserve evidence and sync the two candidate files and weekly summaries; rehash and validate.
- **Terra:** Move factual summary before timeline; retain the combined identity; compact mobile rhythm and citations; implement accessible source anchors and descriptive source labels.
- **Astra:** Integrate, add missing archive story IDs for unique citation anchors, strengthen presentation-field fidelity checks, inspect desktop/mobile and both languages, run release checks, and push to the existing PR.

## Acceptance criteria

1. Factual summary precedes timeline in the visible and document reading order.
2. Two stories produce unique, working citation targets, including dated archive routes.
3. Source labels identify the document role, rather than just repeating a publisher name.
4. Both candidate copies remain byte-identical and hash-valid; core facts and uncertainty survive translation.
5. Timelines and margins remain visible without horizontal overflow at 390px and desktop width.
6. Existing release tests pass; no public edition or approval status is silently changed.

## Still unproven

The two-story selection is a useful dated specimen, not proof that the product consistently catches the developments executives need. The ten-weekday reader pilot and an observed source-to-live publication cycle remain necessary. Optional timeline/margin content also needs authored evidence; the automated drafting path currently omits those fields rather than inventing them.

## Final verification

- Full `npm run release` passed; seven existing retained-data freshness warnings remain.
- English and Spanish candidate pages checked at mobile/desktop widths; no horizontal overflow at 390px or 1280px. Summary precedes timeline.
- All ten presentation citations resolve to five unique source entries, including the dated Spanish archive. Statement, history, article and bulletin labels identify document roles.
- Integration caught and repaired a template source-list bug that omitted supporting documents; a rendered-template regression now requires every evidence source and citation target in both languages.
- Fixed English source-name expansion leaking into Spanish. Added numeric and negation fidelity regression checks for presentation fields.
- Candidate files are identical and validate successfully. Published edition and editorial approval status remain unchanged.
