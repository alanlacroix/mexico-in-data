# October 2026 industrial-release calendar

The official [INEGI 2026 calendar](https://www.inegi.org.mx/contenidos/saladeprensa/doc/cal_2026.pdf), page 4, schedules the national monthly industrial-activity indicator (IMAI) for October 12, reporting August 2026. Its release-time header specifies 06:00 a.m. without naming a timezone. The advisory metadata interprets that clock time as America/Mexico_City and derives 12:00 UTC; this timezone is an explicit scheduling assumption, not a quotation from the calendar. This is the national indicator, not the state-level industrial release.

The event remains advisory and optional. At or after its configured availability time, the IMAI adapter can discover an ordinary candidate from INEGI's news metadata and exact dated PDF. It checks both publication dates, the explicit reference month, national base-2018 series, bulletin identity and every complete page. The calendar alone never establishes an outcome. A missing PDF, HTML response, stale metadata or failed validation yields no candidate; it does not add a mandatory coverage obligation or a retry.

Validated IMAI candidates receive no scheduled priority or importance floor, obey existing published-URL exclusion and compete under the ordinary candidate/ranking caps. The complete source must fit the unchanged 16 KiB evidence limit. Existing bounded transport and PDF-worker limits remain in force. The October 12 PDF's complete five-page extraction fits in 11,445 serialized bytes.

The CPI and IMAI adapters expose immutable, privately bound source descriptors containing their verified series, reference period, publication date, bulletin and hash of downloaded PDF bytes. An absent issuer revision label remains unknown. These descriptors prove source identity only: they create no publication receipts, backfill no history and perform no new event suppression. General repeated-event detection and sourced next-step readiness remain separate limitations.

The existing publication window, budgets, locks and factual/translation gates are unchanged. A current official release can be incorporated only after publication and the existing editorial checks.
