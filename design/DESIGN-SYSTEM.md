# McKinsey-MX — the design + tone law

Copy this on every page. The look is McKinsey: white paper, black ink, exhibit discipline. The only accents are the Mexican flag's **green** and **red**. The tweak that makes it ours — about 5% — is a warmer editorial serif and a hairline green rule under each section. Clean, formal, easy to read.

## Color

| Token | Hex | Use |
|---|---|---|
| Paper | `#ffffff` | background — always pure white |
| Ink | `#141414` | headings |
| Ink-2 | `#333333` | body text |
| Muted | `#6f6f6f` | captions, labels, footnotes |
| **Green** | `#0a7d4d` | primary accent: links, exhibit numbers, positive/attractive |
| **Red** | `#c8102e` | emphasis, negative/concern, alerts |
| Amber | `#a6791a` | neutral / watch — use sparingly |
| Line | `#e6e6e2` | hairline rules |

Discipline: the page is 95% black-on-white. Green and red appear only where they carry meaning — a verdict, a link, a section rule. Never decorate with color.

## Type (the 5% tweak)

- **Display / headings:** Fraunces (webfont) → falls back to Iowan Old Style / Charter / Georgia. A touch warmer and more editorial than McKinsey's Bower — this is the deliberate difference.
- **Body:** Inter → system-ui fallback. Set at 17px / 1.62 line-height, a little more generous than corporate-tight, for readability.
- **Data, labels, sources:** IBM Plex Mono. Uppercase, letter-spaced for eyebrows; tabular-nums wherever digits align.

## The Exhibit — copied from McKinsey, kept exactly

Every chart or table is an *Exhibit*. It always has, in this order:

1. **`Exhibit N`** — mono eyebrow, green.
2. **A conclusion-title** — the takeaway, not the topic. *"Mexico is a high-carry, low-growth credit,"* not *"Interest rates."* Serif.
3. **A units subtitle** — mono, gray. *"Real policy rate, %, mid-2026."*
4. The chart or table.
5. **Footnotes** — numbered (¹ ² ³), for every assumption.
6. **A `Source:` line** — mono, small, with a live link. Never omit it.

This template is the honesty system. A number without a Source line does not ship.

## Tone — McKinsey word choice

- Open with a fact, not a setup. First sentence is a number or a concrete observation.
- Short, declarative sentences. Escalate: fact, fact, fact.
- Quantify everything. Replace adjectives with numbers.
- Structure as named frameworks (three horizons, five forces, the four constraints).
- Takeaway-first: state the conclusion, then support it.
- Active voice, "we," no hype. No buzzwords. Name the weakest part of the argument out loud.

## Section header pattern

```html
<div class="section-head">
  <span class="no">01</span>
  <h2>The conclusion, stated as a title.</h2>
  <p class="dek">One line of context.</p>
</div>
```

The `2px` green top rule is the signature. Everything else stays McKinsey-plain.
