# Source gap research, 2026-08-01

What The Mexico Brief is missing, tuned to Alan's profile (payments operator, PE/VC and tech interest, US-Mexico, operating risk). Four research agents verified every candidate live on 2026-08-01: site active in 2026, real feed URL fetched, paywall and cadence checked. Two layers: sources already evaluated in `news-sources-2026-07.json` but never wired into `pipeline/news-sources.json`, and sources never evaluated before today.

Pipeline constraint respected: RSS/API only, Google News RSS queries as backstops. "Needs UA header" = feed is real but 403s to bot fetchers; the pipeline already handles this pattern (see Animal Político note in the July doc).

---

## ⚠ Naming collision (not a source, but found during research)

**themexicobrief.org** exists: an English-language weekly Friday briefing on Mexico (security, economy, trade, judicial reform, migration), free + paid tier, footer suggests a 2024-2025 launch. Near-identical territory and literally the same masthead as mexicobrief.com. Decide deliberately: differentiate the name, or coexist knowingly. Matters more the more public the site becomes.

---

## Layer 1: already evaluated in July, never wired (just wire them)

From `docs/strategy/news-sources-2026-07.json`. No new research needed.

| Source | Feed | Why for Alan | Flags |
|---|---|---|---|
| El Economista — Sector Financiero | `https://www.eleconomista.com.mx/rss/` (resolve section path on first pull) | THE Mexican banking/payments press beat | needs UA header, bot-hostile |
| Forbes México — Dinero | `https://forbes.com.mx/dinero/feed` | Banking/fintech coverage, second voice | needs UA header |
| DOF sumario.xml | `https://www.diariooficial.gob.mx/filtroRss.php` → sumario.xml | Fintech secondary regulation, circulars, decrees as published; strictly better than the current gnews-DOF approximation | official, clean RSS |
| Whitepaper.mx | `https://www.whitepaper.mx/feed` | Power/politics tip-off wire | Substack RSS confirmed; excerpts only, paid |
| Banxico tasObj RSS | `https://www.banxico.org.mx/rsscb/rss?BMXC_canal=tasObj&BMXC_idioma=es` | Rate-decision day trigger as news, not just data | already used for data board |
| Dallas Fed — Mexico Economic Update | `https://www.dallasfed.org/rss/` (Mexico topic) | ~8x/yr, US-side read on Mexican economy | needs UA header |
| PIIE | `https://www.piie.com/rss.xml` | Trade/USMCA context layer, weekly, low volume | clean |
| Federal Register API — USTR filter | `https://www.federalregister.gov/api/v1/documents.json?conditions[agencies][]=trade-representative-office-of-united-states&order=newest&per_page=20` | Authoritative 301/tariff actions; extends already-wired connector | verified JSON, no key |
| Aristegui — per-section feeds | `https://editorial.aristeguinoticias.com/category/mexico/feed/` | Investigations/accountability anchor | clean RSS |
| CNBV — Boletines de Prensa | no RSS (`cnbv.gob.mx/PRENSA/...`) | License grants land here first | covered instead by gnews query C below |
| BMV Eventos Relevantes | no RSS, scrape only | Issuer filings ahead of press | connector work, later |

---

## Layer 2: new research, by lane

### A. Payments & fintech (Kuenta core)

**Add now**
1. **FintechExpert.mx** — `https://www.fintechexpert.mx/feed` — es — daily-ish — free (small paid tier) — Mexico's leading fintech newsletter: license transitions, interchange, CNBV/Banxico moves. `{beat:"fintech", tier:"specialist", mx:false}`
2. **AMVO blog** — `https://blog.amvo.org.mx/rss.xml` — es — near-daily — free — e-commerce association: Barómetro, Consumer Pulse, how Mexicans pay online. The demand side of acquiring. `{beat:"fintech", tier:"specialist", mx:false}`
3. **PCMI (Payments and Commerce Market Intelligence)** — `https://paymentscmi.com/feed/` — en — ~monthly — free blog — the closest thing to analyst coverage of the exact acquiring/payments market. `{beat:"fintech", tier:"specialist", mx:true}`
4. **PYMNTS — Mexico tag** — `https://www.pymnts.com/tag/mexico/feed/` — en — ~monthly — free — low volume, high signal (Nu/Revolut license coverage). `{beat:"fintech", tier:"specialist", mx:false}`
5. **FinTech Futures — Mexico keyword** — `https://www.fintechfutures.com/keyword/mexico/feed/` — en — needs UA header — established paytech trade press with a maintained Mexico vertical. `{beat:"fintech", tier:"specialist", mx:false}`

**Worth considering:** AMI main feed (`https://americasmi.com/feed/`, broad LatAm noise; PCMI covers the payments angle better) · Miranda Intelligence "Mexico Fintech Chatter" (`https://mirandaintelligence.substack.com/feed`, good but the feed interleaves non-fintech series; needs title filter "Fintech Chatter") · Fintech News America (`https://fintechnews.am/fintech-latin-america/feed/`, feed reliability unverified) · Tearsheet (US-only relevance).

**Confirmed gaps (stop looking):** Banxico has NO payment-systems feed (SPEI/CoDi/DiMo stats, interchange) separate from general comunicados; Condusef has no feed (their APIs are B2B submission channels); Fintech México association has no feed; Finnovista's blog is dead since Dec 2021; Fintech Nexus pivoted to AI coverage (LatAm feed stale since Jun 2024); The Paypers has no RSS at all.

### B. Business & deal flow

**Add now**
1. **Arena Pública** — `https://www.arenapublica.com/rss.xml` — es — 2-3 substantial pieces/week — free, full text in feed — named-analyst business/policy analysis (Banamex sale deep-dive). Depth over volume. `{beat:"companies", tier:"specialist", mx:false}`
2. **Startups Latam** — `https://startupslatam.com/feed/` — es — daily — free — deal flow with amounts and investors. `{beat:"deals", tier:"specialist", mx:true}`
3. **Datoz** — `https://www.datoz.com/feed/` — es — near-daily weekdays — free — industrial/office real-estate intelligence; reads like a nearshoring deal ticker (FIBRA deals, plant investments, datacenter demand). Not covered by anything currently wired. `{beat:"deals", tier:"specialist", mx:false}`
4. **Dinero en Imagen** — `https://www.dineroenimagen.com/rss.xml` — es — 2-3x/week — free — respected named columnists on banking/fintech/pensions. `{beat:"economy", tier:2, mx:false}`

**Worth considering (high volume, add only if the scorer holds):** Alto Nivel (`https://altonivel.com.mx/feed/`) · Líder Empresarial (`https://www.liderempresarial.com/feed/`). **Recheck later:** Nearshore Americas (`https://nearshoreamericas.com/feed/` returns valid RSS with zero items, broken); Rest of World (global feed only, no Mexico tag feed).

**Rejected with cause:** Sentido Común (WAF-blocked beyond UA fix; beware two similarly named regional outlets) · Axis Negocios (no RSS, newsletter-first) · América Economía (unreachable) · Business Insider México (domain dead) · LABS (folded into EBANX) · TTR/PitchBook/Mergermarket (gated) · Endeavor México (broken TLS) · 500.co, Solili, Real Estate Market, CBRE/JLL (no feeds) · EjeCentral, La-Lista (no feed / off-lane) · Neta (couldn't confirm existence).

### C. Macro, policy & insight (the "drivers" layer)

**Add now**
1. **Mexico Decoded (Viri Ríos)** — `https://www.mexicodecoded.com/feed` — en — weekly — free + paid — mechanisms, not events; the most-subscribed English Substack on Mexico. `{beat:"politics", tier:1, mx:false}`
2. **The Mexico Political Economist** — `https://www.mxpe.org/feed` — en — 2-3x/week — free + paid — markets and governance in one lens (USMCA breakdowns). `{beat:"politics", tier:1, mx:false}`
3. **Latin America Risk Report (Boz)** — `https://boz.substack.com/feed` — en — Tue+Fri free — Mexico as a node in the regional system; superforecaster discipline. `{beat:"politics", tier:1, mx:true}`
4. **CEESP** — `https://ceesp.org.mx/index.php/category/analisis-economico/feed` — es — weekly Mondays — free — the private sector's standing economic column since 1963. `{beat:"economy", tier:"specialist", mx:false}`
5. **Atlantic Council LatAm** — `https://www.atlanticcouncil.org/region/latin-america/feed/` — en — several/week — free. `{beat:"us-mexico", tier:"specialist", mx:true}`
6. **Integralia** — `https://integralia.com.mx/web/en/feed` — en — ~monthly — free summaries — boutique Mexico political risk; annual "Ten Political Risks" is a business-community reference. `{beat:"politics", tier:"specialist", mx:false}`
7. **MPI — Mexico feed** — `https://www.migrationpolicy.org/rss/taxonomy-term/72` — en — needs UA header — rigorous migration-policy mechanics. `{beat:"us-mexico", tier:"specialist", mx:false}`
8. **Signos Vitales** — `https://signosvitalesmexico.org/feed/` — es — ~monthly — free — structural drivers behind headline stats. `{beat:"politics", tier:"specialist", mx:false}`
9. **Podcasts (RSS by nature):** Norte Económico (Banorte) `https://anchor.fm/s/21bbf064/podcast/rss` weekly · CSIS Mexico Matters `https://feeds.megaphone.fm/mexicomatters` monthly.

**No feed exists, use gnews backstops (queries below):** BBVA Research México (content is exactly on-brief; no RSS after exhaustive checks) · Banco Base / Gabriela Siller (most-quoted private economist; no blog feed) · IMEF indicator (PDF only) · Citi Encuesta de Expectativas (alive, moved from Citibanamex to Citi global research Nov 2024, no public release page found).

**Bot-walled, retry manually with browser UA (feeds likely exist):** México Evalúa · México ¿Cómo Vamos? · Baker Institute Mexico Center · WOLA.

**Rejected with cause:** Brookings (feed system DNS-dead) · CFR (no feed) · Monex (dead since 2018) · GBM (broken feeds) · CIDE (valid XML, zero items) · Expansión Daily and Mexico Today (recaps, not analysis) · Mexico's Newsletter (dead since 2020) · "The Wire Mexico", "Un poco de contexto" (not found active).

### D. Security as operating risk

**Add now**
1. **InSight Crime — Mexico tag** — `https://insightcrime.org/tag/mexico/feed/` — en — near-daily — free — who controls which plaza and how it shifts; the structural context behind city-level extortion variance. `{beat:"security", tier:"specialist", mx:true}`
2. **TT Club news** — `https://www.ttclub.com/news-and-resources/news/rss` — en — near-weekly, mixed global — free — periodic Mexico cargo-theft reports name exact corridors (2025: Puebla-CDMX 150D). `{beat:"security", tier:"specialist", mx:false}`
3. **Justice in Mexico (USD)** — `https://www.justiceinmexico.org/feed/` — en — ~bimonthly — free — judicial/prosecutorial capacity: whether an extortion complaint goes anywhere, by state. `{beat:"security", tier:"specialist", mx:true}`

**Monthly manual ritual (PDFs/report pages, no feeds; more for Kuenta ops than the site):**
- Coparmex extortion index — quarterly PDF (`coparmex.org.mx/downloads/ENVIOS/MS_RP_[Month][Year]_VF.pdf` pattern): states above the 49.7% extortion-incidence average; 37.7% of MSMEs pay.
- ANPEC boletines (`anpec.com.mx/boletines/`) — extortion + robo hormiga against tienditas: the closest analog to a merchant base.
- Consejo Ciudadano CDMX (`consejociudadanomx.org/reportes`) — monthly, most granular city-level incidence found.
- Overhaul Mexico Cargo Theft Report — quarterly, lead-gen gated (Q1-2026: 82% of theft in 10 states; EdoMex+Puebla = 32%).
- AMIS (`amisprensa.org/autos`) — monthly-ish insured-vehicle theft by state.
- ONC (`onc.org.mx/publicaciones`) — quarterly high-impact crime + standing extortion study.
- Mexico Peace Index (economicsandpeace.org) — annual May: state ranking + violence cost as % of state GDP.
- OSAC Mexico Country Security Report — needs free private-sector constituent account; check whether Kuenta qualifies.

**Rejected with cause:** Crisis Group (Mexico not an active program) · Lantia (fully client-gated now) · Noria (stale since Nov 2024) · Mexico Violence Resource Project (nothing past May 2023 confirmable) · Semáforo Delictivo (possibly dormant, ~Feb 2025) · Intersecta (off-lane) · Sensitech (absorbed by Overhaul) · Coparmex general feed (advocacy noise; the index PDF is the artifact).

---

## Google News query feeds (all tested live 2026-08-01)

A. **Payments company watchlist** (11/12 sampled items on-topic with the qualifier clause):
`https://news.google.com/rss/search?q=(Clip+OR+%22Mercado+Pago%22+OR+Getnet+OR+Kushki+OR+Stori+OR+%22Nu+M%C3%A9xico%22+OR+Klar+OR+Plata+OR+Ual%C3%A1+OR+Openpay+OR+Billpocket+OR+Konfio)+(fintech+OR+pagos+OR+tarjeta)+M%C3%A9xico&hl=es-419&gl=MX&ceid=MX:es`

B. **Rails & regulation** (SPEI/CoDi/DiMo/interchange/Ley Fintech; qualifier needed, "CoDi" alone collides with an MLB player):
`https://news.google.com/rss/search?q=(SPEI+OR+CoDi+OR+DiMo+OR+%22Ley+Fintech%22+OR+adquirencia+OR+%22cuotas+de+intercambio%22)+(Banxico+OR+CNBV+OR+pagos+OR+fintech)&hl=es-419&gl=MX&ceid=MX:es`

C. **CNBV enforcement/licensing** (caught Plata's banking authorization and IFPE approvals in testing; substitutes for CNBV's missing feed):
`https://news.google.com/rss/search?q=CNBV+(sanciona+OR+revoca+OR+autoriza+OR+multa+OR+suspende)+(ITF+OR+IFPE+OR+fintech+OR+%22instituci%C3%B3n+de+pagos%22)&hl=es-419&gl=MX&ceid=MX:es`

D. **M&A / private equity Mexico:**
`https://news.google.com/rss/search?q=(fusiones%20OR%20adquisiciones%20OR%20%22capital%20privado%22%20OR%20%22private%20equity%22)%20M%C3%A9xico&hl=es-419&gl=MX&ceid=MX:es`

E. **VC / funding rounds Mexico:**
`https://news.google.com/rss/search?q=%22venture%20capital%22%20OR%20%22ronda%20de%20inversi%C3%B3n%22%20OR%20startup%20M%C3%A9xico&hl=es-419&gl=MX&ceid=MX:es`

F. **Nearshoring investment (EN, covers Nearshore Americas' broken feed):**
`https://news.google.com/rss/search?q=nearshoring%20investment%20Mexico%20factory%20OR%20plant%20OR%20%22industrial%20park%22&hl=en-US&gl=US&ceid=US:en`

G. **Merchant-targeting crime** (same-day shop-level extortion stories across six states in testing):
`https://news.google.com/rss/search?q=extorsi%C3%B3n+comercio+OR+negocio+OR+%22cobro+de+piso%22+OR+%22robo+de+transporte%22+OR+%22robo+a+cuentahabiente%22&hl=es-419&gl=MX&ceid=MX:es`

**Backstops for feedless analysts:** `site:bbvaresearch.com Mexico` and `"Gabriela Siller" OR "Banco Base"` as gnews queries if their voices prove worth ingesting.

---

## Suggested first wave (if wiring ~12, in this order)

1. gnews A (watchlist) · 2. gnews B (rails/regulation) · 3. gnews C (CNBV enforcement) · 4. FintechExpert.mx · 5. El Economista Sector Financiero (UA work) · 6. AMVO · 7. Mexico Decoded · 8. The Mexico Political Economist · 9. Startups Latam · 10. Datoz · 11. InSight Crime Mexico · 12. gnews G (merchant crime) + DOF sumario.xml as the official layer.

Volume caution: the whole point is less noise. Wire quality-dense feeds first; hold Alto Nivel / Líder Empresarial / FinTech Futures until the significance scorer proves it filters well at current volume.

---
---

# Run 2 (2026-08-01, later the same day): sections landed + three new lanes verified

## Landed section structure (Alan ratified all three forks)

1. **Payments & fintech** (e-commerce folded in as the demand side)
2. **Deals & investment** (VC, PE, M&A, FDI/plants, industrial real estate)
3. **Economy** (macro; "Mexico Macro" and "Economy" are the same section)
4. **U.S.–Mexico** (trade as the spine; **Mexico–China as a labeled standing theme**, not a section)
5. **Politics**
6. **Security & society**
7. **Energy & infrastructure** (new)

Section-page concept: each section leads with the **top stories of that week** (curated, 3-5), then go-deeper layers (quarterly MY VIEW, data, archive). Run 3 designs this.

Pipeline note for run 3: add one new beat `energy` to `beatToTag` (covers both energy and infrastructure items; one site section). Existing beats map cleanly: fintech → Payments & fintech · deals → Deals & investment · economy + companies → Economy (scorer may route M&A items to Deals) · us-mexico → U.S.–Mexico · politics → Politics · society + security → Security & society.

## Energy & infrastructure (was the one empty lane; now verified)

**Add now**
1. **Pemex — boletines nacionales** — `https://www.pemex.com/saladeprensa/boletines_nacionales/_layouts/listfeed.aspx?List=%7b7626F8B4-FCAD-41B1-AEE3-2B66E60B61E0%7d` — es — several/week — free — primary-source RSS, confirmed live same-day: financials, incidents, fuel-price enforcement. `{beat:"energy", tier:"specialist", mx:false}`
2. **Energía a Debate** — `https://www.energiaadebate.com/feed/` — es — multiple/day — free — business/fiscal-framed Pemex+CFE coverage. `{beat:"energy", tier:"specialist", mx:false}`
3. **T21** — `https://t21.com.mx/feed/` — es — near-hourly — free — transport/rail/ports/logistics at "is the corridor on schedule" altitude; triple-corroborated. `{beat:"energy", tier:"specialist", mx:false}`
4. **Inmobiliare** — `https://www.inmobiliare.com/feed/` — es — several/day — free — industrial real estate with nearshoring vacancy/absorption data ("are the parks full"). `{beat:"energy", tier:"specialist", mx:false}` (also feeds Deals)
5. **Global Energy** — `https://globalenergy.mx/feed/` — es — multiple/day — free. `{beat:"energy", tier:"specialist", mx:false}`
6. **Energy Magazine** (ex Oil & Gas Magazine, old domain 301s here) — `https://energymagazine.mx/feed/` — es — multiple/day — free. `{beat:"energy", tier:"specialist", mx:false}`
7. **Energy21** — `https://energy21.com.mx/feed/` — es — multiple/day — free. `{beat:"energy", tier:2, mx:false}`

**Worth considering:** Petróleo y Energía (`https://petroleoenergia.com/feed/`, vendor-PR dilution) · Energía Hoy (`https://energiahoy.com/feed/`, noise ratio unproven) · DCD LatAm (`https://www.datacenterdynamics.com/es/atom/`, needs aggressive Mexico keyword filter, 0/6 Mexico in sample) · PV Magazine México (`https://www.pv-magazine-mexico.com/feed/`, needs UA header, ~2/10 Mexico-specific) · Obras por Expansión (`https://obras.expansion.mx/rss` works; the advertised `/index.rss` is stale — treat as fragile) · Centro Urbano (`https://centrourbano.com/feed/`, housing-first) · Pemex regionales feed (CSR dilution) · Mexico Energy Insights blog (niche CFE-billing angle, thin cadence).

**Rejected with cause:** BNamericas (best content fit found, but NO feed exists + robots blocks AI fetchers → use gnews `site:bnamericas.com` backstop) · Argus, S&P Platts (paywalled/no public feeds) · **CFE press portal (no RSS + broken TLS cert; data connector unaffected)** · SICT, ASEA (gob.mx platform exposes no press feeds) · El Financiero energía category (arc feed exists but returns zero items; 8 variants tested) · El Economista energía (blocked, no incremental value over backstop) · Forbes energía (token-gated) · Energía Estratégica (Next.js, no feed) · Energía Limpia XXI (DNS dead) · Manufactura.mx (stale 2021/unreachable) · Mundo Marítimo (.cl, no feed, LatAm-wide) · El Vigía (name collision, unrelated regional papers) · TyT (real 70-yr trade mag, no feed) · **Cluster Industrial, Vanguardia Industrial, The Logistics World (real, active, on-topic per live gnews sampling — feed URLs unresolved; second-pass candidates)**.

## E-commerce sub-beat (inside Payments & fintech)

**Add now**
1. **Retailers.mx** — `https://retailers.mx/feed/` — es — daily — free — **needs UA header** — tightest Mexico retail signal found (OXXO traffic, Liverpool digital numbers, Tiendas 3B raise). `{beat:"fintech", tier:"specialist", mx:false}`
2. **Marketing4eCommerce México** — `https://marketing4ecommerce.mx/feed/` — es — multiple/day — free — dedicated MX edition, clean feed. `{beat:"fintech", tier:2, mx:false}`

**Notes:** América Retail **rejected — the outlet announced it ceases operations 2026-08-01, literally today**; feed is a zombie. Merca2.0 only viable behind keyword post-filter (firehose). Modaes LatAm section behind a Cloudflare JS challenge. The CIU has no RSS (paid research shop). **El Economista feeds are real (declared in their own `<head>`: `/rss/home.xml`, `/rss/empresas.xml`) but CloudFront-403 to datacenter IPs — TEST FROM THE PIPELINE'S PRODUCTION EGRESS (GitHub Actions) before writing off; may just work there.** Forbes México feeds are token-gated (no header trick fixes).

## Mexico–China theme (inside U.S.–Mexico)

**Add now**
1. **MEXCHAM (Mexico-China Chamber)** — `https://www.mexcham.org/feed/` — en — several/week — free — the best find of run 2: DiDi's $57M EV investment, MG leading Chinese brands H1-2026, the proposed 82% USMCA regional-content rule. Caveat: chamber, not newsroom — promotional tilt on investment-attraction items. `{beat:"us-mexico", tier:"specialist", mx:false}`
2. **Dialogue Earth ES** (ex Diálogo Chino) — `https://dialogue.earth/es/feed/` — es — near-daily — free — China's LatAm footprint; Mexico items episodic, needs Mexico keyword filter. `{beat:"us-mexico", tier:2, mx:true}`

**Notes:** The Wire China: pedigree on this exact storyline but paywalled + feed ships empty boilerplate descriptions; human-click occasionally, not pipeline. Cechimex (UNAM, Dussel Peters): org alive (20th anniversary May 2026) but website DNS-dead; recheck periodically. Red ALC-China: Cloudflare-walled PDF monitor, wrong shape. China Briefing: zero Mexico coverage in two samples despite the name.

## New Google News query feeds (all live-tested with on-topic rates)

H. **Energy** (~73% on-topic; exclusions kill pension-protest and AC-tips noise):
`https://news.google.com/rss/search?q=Pemex+OR+CFE+OR+%22red+el%C3%A9ctrica%22+OR+apag%C3%B3n+OR+%22planta+solar%22+OR+%22parque+e%C3%B3lico%22+OR+%22energ%C3%ADa+renovable%22+OR+%22centro+de+datos%22+-jubilados+-pensiones+-%22aire+acondicionado%22&hl=es-419&gl=MX&ceid=MX:es`

I. **Infrastructure / nearshoring-physical** (~85-90%; drought clause scoped to Mexico to kill Rhine/Danube leakage):
`https://news.google.com/rss/search?q=%22Tren+Maya%22+OR+%22Corredor+Interoce%C3%A1nico%22+OR+puertos+OR+%22parque+industrial%22+OR+%22parques+industriales%22+OR+(sequ%C3%ADa+M%C3%A9xico+agua)+OR+apagones+OR+nearshoring&hl=es-419&gl=MX&ceid=MX:es`

J. **E-commerce Mexico** (~85-90% after refinement; bare "Amazon" was ~30% — coupon-roundup noise):
`https://news.google.com/rss/search?q=%28%22Mercado%20Libre%22%20OR%20%22Amazon%20M%C3%A9xico%22%20OR%20Shein%20OR%20Temu%20OR%20%22comercio%20electr%C3%B3nico%22%20OR%20AMVO%20OR%20Rappi%20OR%20%22%C3%BAltima%20milla%22%29%20M%C3%A9xico%20-cup%C3%B3n%20-descuento%20-oferta%20-rebaja&hl=es-419&gl=MX&ceid=MX:es`

K. **Mexico–China** (~90% after dropping bare "BYD", which was ~20% — car-review noise):
`https://news.google.com/rss/search?q=%28%22inversi%C3%B3n%20china%22%20OR%20%22empresas%20chinas%22%20OR%20%22planta%20de%20BYD%22%20OR%20%22f%C3%A1brica%20de%20BYD%22%20OR%20transbordo%20OR%20triangulaci%C3%B3n%20OR%20%22aranceles%20a%20China%22%20OR%20%22productos%20chinos%22%20OR%20%22banco%20chino%22%29%20M%C3%A9xico&hl=es-419&gl=MX&ceid=MX:es`

## Consolidated wiring list (both waves, ~26 entries)

**Wave 1 (Kuenta + insight + deals + risk):** gnews A watchlist · gnews B rails/regulation · gnews C CNBV enforcement · FintechExpert.mx · El Economista Sector Financiero (UA; test from prod egress) · AMVO · Mexico Decoded · The Mexico Political Economist · Startups Latam · Datoz · InSight Crime MX · gnews G merchant crime · DOF sumario.xml

**Wave 2 (new sections):** Pemex nacionales · Energía a Debate · T21 · Inmobiliare · gnews H energy · gnews I infrastructure · Retailers.mx (UA) · Marketing4eCommerce MX · gnews J e-commerce · MEXCHAM · gnews K Mexico-China · Dialogue Earth ES (MX filter)

**Coverage after both waves, by section:** Payments & fintech STRONG · Deals & investment STRONG · Economy STRONG · U.S.–Mexico STRONG (China theme fed) · Politics STRONG · Security & society ADEQUATE+ritual · Energy & infrastructure STRONG (was zero).

**Remaining known holes:** CFE press (no feed exists — gnews H catches CFE news) · BNamericas (gnews site: backstop if wanted) · Cluster Industrial / Vanguardia Industrial / The Logistics World (second-pass feed hunt) · Cechimex (site down, recheck) · analyst voices BBVA/Siller (gnews backstops drafted in run 1).

**Run 3 (next):** wire both waves into `pipeline/news-sources.json` (incl. UA-header support where flagged and the new `energy` beat mapping), then design the section pages: weekly top 3-5 per section, ranking rules, and how sections + themes render on the site.
