# Topic-page visual grammar

The six topic rooms use one production contract. The content can differ; the reading order cannot.

`Topic switch → Scope + current read → Dated snapshot → Primary evidence → Topic modules → What changed + Next → Sources and method`

The six routes are Economy & money, Payments, Trade, Politics, Society & security, and U.S.–Mexico. `money.html` and `security.html` are redirects, not extra rooms.

## 1. Topic switch

- Desktop: all six rooms are visible as links. Mobile: one native select.
- The selected room has a non-color state and `aria-current="page"`.
- Switching topics changes the route. There is no query-string prototype hiding behind the page.

## 2. Scope and current read

- The H1 names the room. The scope says what belongs there in one line.
- The current read is computed from loaded data or a dated registry entry. No number or date is filled in from memory.
- A page-level note describes the range of observation dates. It never turns `fetchedAt` into an observation date.
- If required inputs are missing, the room says so and links to Sources. It does not print a stale fallback.

## 3. Dated snapshot

- Three or four readings, each with value, unit, comparison, plain-language context, original source and observation period.
- Comparisons are computed from the series. Rate differences use percentage points; level changes use percent only when that is the actual comparison.
- Structural annual facts stay annual even when the page was checked today.
- A tile can link to Charts, Atlas or the primary source, but the source is always visible on the tile.

## 4. Primary evidence

Every room has one main exhibit. Trade may add export composition because the basket answers a separate question.

Every exhibit has:

1. a plain takeaway title;
2. measure, unit and period;
3. a chart or timeline;
4. a Chart/Table control with `aria-pressed`;
5. an exact-value table using the same rows as the visual;
6. original source links;
7. “What it shows” and “What it does not show.”

The chart vocabulary is line/dual-line, sorted horizontal bar, grouped bar, 100% stacked bar, timeline, map plus ranked list, treemap, and table. A treemap is never the default on a narrow screen; its exact table opens instead.

## 5. Topic modules

- Two to four useful ways to read the topic, all based on the loaded inputs.
- Modules connect datasets without claiming causality. “Look at these together” is allowed; “this caused that” needs a cited analysis.
- Each module ends in a useful action: open the chart, evidence, Atlas or source.
- No filler card is added to make a row look even.

## 6. What changed and next

- “What changed” contains dated releases or developments already in the local source registry. It does not invent a summary from a headline.
- “Next” is future-dated only and comes from `data/events.json`.
- An empty state is better than an unsupported item.
- Politics uses the official calendar itself as its main evidence. U.S.–Mexico does not publish a negotiating claim until the exact official statement is in the registry and passes link checks.

## 7. Sources and method

- Every room ends with the exact sources used on that page and a short method note.
- Different ledgers stay separate. In particular, Banxico’s national trade accounts are not spliced into the U.S. Census bilateral ledger.
- Projections, registrations, survey estimates and administrative counts are labeled as such.

## 8. Shared display rules

- Observation period and retrieval time are different clocks. Cards and exhibits show the observation period; retrieval status lives on Sources.
- Green means Mexico/current/selected, charcoal is the main comparison, gray is secondary, amber is stale or incomplete, muted red is unavailable. Direction is neutral.
- Rendered chart text is at least 12px, controls are at least 44px, and the page has no horizontal overflow at 375px.
- All charts have accessible names, keyboard-operable controls and exact tables.
- Visible totals reconcile with visible components at the displayed precision.

## 9. Data failure rule

Production pages are generated from one route registry and one renderer. Before showing a room, the renderer checks the inputs that room needs. A failed annual reconciliation removes that exhibit. A missing required series produces a clear unavailable state. It never inserts an old hard-coded value.
