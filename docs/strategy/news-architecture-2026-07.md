# The Mexico Brief — news & data architecture

## 1. The picture in three sentences

Every 6 hours a robot visits ~20 news feeds, saves each headline as a small record into a ledger file in the repo (one file per week), and rebuilds the site's Wire from the newest 72 hours of that ledger — no AI involved. Every Saturday night a second robot rereads the whole week's ledger, groups duplicate stories, scores them 0–10, fetches the full article text of only the ~30 finalists, and writes an email draft whose every sentence comes from that fetched text and whose every link is machine-checked against it. Sunday you get a preview and tap approve; Monday morning the email goes out — same ledger, two windows: the site reads it daily, the email reads it weekly.

## 2. The source set

Two lanes. The **feed lane** (RSS/API — reliable, phase 1) and the **scrape lane** (no RSS — fragile, phase 2). GDELT stays as the wire backstop: Reuters, AP, and Bloomberg killed public RSS, so they enter *only* through the GDELT allowlist you already run. Never build direct connectors for them.

### Phase 1: the starting ~20 (all RSS or API, zero scrapes)

| # | Source | Beat | Tier | Access | Watch out |
|---|--------|------|------|--------|-----------|
| 1 | GDELT allowlist (existing) | all wires | tier-1 | API | Add reuters.com, bloomberglinea.com, eleconomista.com.mx to the allowlist |
| 2 | **DOF sumario.xml** | politics (official lane) | tier-1 | RSS | Primary source — what actually became law. Feeds "What to Watch" too |
| 3 | Aristegui Noticias — México | politics | tier-2 | RSS | Clean feed, verified. Anchor |
| 4 | Animal Político | politics | tier-2 | RSS | Real feed; 403s bots — needs browser User-Agent |
| 5 | El Universal (arc general) | politics | tier-2 | RSS | High volume; use arc outboundfeeds path, legacy path is dead |
| 6 | Guardian — Mexico | politics / US-MX | tier-1 | RSS | English, free, full text. Corroboration |
| 7 | **iupana** | payments & fintech | specialist | RSS | Verified clean. The anchor of your core beat |
| 8 | Contxto | fintech / deals | specialist | RSS | Verified; cadence has thinned — secondary |
| 9 | El CEO | fintech / companies | tier-2 | RSS | Verified clean. Keyword-filter to fintech/banca |
| 10 | El Financiero — Empresas | companies | tier-2 | RSS | Verified, hourly. The corporate spine |
| 11 | El Financiero — Mercados | companies / markets | tier-2 | RSS | Verified. Dedup against Empresas |
| 12 | El Financiero — Economía | economy | tier-2 | RSS | Verified live with 12 fresh items |
| 13 | Expansión — Empresas | companies | tier-2 | RSS | Verified (`/rss/empresas`); resolve Economía slug once from `/canales-rss` |
| 14 | **LatamList** | VC & deals | specialist | RSS | Verified, deal-by-deal. Filter pan-LatAm feed to Mexico |
| 15 | Crunchbase News | deals | tier-2 | RSS | Root `/feed/` only (section feeds 404). Mexico keyword filter |
| 16 | Bloomberg Línea | economy / fintech | tier-2 | RSS | Arc feed verified but pan-LatAm + partial paywall: headline signal only, filter `/mexico/` |
| 17 | Federal Register API — USTR filter | US-Mexico | tier-1 | API | Extends the connector you already run — one query param |
| 18 | Federal Register API — CBP filter | US-Mexico | tier-1 | API | Same connector, second agency slug |
| 19 | Google News RSS — USMCA/tariffs query | US-Mexico | aggregator | RSS | Verified live. Filter to allowlist domains, dedup against GDELT, never summarize its snippets |
| 20 | CBP media releases | US-Mexico | tier-1 | RSS | GovDelivery feed; 403s bots — UA header, scrape fallback |

Also cheap to include from day 1: TechCrunch `/tag/mexico/feed/` (verified, fires rarely but only on big stories) and Banxico's `tasObj` indicator RSS as a rate-decision-day trigger (partly wired already).

**Why this cut.** Every phase-1 source is RSS or a keyless JSON API — one generic fetcher covers all of them, and nothing breaks when a site redesigns. Each email room gets an anchor: DOF + Aristegui (politics), iupana + El CEO (payments — the Kuenta room gets two), El Financiero + Expansión + LatamList (companies & deals), El Financiero Economía + Bloomberg Línea (economy), Federal Register + Google News (US-Mexico). Corroboration across 2+ outlets is a scoring input, so you need overlapping generalists, not maximal coverage.

### Phase 2: the scrape lane (high value, build after the weekly ships)

| Source | Why it's worth a scraper | Fragility |
|--------|--------------------------|-----------|
| **BMV Eventos Relevantes** | Primary source for M&A, earnings, exec moves — outlets report *from* it | No RSS/API; stable listing page |
| **CNBV boletines** | Fintech license grants (IFPE/IFC) land here first — Kuenta gold | No RSS; key by boletín number + date |
| Banxico comunicados + policy statements | SPEI/CoDi/DiMo news; rate statements. Use the tasObj RSS as the decision-day trigger to fetch the PDF | Scrape-only, but calendar-driven |
| USTR press office | USMCA joint-review readouts — the narrative the FR API lacks | No RSS; stable HTML |
| INEGI boletines | Caption a data print as a news item; release calendar known in advance | Data already wired via API |

### Honestly flagged: paywalled / fragile — headlines only or skip

**Reforma** (hard paywall + bot wall: significance signal only, never summarize), **Proceso** and **El País** (partial paywalls, phase 2 corroboration), **El Economista** and **Forbes México** (bot-hostile — reach via GDELT allowlist instead of direct feeds), **Whitepaper.mx** (excerpt-only paid Substack: tip-off feed at best), **Inside U.S. Trade** and **LAVCA** (no RSS + subscription: keep the domains on the allowlist so GDELT/Google News surface them; don't build connectors), **Milenio/Excélsior** (add later only if corroboration volume feels thin).

## 3. The pipeline: daily vs weekly

One store, two read paths. The **collector** writes; the site and the email both read.

**Every 6 hours (extends the existing cron) — no LLM anywhere:**

```
collect-news.js
  1. FETCH    every source in sources.json (RSS/API; UA header + 1 retry)
              + existing GDELT builder, unchanged
  2. NORMALIZE canonical URL (strip utm/query) → id = hash(url)
              apply per-source filters (Mexico keywords on pan-LatAm feeds)
  3. DEDUP    skip ids already in this week's or last week's file
  4. APPEND   new items → data/news/2026-W28.json   (the ledger)
  5. VIEW     rebuild data/news/wire.json = last 72h, newest first, per beat
  6. HEALTH   update data/news/health.json (per-source last_success, item counts)
  7. COMMIT   → GitHub Pages redeploys → the Wire updates
```

The site's Wire switches from reading GDELT-only `news.json` to reading `wire.json` — same rendering, richer input. Headlines + deks only; that's all RSS gives you and all the Wire needs.

**Saturday ~23:00 CDMX (new weekly GitHub Actions workflow) — the only place an LLM runs:**

```
build-email.js
  1. LOAD      this week's ledger file (+ spillover from last 24h of prior file)
  2. CLUSTER   group same-story-different-outlet: normalized-title similarity
               within ±36h (code, not LLM)
  3. PRIOR     deterministic score inputs per cluster: # of corroborating
               outlets, best source tier, DOF/Federal-Register/BMV backing,
               payments-beat flag
  4. SCORE     LLM scores each cluster 0–10 for significance, given headlines
               + deks + the prior. Kuenta-relevance boost on Payments room
  5. SHORTLIST top N per room (rooms with nothing ≥ threshold are suppressed);
               1–3 clusters ≥8 become Top of the Week
  6. FETCH     full article text for shortlisted items ONLY, allowlist domains
               only → data/email/2026-W28.fetched.json  (the evidence file)
  7. SUMMARIZE LLM writes each item from the fetched text it is handed —
               nothing else in context. Paywalled sources → headline + link only
  8. VALIDATE  extract every URL from the draft; assert each one exists in
               fetched.json. Any miss = hard build failure, no draft
  9. DRAFT     write data/email/2026-W28.draft.json + render preview HTML page
 10. NOTIFY    open a GitHub issue "Brief W28 — Sunday preview" with the link
```

**Sunday:** you read the preview, rewrite the opening, and approve every analytical sentence.
**Monday:** run `prepare-beehiiv-review` for the exact week. It exports a review artifact and cannot send. Enter the reviewed body in Beehiiv's Post Builder, send a Beehiiv test, check the delivered version, then schedule or send from Beehiiv. Beehiiv owns sign-ups, unsubscribes, and delivery; do not build a second subscriber system. Data board numbers come straight from the connector JSON you already have.

## 4. The store design

Git is the database. It's append-only, versioned, backed up, and free — right-sized for one operator on a static site.

```
data/
  news/
    sources.json        ← source registry: url, beat, tier, lang, filters, needs_ua
    2026-W28.json       ← one append-only ledger file per ISO week
    2026-W27.json
    wire.json           ← rolling 72h view; the ONLY file the site reads
    health.json         ← per-source: last_success, items_7d, consecutive_failures
  email/
    2026-W28.fetched.json  ← full text of shortlisted items = the citation ground truth
    2026-W28.draft.json
    2026-W28.final.json
```

One item in the weekly ledger:

```json
{
  "id": "a3f9c21e04b7",
  "url": "https://www.elfinanciero.com.mx/empresas/...",
  "title": "Femsa compra ...",
  "dek": "first ~300 chars of the RSS description",
  "source": "elfinanciero.com.mx",
  "tier": 2,
  "beat": "companies",
  "lang": "es",
  "published_at": "2026-07-09T14:30:00Z",
  "first_seen": "2026-07-09T18:00:12Z",
  "cluster": "c-0712-femsa",
  "score": 7,
  "email": { "week": "2026-W28", "room": "companies", "rank": 2 }
}
```

The design choices that keep this simple and durable:

- **Key = hash of the canonical URL** (https, host lowercased, query/UTM stripped). Same story re-served by a feed → same id → skipped. Dedup check looks at the current + previous week's file to catch feeds that replay old items.
- **Cross-outlet dedup is clustering, not deletion.** Five outlets covering the same deal is *signal* (it feeds the corroboration prior), so all five records stay; the Saturday job stamps them with a shared `cluster` id.
- **No article bodies in the ledger.** Headlines + deks keep a week's file around 0.5–1 MB (~300–500 items/day post-filter). Full text is fetched only Saturday, only for the ~30 finalists, into `fetched.json` — which doubles as the file the citation validator checks against. The no-hallucination guard is literally a file.
- **Bounded by construction.** The site fetches only `wire.json`. Old weekly files just sit in the repo (~50 MB/year worst case — fine); if it ever bothers you, a yearly job strips deks from items older than 90 days.
- **Scores live in the ledger.** The Saturday job writes `cluster`, `score`, and `email` placement back into the week file, so the archive is also the historical record of what ranked and what shipped — free training data for tuning the scorer later.
- **Adding a source = one line in `sources.json`,** not a new script. One generic RSS fetcher covers everything in phase 1 (El Financiero, Bloomberg Línea, and El Economista all run Arc XP — same feed shape; the WordPress feeds are all identical too).

## 5. Where the guards live

Three mechanical guards plus one human tap, at four distinct points:

1. **Allowlist at the gate (collector).** A domain not in `sources.json` or the GDELT allowlist never enters the ledger. Google News items are filtered to allowlisted domains before writing.
2. **Evidence file before summarization (Saturday, step 6→7).** The summarizer's context contains only text from `fetched.json`. Paywalled/failed fetches are marked `fetch_failed` and can appear as headline + link only — never summarized. The model physically cannot summarize from memory because the only material it sees is the fetched text.
3. **URL validation after drafting (Saturday, step 8).** Code — not the model — extracts every URL from the draft and asserts membership in `fetched.json`. One invented or mutated link fails the whole build and pings you. Invented citations die mechanically, not by review.
4. **Your Sunday tap (the only human step).** The preview issue shows the draft plus a footer listing any sources that went dark that week. 👍 sends Monday; no reaction sends nothing. Start approve-to-send; once you trust it (say 8 clean weeks), flip to send-unless-veto so a missed Sunday doesn't kill the Monday brief.

## 6. Build sequence

Each step ships something usable on its own.

**Phase 1 — a real weekly email (≈2 weekends of work).**
1. `sources.json` + generic `fetch-rss.js` (UA header, retry, per-source keyword filters). Wire the ~20 phase-1 sources. Half a day: it's one fetcher and a config file.
2. Weekly ledger + dedup + `wire.json`; point the site's Wire at it. The site immediately gets 20 sources instead of GDELT alone.
3. `build-email.js`: cluster → prior → LLM score → shortlist → fetch → summarize → validate → draft + preview page + Sunday issue. API key lives in Actions secrets — never touches the static site.
4. `prepare-beehiiv-review` + Beehiiv Post Builder. Run two shadow issues, then keep the final test and send manual. The repository never receives a delivery secret.

**Phase 2 — the scrape lane + hardening (after ~2 clean sends).**
5. BMV Eventos Relevantes and CNBV boletines scrapers (the two highest-value primaries), then Banxico comunicados/statement-on-trigger and USTR press.
6. Health alerts: workflow fails loudly when an anchor source is dark >24h; "sources dark" footer in the Sunday preview.
7. UA-hardened attempts at El Economista and Forbes; if they keep blocking, leave them to GDELT permanently and stop fighting.

**Phase 3 — compounding.**
8. DOF cross-linking (badge press items backed by an official DOF/FR entry); public archive pages of past briefs; scorer tuning from the accumulated `score` history.

The dependency is deliberate: the collector feeds the site from day one, the ledger the collector builds is the exact input the email needs, and the email's evidence file is the exact input the validator needs. Nothing gets built twice.

## 7. The riskiest piece

**Silent source decay.** Not hallucination — that's structurally contained by the evidence file plus mechanical URL validation plus your Sunday read. The uncovered risk is that Mexican feeds rot quietly: Cloudflare starts 403-ing, an outlet migrates CMS, a feed URL dies — and nothing *errors*, the pipeline just collects less. Six weeks later the Payments room is thin and you don't know why. Half the sources in the research already showed bot-blocking behavior; this **will** happen.

De-risk with four cheap moves: (1) `health.json` updated every run — per-source last success and 7-day item count; (2) the collector workflow **fails loudly** (GitHub emails you) when any anchor source (DOF, iupana, El Financiero, LatamList) is dark for 4 consecutive runs; (3) the Sunday preview footer lists that week's dark sources, so monitoring lives inside the product you already read weekly; (4) GDELT stays as the backstop lane, so losing any single feed degrades coverage instead of blanking a room. Detection is the whole game — every individual fix is a 10-minute URL swap, but only if you know within a day, not within a month.
