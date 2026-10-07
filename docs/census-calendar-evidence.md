# Census calendar evidence

Complete reporting can describe a statistical release without naming the next one.
The October 7 source-packet replay demonstrated this for technology exports and
the U.S.–Mexico goods balance. The official [FT900 schedule](https://www.census.gov/foreign-trade/schedule.html)
provides a separate, attributable milestone. The Census [release index](https://www.census.gov/foreign-trade/Press-Release/current_press_release/index.html)
places country trade and advanced-technology products within FT900; the adapter
does not promise publication of a particular subtable.

`census-release-calendar.mjs` fetches that fixed URL at most once per edition,
including a failed request. It requires a located lead body that already passed
the complete-evidence size limit, a bilateral goods-flow headline, and Census
attribution in the fetched body. RSS text alone cannot supply the attribution.
Unrelated Census mentions, services, FDI, policy-only headlines and ambiguous
destinations receive no calendar evidence. These are evidence-routing decisions,
not exclusions from the candidate pool.

The parser validates the uniquely headed FT900 table, exact columns, complete
rows, observation months, release dates, weekdays and recognized notes. It rejects
inert or malformed markup, unknown qualifications and ambiguous dates. Advance
Economic Indicators and steel calendars on the same page are separate sources.

Only one complete scheduled row is emitted, with its report name, statistical
month, release date, weekday and Eastern release time. The edition's supplied clock
determines whether the entry is still ahead; there is no wall-clock fallback or
guessed date for TBD. The record goes immediately after the lead so optional
context cannot displace it at the six-record cap. Missing enrichment says nothing
about whether another source could supply a milestone.

This is a limited evidence improvement. It does not deduplicate reports, certify
an observable test, improve ranking, or establish that a generated edition will
pass. Existing factual, translation, independent-audit and spending limits apply.
Additional source bytes are included in the existing budget calculation.

The retained October 7 full-feed replay adds the scheduled entry to all three
matching trade reports, performs one calendar fetch, and leaves the locked set
unchanged. Its three-story Sonnet-plus-audit ceiling moves from $0.189980 to
$0.193344 with the October 7 reader-clarity guidance, within that day's unchanged $0.193548 limit. These are conservative
request ceilings, not billed calls or a model-output test. The duplicate trade
coverage and the separate FDI article's missing milestone remain unresolved.

## Remaining selection constraints

The October 4–7 retained cases distinguish article identity from release identity
and a new development. The same issuer/month can contain new measures, a revised
release or a later legislative stage. Mutable primary URLs and shared topics
cannot safely support permanent suppression of later coverage.

A future event contract needs source-backed issuer, document/version, observation
period, measure scope and procedural stage, plus a binding to the exact source
snapshot and any previously published artifact. Ambiguous identity must remain
unresolved. The current calendar adapter deliberately makes no such assertion.
