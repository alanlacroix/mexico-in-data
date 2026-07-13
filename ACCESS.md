# How each source is pulled, and how often

Plain breakdown: **API vs. file-download vs. scrape**, the refresh cadence, and current status. This is the operational reality behind the data-health page.

## The three access types

**1. Clean APIs** — a URL returns JSON, we call it on a schedule. Easiest, most frequent, most reliable.
**2. Bulk file downloads** — a big CSV/XLSX we download whole, aggregate, and re-host as slim JSON. Heavier; some sit behind bot-blockers (WAF).
**3. Scrape / fight-the-WAF** — no clean endpoint; we mimic a browser. Fragile; last resort.

## The table

| Source | Data | Type | Auth | How often | Status |
|---|---|---|---|---|---|
| **CNE/Sener** (ex-CRE) | fuel prices | **API** (XML) | keyless | **every 4h** | ✅ live |
| **Banxico SIE** | policy rate, USD/MXN, reserves | **API** (JSON) | free token | daily/weekly | ✅ live |
| **Banxico SIE** | **remittances** | **API** | free token | monthly | ✅ live |
| **Banxico SIE** | CETES/Bonos curve, ITCR, expectations | **API** | free token | daily/monthly | 🔜 same API, next |
| **World Bank** | GDP, inflation, population *(comparison only)* | **API** | keyless | annual | ✅ live (placeholder) |
| **INEGI Indicadores** | INPC, PIB, IGAE, ENOE, trade, INPP | **API** (JSON) | free token | monthly/qtrly | ⏳ token works, IDs need refresh via their Constructor |
| **CONEVAL/INEGI** | municipal poverty | **file** (CSV) | keyless | ~5-yearly | ✅ live |
| **CONAPO** | marginación, remittances, population | **file** (CSV) | keyless | annual/qtrly | 🔜 reachable, next |
| **SESNSP** | crime by municipio | **file** (CSV, ~360MB) | keyless + **WAF** | monthly | ⏳ ingesting now |
| **IMSS** | formal jobs + wages by municipio | **file** (CSV, ~400MB) | keyless + **WAF (hard)** | monthly | ⛔ WAF-blocked; window-catcher running / manual browser download |
| **Sec. Economía** | FDI by state/sector | **file** (XLSX) | keyless | quarterly | 🔜 need current quarter's URL |
| **CNBV** | credit + financial inclusion (municipio) | file/API *(to confirm)* | keyless | monthly/qtrly | 🔜 new domain (Fable) |
| **SIAP/SADER** | agriculture by municipio | file *(to confirm)* | keyless | annual + prices daily | 🔜 new domain (Fable) |

## By refresh cadence (what updates when)

- **Every 4 hours:** fuel prices
- **Daily:** peso, policy rate, financial-market curves
- **Weekly:** reserves
- **Monthly:** remittances · inflation (INPC) · monthly activity (IGAE) · jobs (IMSS) · crime (SESNSP) · trade · unemployment
- **Quarterly:** GDP · FDI · municipio remittances
- **Annual / multi-year:** poverty · marginación · population · census · agriculture

## The honest reality on the two hard ones

- **APIs are easy** (Banxico, INEGI, World Bank, fuel) — a scheduled job calls them; done.
- **Big files are heavier but fine** when the host behaves (CONEVAL, CONAPO, SESNSP).
- **IMSS is the one genuine wall** — its host runs an Incapsula JS-challenge that blocks automated fetching. Options: the background window-catcher, a monthly local run on a residential IP, a one-click browser download by Al, or (durable) IMSS granting clean access. Everything else is tractable.

The rule everywhere: if a source can't be fetched or validated, it **fails closed** — the site serves the last good value and flags it on the data-health page. Nothing is ever faked.
