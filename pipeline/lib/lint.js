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
