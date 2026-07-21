// lint.js — the deterministic gate on model-written lead summaries. Fable's Fork 1:
// voice is enforced by code, not hoped for in a prompt. Every LLM summary runs
// through this. A HARD failure (em-dash, hype word) triggers one regeneration; any
// remaining flags are annotated in the approval preview so the human gate is a
// 30-second scan, not a rewrite. Only applied to model output, never to source deks.

const HYPE = /\b(robust|dynamic|landscape|poised|leverage|unlock|game[- ]?changer|pivotal|thrilled|excited|cutting[- ]edge|state[- ]of[- ]the[- ]art|transformative|revolutioniz\w*|best[- ]in[- ]class|unprecedented|seamless|in today's world)\b/i;
// Only flag claims that reference OUR prior coverage (those need a cited issue date).
// In-article continuity that the article itself states ("a second straight meeting")
// is sourced and fine, so it is deliberately not matched here.
const CONTINUITY = /\b(last (week|issue)|as (we|this brief) (noted|reported|flagged|wrote)|prior issue|week\s+\d+\s+of|in our (last|prior)|we (noted|reported|flagged) (last|earlier))\b/i;
const HASDATE = /\b(20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|W\d{2}|issue \d)\b/i;

const sentences = (s) => (s || '').split(/[.!?]+(?=\s|$)/).map((x) => x.trim()).filter(Boolean);
const hasNumber = (s) => /\d/.test(s || '') || /\b(one|two|three|four|five|six|seven|eight|nine|ten|dozen|record|first|half|double|triple)\b/i.test(s || '');

// A prompt is not an accuracy gate. This guard is for REPORT copy that can reach a
// public surface without a line edit (event context and topic syntheses). It rejects
// style drift and, critically, any numeral the model did not receive in its inputs.
// We compare literal numeric tokens on purpose: silently rounding 3.37 to 3.4 is still
// a new claim and should be done by deterministic code, not prose generation.
const AI_TICS = /\b(delve|dive into|rich tapestry|vibrant|think of it as|let'?s unpack|the real story is|here'?s the thing|it turns out|remains to be seen|at the end of the day|isn'?t just\b[^.]{0,80}\bit'?s)\b/i;
// These are not necessarily false. They are editorial shortcuts that make a factual
// context line sound like a pundit or a model performing certainty. Public REPORT
// copy should state the supported consequence instead of announcing that it is the
// biggest, sharpest, central, or defining story. This is intentionally narrower than
// a general style checker: it protects the automated surfaces, not Alan's essays.
const EDITORIALIZING = /\b(biggest overhang|sharpest escalation|story of the moment|this is the print|freshest print|central (?:monetary |political |economic )?pivot|the whole [^.]{0,70}\b(?:rests|is an open question)|story is (?:still )?intact|first read on how|board is being set|a bet on)\b/i;
const numericTokens = (s) => (String(s || '').match(/\d+(?:[.,]\d+)*/g) || [])
  .map((x) => x.replace(/,/g, '').replace(/^0+(?=\d)/, ''));

export function lintReportText({ text = '', inputs = [], maxWords = 45, maxSentences = 2 }) {
  const flags = [];
  const clean = String(text || '').trim();
  if (!clean) return { ok: false, flags: ['empty report text'] };
  if (/[—–]|(?:^|\s)--(?:\s|$)/.test(clean)) flags.push('em-dash');
  if (/;/.test(clean)) flags.push('semicolon');
  const hype = clean.match(HYPE); if (hype) flags.push(`hype: "${hype[0]}"`);
  const tic = clean.match(AI_TICS); if (tic) flags.push(`AI tic: "${tic[0]}"`);
  const editorial = clean.match(EDITORIALIZING); if (editorial) flags.push(`editorial shorthand: "${editorial[0]}"`);
  if (/\.{3}|…/.test(clean)) flags.push('ellipsis or truncated copy');
  const words = clean.split(/\s+/).filter(Boolean).length;
  if (words > maxWords) flags.push(`${words} words (cap ${maxWords})`);
  const count = sentences(clean).length;
  if (count > maxSentences) flags.push(`${count} sentences (cap ${maxSentences})`);

  const allowed = new Set(numericTokens(inputs.join(' ')));
  const unsupported = [...new Set(numericTokens(clean).filter((n) => !allowed.has(n)))];
  if (unsupported.length) flags.push(`unsupported number${unsupported.length === 1 ? '' : 's'}: ${unsupported.join(', ')}`);
  return { ok: flags.length === 0, flags };
}

// ---- slop gate (Fable audit 2026-07-16): the hard, objective junk filter ----
// Distinct from the style lint above. lintReportText judges TASTE on model output
// (hype, tics, unsupported numbers) and triggers a regeneration. This judges whether
// a candidate is RAW SOURCE JUNK that must never publish and must be purged if already
// stored: untranslated source language, WordPress feed boilerplate, mid-sentence
// truncation, or a missing source link/date. The copy contract is clean English, one
// or two whole sentences, every item dated and linked. Failure = quarantine, never
// publish-raw. Seeded from the known 2026-07 fallback pollution as a regression set.
const FEED_BOILERPLATE = /\bla publicaci[oó]n\b|appeared first on|\bthe post\b|contin[uú]a leyendo|continue reading|read more|leer m[aá]s|\[\s*[…\.]{2,}\s*\]/i;
// Unambiguous Spanish function words + dead giveaways (mdp/mdd = millones de pesos/
// dólares). Cognates and single letters are excluded to avoid English false positives
// ("de" in "Círculo de Crédito" is one hit; the bar is two). Two or more = untranslated.
const SPANISH = /\b(de|del|la|el|los|las|un|una|unos|unas|por|con|que|para|se|su|sus|al|lo|m[aá]s|seg[uú]n|ante|entre|sobre|desde|hasta|pero|como|este|esta|estos|estas|ya|y|mdp|mdd|sexenio|arancel|aranceles|empresas?|gobierno|millones|d[oó]lar|d[oó]lares)\b/gi;
const spanishDominant = (s) => (String(s || '').match(SPANISH) || []).length >= 2;
const endsClean = (s) => /[.!?]["'”’)\]]?$/.test(String(s || '').trim());

// Objective slop flags for an event-log entry. `context`/`why` carries the public copy.
export function slopFlags(ev = {}) {
  const flags = [];
  const title = String(ev.title || '').trim();
  const body = String(ev.context || ev.why || '').trim();
  if (!title) flags.push('empty title');
  if (!ev.url) flags.push('no source link');
  if (!ev.date) flags.push('no date');
  if (FEED_BOILERPLATE.test(title + ' ' + body)) flags.push('feed boilerplate');
  if (spanishDominant(title)) flags.push('non-English title');
  // "20,000 million dollars" is a calque of "20,000 millones de dólares": garbled in English
  // and ambiguous (Audit 2026-07-20: one reached the homepage as an Apollo headline).
  if (/\b\d{1,3},\d{3}\s+millions?\s+(?:dollars|pesos|d[oó]lares)/i.test(title + ' ' + body)) flags.push('money calque (N,000 million)');
  if (body && spanishDominant(body)) flags.push('non-English context');
  if (body && !endsClean(body)) flags.push('truncated context');
  return flags;
}
export const isSlop = (ev) => slopFlags(ev).length > 0;

// Returns { ok, hard, flags[] }. hard = a violation worth one regeneration attempt.
export function lintSummary({ summary = '', why = '' }) {
  const flags = [];
  let hard = false;
  const both = summary + ' ' + why;

  if (/[—–]|(?:^|\s)--(?:\s|$)/.test(both)) { flags.push('em-dash'); hard = true; }
  const hype = both.match(HYPE);
  if (hype) { flags.push(`hype: "${hype[0]}"`); hard = true; }

  const sN = sentences(summary).length;
  if (sN === 0) { flags.push('empty summary'); hard = true; }
  else if (sN > 3) flags.push(`${sN} sentences (want 2-3)`);

  if (summary && !hasNumber(sentences(summary)[0] || '')) flags.push('lede has no number');

  const wN = sentences(why).length;
  if (wN > 1) flags.push(`why is ${wN} sentences (want 1)`);

  if (CONTINUITY.test(both) && !HASDATE.test(both)) flags.push('continuity claim without a cited date');

  if (/\byou(r|rs|'re|’re)?\b/i.test(both)) flags.push("addresses the reader ('you')");

  return { ok: flags.length === 0, hard, flags };
}
