# October 2026 industrial-release calendar

The official [INEGI 2026 calendar](https://www.inegi.org.mx/contenidos/saladeprensa/doc/cal_2026.pdf), page 4, schedules the national monthly industrial-activity indicator (IMAI) for October 12, reporting August 2026. Its release-time header specifies 06:00 a.m. without naming a timezone. The advisory metadata interprets that clock time as America/Mexico_City and derives 12:00 UTC; this timezone is an explicit scheduling assumption, not a quotation from the calendar. This is the national indicator, not the state-level industrial release.

The new event is advisory metadata only. It carries the exact release instant and reference month but does not enable mandatory ingestion, seed a result, change generation timing, or contain any unreleased figures. The existing trusted INEGI importer is CPI-specific and does not support IMAI. An industrial importer requires separate date, reference-period, full-PDF and pre-release tests before this event can become mandatory.

The existing publication window, budgets, locks and factual/translation gates are unchanged. A current official release can be incorporated only after publication and the existing editorial checks.
