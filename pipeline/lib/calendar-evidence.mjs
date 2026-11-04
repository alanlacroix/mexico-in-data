import crypto from 'node:crypto';

// Calendar anchors help order candidate events. They are not necessarily dates
// established by the source. Keep uncertainty in text: the independent audit
// deliberately receives only evidence IDs and text, not calendar metadata.
export const CALENDAR_DATE_CONTRACT = 'Preserve calendar date precision and uncertainty in both languages. An approximate calendar estimate is not a confirmed date. A year-only calendar record supports that year, not a month or day. Reject any more precise or certain date unless another cited source explicitly establishes it.';

export function calendarEvidenceRecord(event) {
  const approximate = event.approx === true;
  const yearOnly = event.datePrecision === 'year';
  const date = yearOnly ? String(event.date).slice(0, 4) : event.date;
  const timing = yearOnly
    ? `${date} (year only; exact month and day are not established by this calendar source)`
    : approximate ? `${date} (approximate scheduling estimate, not a confirmed exact date)` : date;
  // Do not leak a placeholder month/day through the ID either. Hash the event
  // identity, not its sorting date, so shifting an approximate anchor is harmless.
  const id = approximate || yearOnly
    ? `estimate-${crypto.createHash('sha256').update(JSON.stringify([event.id || '', event.label, event.sourceUrl])).digest('hex').slice(0, 16)}`
    : event.id || event.date;
  return {
    id: `calendar:${id}`, kind: 'calendar', source: event.source, url: event.sourceUrl,
    text: `${timing}: ${event.label}. ${event.mechanism || ''}`,
  };
}

const MONTHS = [
  ['january', 'enero'], ['february', 'febrero'], ['march', 'marzo'], ['april', 'abril'],
  ['may', 'mayo'], ['june', 'junio'], ['july', 'julio'], ['august', 'agosto'],
  ['september', 'septiembre'], ['october', 'octubre'], ['november', 'noviembre'], ['december', 'diciembre'],
];
function dateClaims(text) {
  const claims = [];
  const value = String(text || '');
  for (const match of value.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    claims.push({ year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), start: match.index, end: match.index + match[0].length });
  }
  for (const [index, names] of MONTHS.entries()) {
    // Capitalized English May avoids treating the modal verb as a month.
    const name = names[0] === 'may' ? '(?:May|[Mm][Aa][Yy][Oo])' : `(?:${names.join('|')})`;
    const flags = names[0] === 'may' ? 'g' : 'gi';
    const pattern = new RegExp(`\\b(?:(\\d{1,2})(?:st|nd|rd|th)?(?: de)?\\s+)?${name}\\b(?:\\s+(\\d{1,2})(?:st|nd|rd|th)?(?!\\d))?(?:(?:,?\\s+| de | del )(20\\d{2}))?`, flags);
    for (const match of value.matchAll(pattern)) {
      claims.push({ month: index + 1, day: Number(match[1] || match[2]) || null, year: Number(match[3]) || null, start: match.index, end: match.index + match[0].length });
    }
  }
  return claims;
}
const supports = (source, claim) => source.month === claim.month
  && (!claim.day || source.day === claim.day) && (!claim.year || source.year === claim.year);

// Scope this additional guard to fields citing uncertain calendar records. Date
// tokens need their own support, not unrelated numbers elsewhere in the packet.
export function calendarDateFlags(text, evidence) {
  const uncertain = evidence.filter(record => record.kind === 'calendar'
    && /\(year only;|\(approximate scheduling estimate,/.test(record.text));
  if (!uncertain.length) return [];
  const independent = evidence.filter(record => !uncertain.includes(record)).flatMap(record => dateClaims(record.text));
  const claims = dateClaims(text);
  const estimates = uncertain.filter(record => record.text.includes('(approximate scheduling estimate,'))
    .flatMap(record => dateClaims(record.text));
  // A qualifier must belong to this date phrase, not another claim in the field.
  const qualified = claim => /\b(?:approximately|approximate|tentatively|tentative|estimated|around|aproximad[oa](?:mente)?|tentativ[oa]|estimad[oa])\s+(?:(?:on|in|for|the|el|en|para|de|scheduled)\s+){0,3}$/i
    .test(String(text).slice(Math.max(0, claim.start - 80), claim.start));
  return claims.some(claim => !independent.some(source => supports(source, claim))
    && !(qualified(claim) && estimates.some(source => supports(source, claim))))
    ? ['calendar date precision or certainty is unsupported'] : [];
}
