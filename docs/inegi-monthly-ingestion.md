# Monthly INPC evidence

On October 8, the scheduled September CPI release was available through INEGI's
news service, while its configured topic page still returned an application shell
and the captured news feeds contained no release. The reviewed edition was
published through curated recovery. This adapter fixes that specific ingestion
gap; it does not establish that the rest of automatic selection or writing succeeds.

Only configured `inegi-cpi-YYYY-MM-DD` monthly obligations use this route. The fixed
public news POST identifies the monthly series, exact publication day and previous
calendar month's observation period. Its short summary is not complete evidence.
The adapter downloads the exact official dated PDF and reads every page. It checks
the INPC identity, printed day, consistent bulletin and page numbers, monthly
reference period and reported headline against the metadata. First-fortnight,
old, future, ambiguous, malformed or mismatched releases fail closed. Creation
metadata is not used as a publication timestamp.

The PDF URL cannot change host, path shape, query or fragment. Redirects are not
followed. Existing DNS, byte and time limits protect both requests. PDF.js receives
already bounded bytes, runs in a terminable worker with a five-second deadline,
and has evaluation disabled. Empty, missing, failed, mixed or excessive pages are
rejected. Complete extracted text must fit the unchanged serialized 16 KiB
evidence limit; no prefix clipping or summary fallback is permitted.

Validated text is held in a private in-memory map bound to the exact candidate.
Arbitrary feed properties cannot claim trusted PDF evidence. A generic same-day
RSS match cannot satisfy this monthly obligation before official validation.
Other sources retain their existing path. Published dates keep day precision;
the observed run time is recorded separately.

Mozilla PDF.js is pinned to `6.4.299`. Node 24 aligns the release check and Pages
build with the existing publishing runtime. Package inspection found an advisory
affecting a Node-20-compatible candidate, so that version was not selected.
The dependency and lockfile are pinned; this is not a general dependency upgrade.

Offline tests use complete official August and September bulletins and captured
monthly/first-fortnight metadata. They cover period rollover, source injection,
metadata ambiguity, incomplete pages, extraction deadlines, transport bounds,
the RSS false-match case, trusted evidence delivery and the existing size cap.
No provider calls, accounting changes or new edition are needed for these tests.

Sources: [INEGI news page](https://www.inegi.org.mx/temas/inpc/default.html),
[September bulletin](https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2026/inpc/inpc_2q2026_10.pdf),
[Mozilla's Node example](https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs),
[Pages build version configuration](https://developers.cloudflare.com/pages/configuration/build-image/).

The next day's lookback does not force the same release again. An older monthly
obligation is discharged only when the current hash-valid published edition has
a visible story with the exact official monthly PDF lead, matching publication
and story dates, and the matching primary article evidence cited by its headline.
A historical artifact can also discharge that exact event only when its validated
visible lead meets the same checks and a published accounting receipt matches both
its editorial date and immutable artifact hash. An archive file without that receipt,
a failed or held attempt, mismatched date/hash, candidate, weekly-only or supporting
link does not count. Same-day and newer releases remain required; unrelated new inflation
reporting remains eligible. This is exact event coverage, not a topic exclusion.
