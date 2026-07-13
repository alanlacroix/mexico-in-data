# Build spec — /economy ("The Economy — what Mexico is made of")

**Verdict: BOTH — a new room `/economy`, plus Q4 on the Briefing rebuilt as a one-chart teaser that links into it.**

## 1. Page or section?

**New room, decided.** Reasoning against the two goals:

- **Zero-context outsider:** "What is this economy made of?" is the anatomy question every other surface presupposes. The Briefing gives answers, `/model` gives causality, `/atlas` gives geography — nothing gives the body. This is the missing organ, not a 13th question.
- **Don't overwhelm the Briefing:** the material spans four researched topics and ~8 exhibits. Q4 cannot hold that without breaking the 12-question scannability rule I set. So Q4 shrinks to: one-line answer + the sector composition bar + "Enter the room →".
- **Why it earns first-new-room status:** the room architecture was designed for exactly this — a question that outgrows its Briefing slot. `/economy` is the same pattern instantiated, not a new pattern. And Alan asked for it by name; the only open question was form.

Rule to hold: **charts lead, prose is captions (≤2 sentences each), every figure keeps its source link** — same sourcing discipline as `/data`.

## 2. The exhibits, in order (a narrative arc, not a dashboard)

| # | Exhibit | Chart type | Data | Teaches |
|---|---|---|---|---|
| 1 | **Hero band** | 4 stat tiles, no chart | $1.83T GDP · ~#13 world · +1.35% (2024) · $617bn exports | Scale, in 3 seconds |
| 2 | **What Mexico makes** | One horizontal 100% stacked bar | Services 58.7 / Industry 31.0 (manufacturing 20.1 shown as a bracketed sub-segment, NOT stacked separately) / Agriculture 3.9 / "Net taxes on products" ~6.5 remainder | It's a services economy with an unusually big factory floor |
| 3 | **Who spends it** | Diverging stacked bar (imports below the zero line) | C 70.7 + G 11.6 + I 23.8 + X 37.3 − M 38.1 ≈ 100; footnote the ~5% inventories/discrepancy residual | Consumption dominates; trade is huge on both sides and nets to ~zero |
| 4 | **Growth** | Line, 2020–24 | −8.4 → +6.0 → +3.7 → +3.1 → +1.35 | The post-COVID rebound is spent; 2024 was a sharp deceleration |
| 5 | **The machine** | Dual line 2015–24 (exports vs imports, $bn) + one 100% bar of imports by use | $617.1 vs $625.3bn, −$8.2bn; intermediate 75.6% / consumer 14.5% / capital 9.8% | **The thesis chart.** The deficit is structural, not weakness: Mexico imports parts, exports products |
| 6 | **One customer, many suppliers** | Paired ranked bars, side by side | Exports: US ~80% (show as range 80–83%), rest small. Imports: US ~40s% (range), China ~21% ($129.8bn), others | The asymmetry: a one-customer export story, a multi-supplier import story — with a ~$120bn China deficit feeding US-bound factories |
| 7 | **What comes in / what goes out** | Two ranked-bar columns | In: office-machine parts 34.8, computers 33.3, vehicle parts 32.2, ICs 28.9, refined petroleum 24.6 (OEC). Out: autos $193.9bn + "manufactured = 89.8% of exports"; full top-5 export list **NOT-YET-WIRED** | The imports ARE factory feedstock; the flagship output is cars |
| 8 | **The other economy** | Dumbbell ×2 | Informal: 55% of workers → 25.4% of GDP; formal: 45% → 74.6%. Second dumbbell: Oaxaca 80.1% vs Coahuila 33.3% informality | Half the country works off the books and produces a quarter of the output; the north/south divide is the same fact drawn on a map |
| 9 | **Dollars from the north** | Ranked bars, 3 marks | Remittances 64.75 > FDI 36.9 > tourism 33.0 ($bn, 2024); caption: 96.6% of remittances from the US | Even the non-factory dollars come from the US — the weld is total |

**CUT (explicitly):** minimum-wage series, labor-force participation, sector employment shares (one caption line under #8 max), quarterly informality series, FDI sub-breakdowns (the 77.9%-reinvested nuance = one caption line), oil fiscal share (one caption line under #9: "oil is now only ~11% of public revenue — this list replaced it"), exports/imports as %-of-GDP series (redundant with #5). Nine exhibits, ~7 charts, zero tables of raw figures — anything more is `/data`'s job.

## 3. The one-line thesis

**"Mexico is a US-welded assembly economy — it imports parts and exports cars — running on top of a second, informal economy that employs half the country."**

Every exhibit either proves the weld (#5, 6, 7, 9) or shows the body it's welded to (#2, 3, 4, 8). Print it as the room's subtitle.

## 4. Data gaps — flag NOT-YET-WIRED, never fake

1. **Top export products ranked list** — research delivered only autos ($193.9bn) and "manufactured = 89.8%". Exhibit 7's export column ships partial with a NOT-YET-WIRED slot. Source to wire: OEC/UN Comtrade HS-level exports 2024.
2. **Exports by destination, per-country** — only "~80–83% US" exists. Show US as a labeled range; other destinations NOT-YET-WIRED.
3. **US import share** — 40%+ (US Census basis) vs ~44% (INEGI basis). Present as "40s%" range with a basis footnote, never a hard number.
4. **Import partners #3–6** (Taiwan, Korea, Japan, Germany) — named qualitatively, no figures. NOT-YET-WIRED.
5. **Growth line depth** — only 2020–24 researched; a 2000–2024 line would teach the "stuck at ~2%" truth. Flag for a follow-up pull (World Bank WDI, trivial).
6. **Vintage mismatch** — labor figures are Q4 2025, everything else 2024. Date-stamp every chart; don't blend into one "2024" claim.
7. Tourism $32.96bn carries the researcher's own "confirm vs Banxico final BoP" caveat — keep the caveat in the source note.

## 5. Build order

1. Room skeleton + hero band + thesis line (all data in hand, ships value immediately).
2. Exhibits 2–4 (composition + growth — the anatomy).
3. Exhibits 5–7 (the trade machine — the thesis core), with the NOT-YET-WIRED export slots visibly styled as such.
4. Exhibits 8–9 (two economies + money flows).
5. Rebuild Briefing Q4 as teaser (answer line + exhibit-2 bar + link) and add `/economy` to the room nav.
6. Follow-up data pull to wire gaps 1, 2, 5.

## Weakest part of this call

The room's single most on-thesis chart — **what Mexico actually exports, ranked by product** — is the one the research didn't deliver. At launch the room shows the machine's intake in full detail and its output as two numbers plus a placeholder; the "imports parts, exports cars" thesis is asserted more than drawn on the export side. Acceptable because the slot is honest, the fix is one Comtrade pull, and step 6 closes it — but if that pull slips, the room ships with its punchline half-drawn. Secondary risk: "both" creates a Q4/room duplication seam to maintain; the mitigation is that Q4 owns zero unique content — one bar, one link, nothing to drift.