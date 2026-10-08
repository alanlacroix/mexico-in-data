# INEGI monthly CPI fixtures

These are original public INEGI indicator bulletins and public news metadata,
retained for offline source-integrity tests. The full PDFs are unchanged.
INEGI describes its statistical information as a public good and invites users
to use and share it in the bulletin's final page. Source attribution is retained.

- `inegi-inpc-september-2026.pdf`: [October 8 publication, September monthly results](https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2026/inpc/inpc_2q2026_10.pdf)
- `inegi-inpc-august-2026.pdf`: [September 9 publication, August monthly results](https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2026/inpc/inpc_2q2026_09.pdf)
- `inegi-inpc-september-2026.json`: full public news response captured after the October 8 release
- `inegi-inpc-first-half-september-2026.json`: pre-release response for the distinct September 24 first-fortnight publication

Metadata source: POST `acronimo=INPC&idNoticia=0&ingles=0` to
`https://www.inegi.org.mx/app/api/saladeprensa/api/saladeprensa/ObtenerInfoNoticia/v3`.
Synthetic mutations in the test are explicitly negative cases, not published data.
