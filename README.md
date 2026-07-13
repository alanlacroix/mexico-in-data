# Mexico

A living, public, source-honest model of the Mexican economy — plus the research and the relationships behind it.

Built by Alan. One country, deeply understood, kept current, and shown clearly.

## What this is

Three things under one roof and one design system:

1. **The live model** — the Mexican economy as an interactive, always-current dashboard: real indicators from official APIs, calculators, and a causal model you can pull levers on. Anyone can visit; the data feeds itself.
2. **The research** — briefings and analysis (macro, trade, demographics, capital deployment), published for others to read. Every number carries a direct source link.
3. **The CRM** — a private tracker of the people worth knowing and reaching out to: trade negotiators, economists, fintech founders, investors — with sourced backgrounds and outreach status.

## Design law

White paper, black ink, McKinsey exhibit discipline, Mexican flag **green + red** as the only accents. Every chart is a numbered *Exhibit* with a conclusion-title, units, footnotes, and a **Source:** line. See [`design/DESIGN-SYSTEM.md`](design/DESIGN-SYSTEM.md). The stylesheet is [`design/mckinsey-mx.css`](design/mckinsey-mx.css).

## Structure

```
mexico/
  README.md            — this file
  PRODUCT-BIBLE.md     — THE locked product definition (start here; supersedes SITE-SPEC.md)
  HOSTING.md           — how the public live site runs at ~zero cost
  DATA-SOURCES.md      — the audited source registry (what data, how granular, license)
  PIPELINE.md          — the accuracy-first data-connector spine (architecture + how to run)
  index.html           — the hero: live pulse strip + municipio choropleth (Exhibit 1)
  design/
    DESIGN-SYSTEM.md    — the design + tone law (copy this on every page)
    mckinsey-mx.css     — the shared house stylesheet
  site/                 — additional pages (health = "Estado de los datos", + crm)
  pipeline/             — the connectors, harness, and frozen crosswalks (Node, no runtime LLM)
  data/                 — the served static JSON: series/ (pulse), layers/ (map), geo/, health.json
```

## Build status (v1 spine — live)

The connector spine is built and running: **9 live sources** (CRE fuel every 4h, World Bank GDP/inflation/population), a **municipio poverty choropleth** (CONEVAL 2020, 2,466/2,478 municipios) as the opening Exhibit-1 story, and a machine-generated **data-health page**. Sources awaiting free tokens (Banxico, INEGI) or their monthly cycle (IMSS employment — the crown-jewel live layer) **fail closed and say so** rather than guessing. Architecture ratified by Fable; see [PIPELINE.md](PIPELINE.md).

## Published so far (prototypes, to be folded into the site's house style)

- Data briefing — *Mexico 2026, A Living Portrait* — https://claude.ai/code/artifact/ee1ed82e-78a5-4c57-a859-83dc68b61b22
- Interactive causal model — *The Mexico Machine* — https://claude.ai/code/artifact/9f4ac3b8-93ca-4555-a444-991ec51b05fd
- Allocator memo — *Deploying Capital into Mexico* — https://claude.ai/code/artifact/135c0914-df94-47b9-bcc8-3d746a9c364b
- Intelligence desk (McKinsey-styled hub) — https://claude.ai/code/artifact/34e29673-f16c-436c-9824-eb52d7552b72

## The goal

A site anyone can visit that stays up to date on its own — fed by live data feeds, refreshed by a scheduled routine, hosted for free. Understand the economy, show it clearly, and keep the people who move it one click away.
